use async_trait::async_trait;
use chrono::Utc;
use prost::Message;
use rdkafka::message::OwnedHeaders;
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::util::Timeout;

use trading_common::kafka::keys::instrument_key;
use trading_common::kafka::metadata::{
    build_event_metadata_headers, content_types, producers, EventContext, EventMetadataHeadersInput,
};
use trading_common::kafka::topics::{self, schema_versions};
use trading_common::proto::tradingbot::events::IndicatorFeatureVector;

use crate::error::FeatureEngineeringError;

pub struct FeaturePublishRecord {
    pub topic: &'static str,
    pub key: String,
    pub payload: Vec<u8>,
    pub headers: OwnedHeaders,
}

#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait FeaturePublisher: Send + Sync {
    async fn publish(
        &self,
        vector: &IndicatorFeatureVector,
        source_context: &EventContext,
    ) -> Result<(), FeatureEngineeringError>;
}

pub struct KafkaFeaturePublisher {
    producer: FutureProducer,
}

impl KafkaFeaturePublisher {
    pub fn new(producer: FutureProducer) -> Self {
        Self { producer }
    }
}

#[async_trait]
impl FeaturePublisher for KafkaFeaturePublisher {
    async fn publish(
        &self,
        vector: &IndicatorFeatureVector,
        source_context: &EventContext,
    ) -> Result<(), FeatureEngineeringError> {
        let record = build_feature_publish_record(vector, source_context)?;

        self.producer
            .send(
                FutureRecord::to(record.topic)
                    .key(&record.key)
                    .payload(record.payload.as_slice())
                    .headers(record.headers),
                Timeout::Never,
            )
            .await
            .map_err(|(error, _)| FeatureEngineeringError::Publish(error.to_string()))?;

        Ok(())
    }
}

pub fn build_feature_publish_record(
    vector: &IndicatorFeatureVector,
    source_context: &EventContext,
) -> Result<FeaturePublishRecord, FeatureEngineeringError> {
    let mut payload = Vec::new();
    vector
        .encode(&mut payload)
        .map_err(|error| FeatureEngineeringError::Publish(error.to_string()))?;

    let key = instrument_key(&vector.venue, &vector.instrument_id);
    let occurred_at = if vector.calculated_at.is_empty() {
        Utc::now().to_rfc3339()
    } else {
        vector.calculated_at.clone()
    };
    let causation_id = source_context
        .event_id
        .as_deref()
        .unwrap_or(vector.source_event_id.as_str());

    let headers: OwnedHeaders = build_event_metadata_headers(EventMetadataHeadersInput {
        event_id: &vector.id,
        event_type: topics::FEATURES_INDICATORS,
        schema_version: schema_versions::FEATURES_INDICATORS,
        occurred_at: &occurred_at,
        producer: producers::FEATURE_ENGINEERING,
        content_type: Some(content_types::PROTOBUF),
        correlation_id: source_context.correlation_id.as_deref(),
        causation_id: Some(causation_id),
        traceparent: source_context.traceparent.as_deref(),
    });

    Ok(FeaturePublishRecord {
        topic: topics::FEATURES_INDICATORS,
        key,
        payload,
        headers,
    })
}

#[cfg(test)]
mod tests {
    use prost::Message;
    use trading_common::kafka::metadata::{header_names, read_header};
    use trading_common::proto::tradingbot::events::IndicatorFeatureValue;

    use super::*;

    #[test]
    fn builds_deterministic_feature_publish_record() {
        let vector = IndicatorFeatureVector {
            id: "feat:instrument-1:1m:1775044800000:core-v1".to_string(),
            instrument_id: "instrument-1".to_string(),
            symbol: "BTCUSDT".to_string(),
            venue: "binance".to_string(),
            interval: "1m".to_string(),
            open_time_ms: 1_775_044_800_000,
            close_time_ms: 1_775_044_859_999,
            source_event_id: "market-event-1".to_string(),
            feature_set: "core-v1".to_string(),
            features: vec![IndicatorFeatureValue {
                name: "sma.close.20".to_string(),
                value: "124.5".to_string(),
            }],
            calculated_at: "2026-05-18T08:00:00Z".to_string(),
        };
        let context = EventContext {
            event_id: Some("market-event-1".to_string()),
            correlation_id: Some("workflow-1".to_string()),
            causation_id: None,
            traceparent: Some("trace-1".to_string()),
        };

        let record = build_feature_publish_record(&vector, &context).unwrap();
        let headers = record.headers.as_borrowed();

        assert_eq!(record.topic, topics::FEATURES_INDICATORS);
        assert_eq!(record.key, "BINANCE:instrument-1");
        assert_eq!(
            read_header(Some(headers), header_names::EVENT_ID).as_deref(),
            Some(vector.id.as_str())
        );
        assert_eq!(
            read_header(Some(headers), header_names::SCHEMA_VERSION).as_deref(),
            Some(schema_versions::FEATURES_INDICATORS)
        );
        assert_eq!(
            read_header(Some(headers), header_names::PRODUCER).as_deref(),
            Some(producers::FEATURE_ENGINEERING)
        );
        assert_eq!(
            read_header(Some(headers), header_names::CORRELATION_ID).as_deref(),
            Some("workflow-1")
        );
        assert_eq!(
            read_header(Some(headers), header_names::CAUSATION_ID).as_deref(),
            Some("market-event-1")
        );

        let decoded = IndicatorFeatureVector::decode(record.payload.as_slice()).unwrap();
        assert_eq!(decoded.id, vector.id);
        assert_eq!(decoded.source_event_id, "market-event-1");
    }
}
