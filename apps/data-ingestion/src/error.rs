// Typed errors for the data-ingestion service.
//
// In TypeScript this would be:
//   export class ConfigError extends Error { ... }
//   export class DatabaseError extends Error { ... }
//
// In Rust we use `thiserror::Error` — a derive macro that generates the
// std::error::Error impl. Each enum variant becomes one error kind.
//
// Using a typed enum (rather than anyhow everywhere) lets call sites pattern-
// match on the error kind:
//   match err {
//       AppError::Database(e) => // handle DB error
//       AppError::Config(msg) => // handle config error
//   }

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    /// Environment variable missing or invalid — raised during startup.
    #[error("Configuration error: {0}")]
    Config(String),

    /// sqlx returned an error — query failed, connection lost, etc.
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    /// Kafka producer/consumer error.
    #[error("Kafka error: {0}")]
    Kafka(String),

    /// Protobuf decode failed — the message bytes don't match the schema.
    #[error("Protobuf decode error: {0}")]
    ProtoDecode(#[from] prost::DecodeError),

    /// gRPC call to an upstream service failed.
    #[error("gRPC error: {0}")]
    Grpc(#[from] tonic::Status),

    /// Catch-all for unexpected errors (wraps anyhow).
    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

// Convert AppError → tonic::Status so gRPC handlers can use `?` directly.
// In NestJS terms: this is your global exception filter translating domain
// errors into HTTP/gRPC status codes.
impl From<AppError> for tonic::Status {
    fn from(err: AppError) -> Self {
        match err {
            AppError::Config(msg) => {
                tonic::Status::internal(format!("service misconfigured: {msg}"))
            }
            AppError::Database(e) => tonic::Status::internal(format!("database error: {e}")),
            AppError::Kafka(msg) => tonic::Status::internal(format!("kafka error: {msg}")),
            AppError::ProtoDecode(e) => {
                tonic::Status::invalid_argument(format!("malformed request: {e}"))
            }
            AppError::Grpc(s) => s,
            AppError::Internal(e) => tonic::Status::internal(e.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_error_displays_message() {
        let err = AppError::Config("DATA_INGESTION_DATABASE_URL not set".to_string());
        assert_eq!(err.to_string(), "Configuration error: DATA_INGESTION_DATABASE_URL not set");
    }

    #[test]
    fn grpc_status_converts_proto_decode_to_invalid_argument() {
        // Simulate a bad protobuf message arriving in a gRPC handler.
        let decode_err = prost::DecodeError::new("unexpected end of buffer");
        let app_err = AppError::ProtoDecode(decode_err);
        let status: tonic::Status = app_err.into();
        assert_eq!(status.code(), tonic::Code::InvalidArgument);
    }

    #[test]
    fn grpc_status_converts_db_error_to_internal() {
        // A DB error should become gRPC Internal — don't leak SQL details.
        let db_err = sqlx::Error::RowNotFound;
        let app_err = AppError::Database(db_err);
        let status: tonic::Status = app_err.into();
        assert_eq!(status.code(), tonic::Code::Internal);
    }
}
