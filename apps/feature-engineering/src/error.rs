use thiserror::Error;

#[derive(Debug, Error)]
pub enum FeatureEngineeringError {
    #[error("empty Kafka payload")]
    EmptyPayload,

    #[error("failed to decode MarketDataBar protobuf: {0}")]
    Decode(#[from] prost::DecodeError),

    #[error("invalid decimal for `{field}`: `{value}`")]
    InvalidDecimal { field: &'static str, value: String },

    #[error("close price must be positive, got `{0}`")]
    NonPositiveClose(String),

    #[error("unsupported market-data interval `{0}`")]
    UnsupportedInterval(String),

    #[error("Data Ingestion warm-up failed: {0}")]
    Warmup(String),

    #[error("feature-vector publish failed: {0}")]
    Publish(String),

    #[error("DLQ publish failed: {0}")]
    Dlq(String),
}
