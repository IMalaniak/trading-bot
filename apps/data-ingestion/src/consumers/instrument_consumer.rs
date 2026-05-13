use std::sync::Arc;

use prost::Message;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::BorrowedMessage;
use rdkafka::{ClientConfig, Message as KafkaMessage};
use tracing::{error, info, instrument, warn};

use trading_common::kafka::consumer::{with_retry, RetryConfig};
use trading_common::kafka::dlq::DlqPublisher;
use trading_common::proto::tradingbot::events::InstrumentRegistered;
use trading_common::proto::tradingbot::external_api_facade::StartMarketDataSubscriptionRequest;

use crate::config::AppConfig;
use crate::error::AppError;
use crate::subscription::SubscriptionGateway;

const INSTRUMENT_TOPIC: &str = "instrument.registered";
const DLQ_TOPIC: &str = "instrument.registered.dlq";

/// Consumes `instrument.registered` Kafka events and subscribes to market data
/// for each new instrument.
///
/// For each message:
/// 1. Decode the protobuf `InstrumentRegistered` envelope.
/// 2. For every configured default interval, call `gateway.start_subscription`.
/// 3. On transient failure, retry with exponential backoff via `with_retry`.
/// 4. On exhausted retries, publish the raw bytes to the DLQ topic so no event
///    is silently lost.
pub struct InstrumentConsumer<G: SubscriptionGateway> {
    gateway: Arc<G>,
    default_intervals: Vec<String>,
    retry_config: RetryConfig,
    dlq: DlqPublisher,
}

impl<G: SubscriptionGateway> InstrumentConsumer<G> {
    pub fn new(
        gateway: Arc<G>,
        default_intervals: Vec<String>,
        retry_config: RetryConfig,
        dlq: DlqPublisher,
    ) -> Self {
        Self {
            gateway,
            default_intervals,
            retry_config,
            dlq,
        }
    }

    /// Build a Kafka `StreamConsumer` and enter the poll loop.
    ///
    /// This is the entry point used in `main.rs`. It runs until the provided
    /// `shutdown` future resolves (e.g. a `CancellationToken` or SIGTERM).
    pub async fn run(self, config: &AppConfig, shutdown: impl std::future::Future<Output = ()>) {
        tokio::pin!(shutdown);
        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", &config.kafka_brokers)
            .set("group.id", &config.kafka_consumer_group_id)
            .set("enable.auto.commit", "true")
            .set("auto.offset.reset", "earliest")
            .create()
            .expect("Failed to create Kafka consumer for instrument.registered");

        consumer
            .subscribe(&[INSTRUMENT_TOPIC])
            .expect("Failed to subscribe to instrument.registered");

        info!("InstrumentConsumer started, listening on {INSTRUMENT_TOPIC}");
        let consumer = Arc::new(consumer);

        loop {
            tokio::select! {
                biased;
                _ = &mut shutdown => {
                    info!("InstrumentConsumer shutting down");
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

    /// Process a single Kafka message — decode, subscribe, retry, DLQ.
    #[instrument(skip(self, msg))]
    pub async fn handle_message(&self, msg: &BorrowedMessage<'_>) {
        let payload = match msg.payload() {
            Some(b) => b,
            None => {
                warn!("Empty payload on instrument.registered — skipping");
                return;
            }
        };
        self.process_payload(payload).await;
    }

    /// Process raw payload bytes.
    ///
    /// Extracted from `handle_message` so unit tests can call it directly
    /// without constructing a `BorrowedMessage` (which requires an active
    /// Kafka connection).
    pub async fn process_payload(&self, payload: &[u8]) {
        let event = match InstrumentRegistered::decode(payload) {
            Ok(e)  => e,
            Err(e) => {
                error!("Failed to decode InstrumentRegistered proto: {e}");
                self.publish_dlq(payload, &e.to_string(), 0).await;
                return;
            }
        };

        let instrument = match event.instrument {
            Some(i) => i,
            None => {
                warn!("InstrumentRegistered event missing instrument field — skipping");
                return;
            }
        };

        for interval in &self.default_intervals {
            let req = StartMarketDataSubscriptionRequest {
                instrument_id: instrument.id.clone(),
                symbol:        instrument.symbol.clone(),
                venue:         instrument.venue.clone(),
                intervals:     vec![interval.clone()],
            };

            let gateway = Arc::clone(&self.gateway);
            let req_clone = req.clone();

            let outcome = with_retry(
                &self.retry_config,
                &format!("start_subscription({},{})", instrument.symbol, interval),
                move || {
                    let gw = Arc::clone(&gateway);
                    let r = req_clone.clone();
                    async move {
                        gw.start_subscription(r)
                            .await
                            .map_err(anyhow::Error::from)
                    }
                },
            )
            .await;

            if let Err(e) = outcome {
                error!(
                    symbol = %instrument.symbol,
                    interval,
                    error = %e,
                    "Subscription failed after retries — publishing to DLQ"
                );
                self.publish_dlq(payload, &e.to_string(), self.retry_config.max_retries).await;
            } else {
                info!(symbol = %instrument.symbol, interval, "Subscription started");
            }
        }
    }

    async fn publish_dlq(&self, payload: &[u8], error_msg: &str, attempt_count: u32) {
        use trading_common::kafka::dlq::DeadLetterPayload;

        let dlq_payload = DeadLetterPayload::new(
            INSTRUMENT_TOPIC,
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
