use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use tokio::sync::Mutex;
use trading_common::kafka::metadata::EventContext;
use trading_common::proto::tradingbot::events::{
    IndicatorFeatureValue, IndicatorFeatureVector, MarketDataBar,
};

use crate::consumer::{MarketDataHandler, ProcessingOutcome};
use crate::domain::{
    fallback_market_data_event_id, feature_vector_id, interval_to_millis, market_data_bar_identity,
    FeatureSeriesKey, MarketDataBarInput,
};
use crate::error::FeatureEngineeringError;
use crate::indicators::{format_feature_value, CoreFeatureCalculator, CORE_FEATURE_SET};
use crate::metrics::FeatureEngineeringMetrics;
use crate::publisher::FeaturePublisher;
use crate::warmup::WarmupGateway;

#[derive(Default)]
struct FeatureEngineeringState {
    calculators: HashMap<FeatureSeriesKey, CoreFeatureCalculator>,
    warmed_series: HashSet<FeatureSeriesKey>,
    processed_bars: HashSet<String>,
    published_vectors: HashMap<String, IndicatorFeatureVector>,
}

pub struct FeatureEngineeringService {
    warmup: Arc<dyn WarmupGateway>,
    publisher: Arc<dyn FeaturePublisher>,
    metrics: Arc<dyn FeatureEngineeringMetrics>,
    warmup_bars_limit: u32,
    state: Mutex<FeatureEngineeringState>,
}

impl FeatureEngineeringService {
    pub fn new(
        warmup: Arc<dyn WarmupGateway>,
        publisher: Arc<dyn FeaturePublisher>,
        metrics: Arc<dyn FeatureEngineeringMetrics>,
        warmup_bars_limit: u32,
    ) -> Self {
        Self {
            warmup,
            publisher,
            metrics,
            warmup_bars_limit,
            state: Mutex::new(FeatureEngineeringState::default()),
        }
    }

    async fn ensure_warmed(&self, bar: &MarketDataBarInput) -> Result<(), FeatureEngineeringError> {
        let key = FeatureSeriesKey::from_bar(bar);
        if self.state.lock().await.warmed_series.contains(&key) {
            return Ok(());
        }

        let prior_bars = self
            .warmup
            .get_prior_bars(bar, self.warmup_bars_limit)
            .await?;
        let mut state = self.state.lock().await;
        if state.warmed_series.contains(&key) {
            return Ok(());
        }

        let mut identities = Vec::new();
        let calculator = state.calculators.entry(key.clone()).or_default();
        for prior_bar in prior_bars {
            identities.push(market_data_bar_identity(&prior_bar));
            calculator.observe(&prior_bar);
        }
        state.processed_bars.extend(identities);

        state.warmed_series.insert(key);
        self.metrics.increment_warmups();
        Ok(())
    }
}

#[async_trait]
impl MarketDataHandler for FeatureEngineeringService {
    async fn handle_final_bar(
        &self,
        bar: MarketDataBar,
        source_context: EventContext,
    ) -> Result<ProcessingOutcome, FeatureEngineeringError> {
        interval_to_millis(&bar.interval)?;
        let input = MarketDataBarInput::from_proto(&bar)?;
        let vector_id = feature_vector_id(&input);

        if let Some(vector) = self
            .state
            .lock()
            .await
            .published_vectors
            .get(&vector_id)
            .cloned()
        {
            self.publisher.publish(&vector, &source_context).await?;
            self.metrics.increment_feature_vectors_published();
            return Ok(ProcessingOutcome::Published(vector.id));
        }

        let bar_identity = market_data_bar_identity(&input);
        if self
            .state
            .lock()
            .await
            .processed_bars
            .contains(&bar_identity)
        {
            self.metrics.increment_skipped_warmup_bars();
            return Ok(ProcessingOutcome::SkippedWarmup);
        }

        self.ensure_warmed(&input).await?;

        let maybe_vector = {
            let key = FeatureSeriesKey::from_bar(&input);
            let mut state = self.state.lock().await;
            let snapshot = {
                let calculator = state.calculators.entry(key).or_default();
                calculator.observe(&input)
            };
            state.processed_bars.insert(bar_identity);
            let source_event_id = source_context
                .event_id
                .clone()
                .unwrap_or_else(|| fallback_market_data_event_id(&bar));

            snapshot.map(|snapshot| IndicatorFeatureVector {
                id: vector_id.clone(),
                instrument_id: input.instrument_id.clone(),
                symbol: input.symbol.clone(),
                venue: input.venue.clone(),
                interval: input.interval.clone(),
                open_time_ms: input.open_time_ms,
                close_time_ms: input.close_time_ms,
                source_event_id,
                feature_set: CORE_FEATURE_SET.to_string(),
                features: snapshot
                    .values
                    .into_iter()
                    .map(|feature| IndicatorFeatureValue {
                        name: feature.name.to_string(),
                        value: format_feature_value(feature.value),
                    })
                    .collect(),
                calculated_at: Utc::now().to_rfc3339(),
            })
        };

        let Some(vector) = maybe_vector else {
            self.metrics.increment_skipped_warmup_bars();
            return Ok(ProcessingOutcome::SkippedWarmup);
        };

        self.state
            .lock()
            .await
            .published_vectors
            .insert(vector.id.clone(), vector.clone());
        self.publisher.publish(&vector, &source_context).await?;
        self.metrics.increment_feature_vectors_published();

        Ok(ProcessingOutcome::Published(vector.id))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use async_trait::async_trait;

    use crate::metrics::NoopFeatureEngineeringMetrics;

    use super::*;

    struct StaticWarmupGateway {
        prior_bars: Vec<MarketDataBarInput>,
        calls: Mutex<u32>,
    }

    #[async_trait]
    impl WarmupGateway for StaticWarmupGateway {
        async fn get_prior_bars(
            &self,
            _bar: &MarketDataBarInput,
            _limit: u32,
        ) -> Result<Vec<MarketDataBarInput>, FeatureEngineeringError> {
            let mut calls = self.calls.lock().expect("calls mutex poisoned");
            *calls += 1;
            Ok(self.prior_bars.clone())
        }
    }

    struct RecordingFeaturePublisher {
        vectors: Mutex<Vec<IndicatorFeatureVector>>,
        contexts: Mutex<Vec<EventContext>>,
    }

    #[async_trait]
    impl FeaturePublisher for RecordingFeaturePublisher {
        async fn publish(
            &self,
            vector: &IndicatorFeatureVector,
            source_context: &EventContext,
        ) -> Result<(), FeatureEngineeringError> {
            self.vectors
                .lock()
                .expect("vectors mutex poisoned")
                .push(vector.clone());
            self.contexts
                .lock()
                .expect("contexts mutex poisoned")
                .push(source_context.clone());
            Ok(())
        }
    }

    fn input_bar(index: i64, close: f64) -> MarketDataBarInput {
        MarketDataBarInput {
            instrument_id: "instrument-1".to_string(),
            symbol: "BTCUSDT".to_string(),
            venue: "BINANCE".to_string(),
            interval: "1m".to_string(),
            open_time_ms: 1_775_044_800_000 + index * 60_000,
            close_time_ms: 1_775_044_859_999 + index * 60_000,
            close,
        }
    }

    fn proto_bar(index: i64, close: f64) -> MarketDataBar {
        let input = input_bar(index, close);
        MarketDataBar {
            instrument_id: input.instrument_id,
            symbol: input.symbol,
            venue: input.venue,
            interval: input.interval,
            open_time_ms: input.open_time_ms,
            close_time_ms: input.close_time_ms,
            open: close.to_string(),
            high: close.to_string(),
            low: close.to_string(),
            close: close.to_string(),
            volume: "1".to_string(),
            quote_volume: close.to_string(),
            trade_count: 1,
            is_final: true,
        }
    }

    fn context(event_id: &str) -> EventContext {
        EventContext {
            event_id: Some(event_id.to_string()),
            correlation_id: Some("workflow-1".to_string()),
            causation_id: None,
            traceparent: None,
        }
    }

    fn build_service(
        warmup: Arc<StaticWarmupGateway>,
        publisher: Arc<RecordingFeaturePublisher>,
    ) -> FeatureEngineeringService {
        FeatureEngineeringService::new(
            warmup,
            publisher,
            Arc::new(NoopFeatureEngineeringMetrics),
            120,
        )
    }

    #[tokio::test]
    async fn does_not_publish_until_core_feature_window_is_ready() {
        let warmup = Arc::new(StaticWarmupGateway {
            prior_bars: Vec::new(),
            calls: Mutex::new(0),
        });
        let publisher = Arc::new(RecordingFeaturePublisher {
            vectors: Mutex::new(Vec::new()),
            contexts: Mutex::new(Vec::new()),
        });
        let service = build_service(warmup.clone(), publisher.clone());

        for i in 0..34 {
            let outcome = service
                .handle_final_bar(proto_bar(i, 100.0 + i as f64), context(&format!("raw-{i}")))
                .await
                .unwrap();
            assert_eq!(outcome, ProcessingOutcome::SkippedWarmup);
        }

        assert!(publisher
            .vectors
            .lock()
            .expect("vectors mutex poisoned")
            .is_empty());
        assert_eq!(*warmup.calls.lock().expect("calls mutex poisoned"), 1);
    }

    #[tokio::test]
    async fn warms_from_data_ingestion_and_publishes_ready_vector() {
        let prior_bars = (0..34)
            .map(|i| input_bar(i, 100.0 + i as f64))
            .collect::<Vec<_>>();
        let warmup = Arc::new(StaticWarmupGateway {
            prior_bars,
            calls: Mutex::new(0),
        });
        let publisher = Arc::new(RecordingFeaturePublisher {
            vectors: Mutex::new(Vec::new()),
            contexts: Mutex::new(Vec::new()),
        });
        let service = build_service(warmup.clone(), publisher.clone());

        let outcome = service
            .handle_final_bar(proto_bar(34, 134.0), context("market-event-35"))
            .await
            .unwrap();

        assert_eq!(
            outcome,
            ProcessingOutcome::Published("feat:instrument-1:1m:1775046840000:core-v1".to_string())
        );
        assert_eq!(*warmup.calls.lock().expect("calls mutex poisoned"), 1);

        let vectors = publisher.vectors.lock().expect("vectors mutex poisoned");
        assert_eq!(vectors.len(), 1);
        assert_eq!(vectors[0].source_event_id, "market-event-35");
        assert_eq!(vectors[0].feature_set, CORE_FEATURE_SET);
        assert_eq!(vectors[0].features.len(), 9);
        assert_eq!(vectors[0].features[0].name, "sma.close.20");
        assert_eq!(vectors[0].features[0].value, "124.5");
    }

    #[tokio::test]
    async fn duplicate_raw_bar_republishes_same_deterministic_vector_id() {
        let prior_bars = (0..34)
            .map(|i| input_bar(i, 100.0 + i as f64))
            .collect::<Vec<_>>();
        let warmup = Arc::new(StaticWarmupGateway {
            prior_bars,
            calls: Mutex::new(0),
        });
        let publisher = Arc::new(RecordingFeaturePublisher {
            vectors: Mutex::new(Vec::new()),
            contexts: Mutex::new(Vec::new()),
        });
        let service = build_service(warmup.clone(), publisher.clone());
        let current_bar = proto_bar(34, 134.0);

        let first = service
            .handle_final_bar(current_bar.clone(), context("market-event-35"))
            .await
            .unwrap();
        let second = service
            .handle_final_bar(current_bar, context("market-event-35"))
            .await
            .unwrap();

        assert_eq!(first, second);
        let vectors = publisher.vectors.lock().expect("vectors mutex poisoned");
        assert_eq!(vectors.len(), 2);
        assert_eq!(vectors[0].id, vectors[1].id);
        assert_eq!(vectors[0].source_event_id, vectors[1].source_event_id);
    }
}
