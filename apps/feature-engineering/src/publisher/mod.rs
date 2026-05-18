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

        self.producer
            .send(
                FutureRecord::to(topics::FEATURES_INDICATORS)
                    .key(&key)
                    .payload(payload.as_slice())
                    .headers(headers),
                Timeout::Never,
            )
            .await
            .map_err(|(error, _)| FeatureEngineeringError::Publish(error.to_string()))?;

        Ok(())
    }
}
