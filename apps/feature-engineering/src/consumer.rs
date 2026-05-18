use std::sync::Arc;

use async_trait::async_trait;
use prost::Message;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::Headers;
use rdkafka::{ClientConfig, Message as KafkaMessage};
use tracing::{error, info, instrument, warn};

use trading_common::kafka::consumer::{with_retry, RetryConfig};
use trading_common::kafka::dlq::{DeadLetterPayload, DlqPublisher};
use trading_common::kafka::metadata::resolve_event_context;
use trading_common::kafka::topics::{MARKET_RAW_DATA, MARKET_RAW_DATA_DLQ};
use trading_common::proto::tradingbot::events::MarketDataBar;

use crate::config::AppConfig;
use crate::domain::{fallback_market_data_event_id, interval_to_millis};
use crate::error::FeatureEngineeringError;
use crate::metrics::FeatureEngineeringMetrics;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProcessingOutcome {
    SkippedNonFinal,
    SkippedWarmup,
    Published(String),
    DeadLettered,
}

#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait MarketDataHandler: Send + Sync {
    async fn handle_final_bar(
        &self,
        bar: MarketDataBar,
        source_context: trading_common::kafka::metadata::EventContext,
    ) -> Result<ProcessingOutcome, FeatureEngineeringError>;
}

#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait DeadLetterPublisher: Send + Sync {
    async fn publish_dead_letter(
        &self,
        record: DeadLetterRecord,
    ) -> Result<(), FeatureEngineeringError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeadLetterRecord {
    pub original_topic: String,
    pub original_key: Option<String>,
    pub payload: Vec<u8>,
    pub error_message: String,
    pub attempt_count: u32,
}

pub struct KafkaDeadLetterPublisher {
    dlq: DlqPublisher,
}

impl KafkaDeadLetterPublisher {
    pub fn new(dlq: DlqPublisher) -> Self {
        Self { dlq }
    }
}

#[async_trait]
impl DeadLetterPublisher for KafkaDeadLetterPublisher {
    async fn publish_dead_letter(
        &self,
        record: DeadLetterRecord,
    ) -> Result<(), FeatureEngineeringError> {
        let payload = DeadLetterPayload::new(
            &record.original_topic,
            record.original_key.as_deref(),
            &record.payload,
            &record.error_message,
            record.attempt_count,
        );
        self.dlq
            .publish(MARKET_RAW_DATA_DLQ, payload)
            .await
            .map_err(|error| FeatureEngineeringError::Dlq(error.to_string()))
    }
}

pub struct MarketDataConsumer {
    handler: Arc<dyn MarketDataHandler>,
    retry_config: RetryConfig,
    dlq: Arc<dyn DeadLetterPublisher>,
    metrics: Arc<dyn FeatureEngineeringMetrics>,
}

impl MarketDataConsumer {
    pub fn new(
        handler: Arc<dyn MarketDataHandler>,
        retry_config: RetryConfig,
        dlq: Arc<dyn DeadLetterPublisher>,
        metrics: Arc<dyn FeatureEngineeringMetrics>,
    ) -> Self {
        Self {
            handler,
            retry_config,
            dlq,
            metrics,
        }
    }

    pub async fn run(self, config: &AppConfig, shutdown: impl std::future::Future<Output = ()>) {
        tokio::pin!(shutdown);
        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", &config.kafka_brokers)
            .set("group.id", &config.kafka_consumer_group_id)
            .set("enable.auto.commit", "true")
            .set("auto.offset.reset", "earliest")
            .create()
            .expect("Failed to create Kafka consumer for market.raw.data");

        consumer
            .subscribe(&[MARKET_RAW_DATA])
            .expect("Failed to subscribe to market.raw.data");

        info!("FeatureEngineering MarketDataConsumer listening on {MARKET_RAW_DATA}");

        loop {
            tokio::select! {
                biased;
                _ = &mut shutdown => {
                    info!("FeatureEngineering MarketDataConsumer shutting down");
                    break;
                }
                msg = consumer.recv() => {
                    match msg {
                        Err(error) => error!("Kafka receive error: {error}"),
                        Ok(message) => self.handle_message(&message).await,
                    }
                }
            }
        }
    }

    #[instrument(skip(self, msg))]
    pub async fn handle_message(&self, msg: &rdkafka::message::BorrowedMessage<'_>) {
        let key = msg
            .key()
            .and_then(|key| std::str::from_utf8(key).ok())
            .map(ToOwned::to_owned);
        let payload = match msg.payload() {
            Some(payload) => payload,
            None => {
                warn!("Empty payload on market.raw.data");
                return;
            }
        };

        self.process_payload(payload, key.as_deref(), msg.headers())
            .await;
    }

    pub async fn process_payload<H: Headers>(
        &self,
        payload: &[u8],
        key: Option<&str>,
        headers: Option<&H>,
    ) -> ProcessingOutcome {
        self.metrics.increment_bars_consumed();

        let bar = match MarketDataBar::decode(payload) {
            Ok(bar) => bar,
            Err(error) => {
                let message = error.to_string();
                self.publish_dlq(payload, key, &message, 1).await;
                return ProcessingOutcome::DeadLettered;
            }
        };

        if !bar.is_final {
            return ProcessingOutcome::SkippedNonFinal;
        }

        if let Err(error) = interval_to_millis(&bar.interval) {
            let message = error.to_string();
            self.publish_dlq(payload, key, &message, 1).await;
            return ProcessingOutcome::DeadLettered;
        }

        let fallback_event_id = fallback_market_data_event_id(&bar);
        let mut source_context = resolve_event_context(headers, Some(&fallback_event_id));
        if source_context.event_id.is_none() {
            source_context.event_id = Some(fallback_event_id);
        }

        let handler = Arc::clone(&self.handler);
        let bar_for_retry = bar.clone();
        let context_for_retry = source_context.clone();
        let outcome = with_retry(
            &self.retry_config,
            "feature_engineering.handle_bar",
            move || {
                let handler = Arc::clone(&handler);
                let bar = bar_for_retry.clone();
                let source_context = context_for_retry.clone();
                async move {
                    handler
                        .handle_final_bar(bar, source_context)
                        .await
                        .map_err(Into::into)
                }
            },
        )
        .await;

        match outcome {
            Ok(outcome) => outcome,
            Err(error) => {
                let message = error.to_string();
                self.publish_dlq(payload, key, &message, self.retry_config.max_retries + 1)
                    .await;
                ProcessingOutcome::DeadLettered
            }
        }
    }

    async fn publish_dlq(
        &self,
        payload: &[u8],
        key: Option<&str>,
        error_message: &str,
        attempt_count: u32,
    ) {
        self.metrics.increment_dlq_attempts();
        if let Err(error) = self
            .dlq
            .publish_dead_letter(DeadLetterRecord {
                original_topic: MARKET_RAW_DATA.to_string(),
                original_key: key.map(ToOwned::to_owned),
                payload: payload.to_vec(),
                error_message: error_message.to_string(),
                attempt_count,
            })
            .await
        {
            error!(error = %error, "Failed to publish feature-engineering DLQ message");
        }
    }
}
