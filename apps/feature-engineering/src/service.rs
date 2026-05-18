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
