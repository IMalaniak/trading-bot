// Dead Letter Queue publisher.
//
// When a Kafka consumer exhausts all retries, it calls DlqPublisher::publish()
// to forward the failed message — with error context — to a DLQ topic.
// Operators can then inspect, replay, or discard dead-letter messages.
//
// The DLQ payload is plain JSON (not protobuf) so operators can read it with
// any tool without needing a schema registry.

use anyhow::Result;
use chrono::Utc;
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::util::Timeout;
use serde::Serialize;
use tracing::error;

/// The JSON body written to the DLQ topic for every failed message.
#[derive(Debug, Serialize)]
pub struct DeadLetterPayload<'a> {
    /// The topic the message originally came from (e.g. "instrument.registered").
    pub original_topic: &'a str,
    /// The Kafka message key, if any.
    pub original_key: Option<&'a str>,
    /// The raw bytes of the failed message, hex-encoded so JSON can carry them.
    /// Hex is chosen over base64 because it doesn't require an extra dependency.
    pub original_payload_hex: String,
    /// Human-readable error from the last failed attempt.
    pub error_message: &'a str,
    /// ISO-8601 timestamp of when the message was dead-lettered.
    pub failed_at: String,
    /// How many total attempts were made before giving up.
    pub attempt_count: u32,
}

impl<'a> DeadLetterPayload<'a> {
    pub fn new(
        original_topic: &'a str,
        original_key: Option<&'a str>,
        original_payload: &[u8],
        error_message: &'a str,
        attempt_count: u32,
    ) -> Self {
        // Simple hex encoding — no external crate required.
        let original_payload_hex = original_payload
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();

        Self {
            original_topic,
            original_key,
            original_payload_hex,
            error_message,
            failed_at: Utc::now().to_rfc3339(),
            attempt_count,
        }
    }
}

/// Publishes dead-lettered messages to a DLQ Kafka topic.
///
/// Wraps an `rdkafka::FutureProducer` — the async Kafka producer.
/// Analogy: this is the equivalent of calling `kafkaProducer.send()` with
/// a DLQ topic in the TypeScript `reliable-kafka-consumer.ts`.
pub struct DlqPublisher {
    producer: FutureProducer,
}

impl DlqPublisher {
    pub fn new(producer: FutureProducer) -> Self {
        Self { producer }
    }

    /// Serialises `payload` as JSON and sends it to `dlq_topic`.
    ///
    /// The Kafka message key is set to the original topic name so operators
    /// can partition DLQ messages by origin when draining the queue.
    pub async fn publish(&self, dlq_topic: &str, payload: DeadLetterPayload<'_>) -> Result<()> {
        let body = serde_json::to_vec(&payload)
            .map_err(|e| anyhow::anyhow!("DLQ serialisation failed: {e}"))?;

        // `FutureRecord` borrows its key and payload — keep them in scope until
        // `send` resolves. Rust's borrow checker enforces this at compile time.
        let key = payload.original_topic;

        self.producer
            .send(
                FutureRecord::to(dlq_topic).payload(body.as_slice()).key(key),
                // Timeout::Never: block until the broker acknowledges.
                // Appropriate here because losing a DLQ message is worse than blocking.
                Timeout::Never,
            )
            .await
            .map_err(|(e, _msg)| {
                error!(dlq_topic, error = %e, "Failed to publish to DLQ");
                anyhow::anyhow!("DLQ publish failed: {e}")
            })?;

        Ok(())
    }
}
