// Application configuration loaded from environment variables.
//
// NestJS equivalent:
//   @Injectable() ConfigService using class-validator @IsString(), @IsInt()
//   Read at module init via ConfigModule.forRoot()
//
// In Rust we use dotenvy to load .env, then read each variable explicitly.
// The whole AppConfig is built in one place at startup — if anything is
// missing the service panics immediately with a clear message (fail-fast).

use crate::error::AppError;

/// All runtime configuration for the data-ingestion service.
///
/// Fields are grouped logically; each has an env var name documented above it.
#[derive(Debug, Clone)]
pub struct AppConfig {
    // ── Database ──────────────────────────────────────────────────────────────
    /// `DATA_INGESTION_DATABASE_URL`
    /// TimescaleDB connection string.
    /// Example: `postgresql://user:pass@localhost:5433/trading`
    pub database_url: String,

    /// `DATABASE_MAX_CONNECTIONS` (default: 10)
    /// sqlx connection pool maximum size.
    pub database_max_connections: u32,

    // ── Kafka ─────────────────────────────────────────────────────────────────
    /// `KAFKA_BROKERS`
    /// Comma-separated list of broker addresses.
    /// Example: `localhost:19092`
    pub kafka_brokers: String,

    /// `KAFKA_CONSUMER_GROUP_ID` (default: `data-ingestion`)
    pub kafka_consumer_group_id: String,

    /// `KAFKA_DEFAULT_INTERVALS` (default: `1m`)
    /// Comma-separated kline intervals to subscribe to when a new instrument
    /// is registered. Example: `1m,5m`
    pub kafka_default_intervals: Vec<String>,

    // ── gRPC servers / clients ────────────────────────────────────────────────
    /// `DATA_INGESTION_GRPC_PORT` (default: 50054)
    /// Port this service listens on.
    pub grpc_port: u16,

    /// `EXTERNAL_API_FACADE_GRPC_URL`
    /// Address of the External API Facade gRPC server.
    /// Example: `http://localhost:50053`
    pub external_api_facade_url: String,

    /// `PORTFOLIO_MANAGER_GRPC_URL`
    /// Address of the Portfolio Manager gRPC server (used at startup for
    /// re-subscription of existing instruments).
    /// Example: `http://localhost:50051`
    pub portfolio_manager_url: String,

    // ── Observability ─────────────────────────────────────────────────────────
    /// `DATA_INGESTION_METRICS_PORT` (default: 9104)
    pub metrics_port: u16,

    /// `LOG_LEVEL` (default: `info`)
    /// Controls tracing-subscriber filter: `trace`, `debug`, `info`, `warn`, `error`.
    pub log_level: String,
}

impl AppConfig {
    /// Load configuration from environment variables.
    ///
    /// Reads `.env` first (via dotenvy — silently ignored if file not present),
    /// then reads each variable. Returns `AppError::Config` for any missing
    /// required variable.
    pub fn from_env() -> Result<Self, AppError> {
        #[cfg(not(test))]
        {
            let workspace_root = find_workspace_root();
            dotenvy::from_path(workspace_root.join(".env")).ok(); // shared — ignore if missing
            dotenvy::dotenv().ok(); // local service .env — ignore if missing
        }

        Ok(AppConfig {
            database_url: require_var("DATA_INGESTION_DATABASE_URL")?,
            database_max_connections: optional_u32("DATABASE_MAX_CONNECTIONS", 10)?,
            kafka_brokers: require_var("KAFKA_BROKERS")?,
            kafka_consumer_group_id: optional_str("KAFKA_CONSUMER_GROUP_ID", "data-ingestion"),
            kafka_default_intervals: optional_str("KAFKA_DEFAULT_INTERVALS", "1m")
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            grpc_port: optional_u16("DATA_INGESTION_GRPC_PORT", 50054)?,
            external_api_facade_url: require_var("EXTERNAL_API_FACADE_GRPC_URL")?,
            portfolio_manager_url: require_var("PORTFOLIO_MANAGER_GRPC_URL")?,
            metrics_port: optional_u16("DATA_INGESTION_METRICS_PORT", 9104)?,
            log_level: optional_str("LOG_LEVEL", "info"),
        })
    }
}

// ── private helpers ────────────────────────────────────────────────────────────

/// Walk up from the current working directory until a directory containing a
/// `Cargo.toml` with a `[workspace]` section is found.
///
/// This lets the service locate the monorepo root regardless of which directory
/// `cargo run` / `nx run` is invoked from.  Falls back to `"."` so the existing
/// behaviour is preserved when the workspace root cannot be determined (e.g.
/// inside a Docker container where only the service directory is mounted).
fn find_workspace_root() -> std::path::PathBuf {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    loop {
        let manifest = dir.join("Cargo.toml");
        if manifest.exists() {
            if let Ok(contents) = std::fs::read_to_string(&manifest) {
                if contents.contains("[workspace]") {
                    return dir;
                }
            }
        }
        match dir.parent() {
            Some(parent) => dir = parent.to_path_buf(),
            None => return std::path::PathBuf::from("."),
        }
    }
}

fn require_var(name: &str) -> Result<String, AppError> {
    std::env::var(name).map_err(|_| AppError::Config(format!("required env var `{name}` not set")))
}

fn optional_str(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn optional_u32(name: &str, default: u32) -> Result<u32, AppError> {
    match std::env::var(name) {
        Err(_) => Ok(default),
        Ok(val) => val.parse::<u32>().map_err(|_| {
            AppError::Config(format!("`{name}` must be a positive integer, got `{val}`"))
        }),
    }
}

fn optional_u16(name: &str, default: u16) -> Result<u16, AppError> {
    match std::env::var(name) {
        Err(_) => Ok(default),
        Ok(val) => val.parse::<u16>().map_err(|_| {
            AppError::Config(format!("`{name}` must be a port number (0-65535), got `{val}`"))
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Serialise all config tests: env-var mutation is process-global, so
    /// parallel execution of tests that add/remove vars races.
    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    // Helper: acquire the serialisation lock, set a group of env vars for one
    // test, then clear them. The lock is held for the entire duration so no
    // other config test can interleave. The closure runs under the lock, and
    // vars are cleaned up even if the assertion panics.
    fn with_env<F: FnOnce()>(vars: &[(&str, &str)], f: F) {
        let _guard = ENV_MUTEX.lock().expect("ENV_MUTEX poisoned");
        for (k, v) in vars {
            std::env::set_var(k, v);
        }
        f();
        for (k, _) in vars {
            std::env::remove_var(k);
        }
    }

    #[test]
    fn loads_required_vars_successfully() {
        with_env(
            &[
                ("DATA_INGESTION_DATABASE_URL", "postgresql://localhost:5433/test"),
                ("KAFKA_BROKERS", "localhost:19092"),
                ("EXTERNAL_API_FACADE_GRPC_URL", "http://localhost:50053"),
                ("PORTFOLIO_MANAGER_GRPC_URL", "http://localhost:50051"),
            ],
            || {
                let cfg = AppConfig::from_env().expect("config should load");
                assert_eq!(cfg.database_url, "postgresql://localhost:5433/test");
                assert_eq!(cfg.grpc_port, 50054); // default
                assert_eq!(cfg.metrics_port, 9104); // default
                assert_eq!(cfg.kafka_default_intervals, vec!["1m"]);
            },
        );
    }

    #[test]
    fn returns_error_when_required_var_missing() {
        let _guard = ENV_MUTEX.lock().expect("ENV_MUTEX poisoned");
        // Ensure no required vars are set for this test.
        std::env::remove_var("DATA_INGESTION_DATABASE_URL");
        std::env::remove_var("KAFKA_BROKERS");
        std::env::remove_var("EXTERNAL_API_FACADE_GRPC_URL");
        std::env::remove_var("PORTFOLIO_MANAGER_GRPC_URL");

        let err = AppConfig::from_env().expect_err("should fail without DATA_INGESTION_DATABASE_URL");
        assert!(err.to_string().contains("DATA_INGESTION_DATABASE_URL"));
    }

    #[test]
    fn parses_multiple_kafka_default_intervals() {
        with_env(
            &[
                ("DATA_INGESTION_DATABASE_URL", "postgresql://localhost:5433/test"),
                ("KAFKA_BROKERS", "localhost:19092"),
                ("EXTERNAL_API_FACADE_GRPC_URL", "http://localhost:50053"),
                ("PORTFOLIO_MANAGER_GRPC_URL", "http://localhost:50051"),
                ("KAFKA_DEFAULT_INTERVALS", "1m, 5m, 1h"),
            ],
            || {
                let cfg = AppConfig::from_env().expect("config should load");
                assert_eq!(cfg.kafka_default_intervals, vec!["1m", "5m", "1h"]);
            },
        );
    }

    #[test]
    fn returns_error_for_invalid_port() {
        with_env(
            &[
                ("DATA_INGESTION_DATABASE_URL", "postgresql://localhost:5433/test"),
                ("KAFKA_BROKERS", "localhost:19092"),
                ("EXTERNAL_API_FACADE_GRPC_URL", "http://localhost:50053"),
                ("PORTFOLIO_MANAGER_GRPC_URL", "http://localhost:50051"),
                ("DATA_INGESTION_GRPC_PORT", "not-a-port"),
            ],
            || {
                let err = AppConfig::from_env().expect_err("should reject bad port");
                assert!(err.to_string().contains("DATA_INGESTION_GRPC_PORT"));
            },
        );
    }
}
