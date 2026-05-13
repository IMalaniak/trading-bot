use std::str::FromStr;
use std::sync::Arc;

use chrono::DateTime;
use prost::Message;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::BorrowedMessage;
use rdkafka::{ClientConfig, Message as KafkaMessage};
use rust_decimal::Decimal;
use tracing::{error, info, instrument, warn};

use trading_common::kafka::consumer::{with_retry, RetryConfig};
use trading_common::kafka::dlq::DlqPublisher;
use trading_common::proto::tradingbot::events::MarketDataBar;

use crate::config::AppConfig;
use crate::domain::{BarsQuery, MarketDataBarRow};
use crate::error::AppError;
use crate::repository::MarketDataRepository;

const MARKET_RAW_DATA_TOPIC: &str = "market.raw.data";
const DLQ_TOPIC: &str = "market.raw.data.dlq";

/// Consumes `market.raw.data` Kafka events and persists closed OHLCV bars.
///
/// For each message:
/// 1. Decode the protobuf `MarketDataBar` envelope.
/// 2. Skip bars where `is_final == false` (in-progress bars from the exchange).
/// 3. Convert to `MarketDataBarRow` and call `repository.insert_bar`.
/// 4. On transient failure, retry with exponential backoff.
/// 5. On exhausted retries, publish to the DLQ topic.
pub struct MarketDataConsumer<R: MarketDataRepository> {
    repository: Arc<R>,
    retry_config: RetryConfig,
    dlq: DlqPublisher,
}

impl<R: MarketDataRepository> MarketDataConsumer<R> {
    pub fn new(repository: Arc<R>, retry_config: RetryConfig, dlq: DlqPublisher) -> Self {
        Self {
            repository,
            retry_config,
            dlq,
        }
    }

    /// Build a Kafka `StreamConsumer` and enter the poll loop.
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
            .subscribe(&[MARKET_RAW_DATA_TOPIC])
            .expect("Failed to subscribe to market.raw.data");

        info!("MarketDataConsumer started, listening on {MARKET_RAW_DATA_TOPIC}");
        let consumer = Arc::new(consumer);

        loop {
            tokio::select! {
                biased;
                _ = &mut shutdown => {
                    info!("MarketDataConsumer shutting down");
                    break;
                }
                msg = consumer.recv() => {
                    match msg {
                        Err(e) => error!("Kafka receive error: {e}"),
                        Ok(m)  => self.handle_message(&m).await,
                    }
                }
            }
        }
    }

    /// Process a single Kafka message — decode, filter, persist, retry, DLQ.
    #[instrument(skip(self, msg))]
    pub async fn handle_message(&self, msg: &BorrowedMessage<'_>) {
        let payload = match msg.payload() {
            Some(b) => b,
            None => {
                warn!("Empty payload on market.raw.data — skipping");
                return;
            }
        };
        self.process_payload(payload).await;
    }

    /// Process raw payload bytes.
    ///
    /// Extracted from `handle_message` so unit tests can call it directly
    /// without constructing a `BorrowedMessage`.
    pub async fn process_payload(&self, payload: &[u8]) {
        let bar = match MarketDataBar::decode(payload) {
            Ok(b)  => b,
            Err(e) => {
                error!("Failed to decode MarketDataBar proto: {e}");
                self.publish_dlq(payload, &e.to_string(), 0).await;
                return;
            }
        };

        // Only persist finalised bars; skip in-progress streaming bars.
        if !bar.is_final {
            return;
        }

        let row = match self.to_row(&bar) {
            Ok(r)  => r,
            Err(e) => {
                error!("Failed to convert MarketDataBar to row: {e}");
                self.publish_dlq(payload, &e.to_string(), 0).await;
                return;
            }
        };

        let repo = Arc::clone(&self.repository);
        let row_clone = row.clone();

        let outcome = with_retry(
            &self.retry_config,
            &format!("insert_bar({})", row.source_event_id),
            move || {
                let r = Arc::clone(&repo);
                let row = row_clone.clone();
                async move {
                    r.insert_bar(&row)
                        .await
                        .map_err(anyhow::Error::from)
                }
            },
        )
        .await;

        match outcome {
            Ok(_)  => info!(source_event_id = %row.source_event_id, "Bar persisted"),
            Err(e) => {
                error!(
                    source_event_id = %row.source_event_id,
                    error = %e,
                    "insert_bar failed after retries — publishing to DLQ"
                );
                self.publish_dlq(payload, &e.to_string(), self.retry_config.max_retries).await;
            }
        }
    }

    /// Convert a decoded protobuf bar into the DB row type.
    fn to_row(&self, bar: &MarketDataBar) -> Result<MarketDataBarRow, AppError> {
        let time = DateTime::from_timestamp_millis(bar.open_time_ms)
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("invalid open_time_ms: {}", bar.open_time_ms)))?;

        Ok(MarketDataBarRow {
            time,
            instrument_id: bar.instrument_id.clone(),
            symbol:        bar.symbol.clone(),
            venue:         bar.venue.clone(),
            interval:      bar.interval.clone(),
            open:          parse_decimal(&bar.open, "open")?,
            high:          parse_decimal(&bar.high, "high")?,
            low:           parse_decimal(&bar.low, "low")?,
            close:         parse_decimal(&bar.close, "close")?,
            volume:        parse_decimal(&bar.volume, "volume")?,
            quote_volume:  parse_decimal(&bar.quote_volume, "quote_volume")?,
            trade_count:   bar.trade_count,
            source_event_id: format!(
                "{}-{}-{}-{}",
                bar.instrument_id, bar.interval, bar.open_time_ms, bar.close_time_ms
            ),
        })
    }

    async fn publish_dlq(&self, payload: &[u8], error_msg: &str, attempt_count: u32) {
        use trading_common::kafka::dlq::DeadLetterPayload;

        let dlq_payload = DeadLetterPayload::new(
            MARKET_RAW_DATA_TOPIC,
            None,
            payload,
            error_msg,
            attempt_count,
        );
        if let Err(e) = self.dlq.publish(DLQ_TOPIC, dlq_payload).await {
            error!("Failed to publish DLQ message: {e}");
        }
    }
}

fn parse_decimal(s: &str, field: &str) -> Result<Decimal, AppError> {
    Decimal::from_str(s).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("invalid decimal for field '{field}': {s} — {e}"))
    })
}
