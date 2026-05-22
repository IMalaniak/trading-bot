use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppConfig {
    pub kafka_brokers: String,
    pub kafka_consumer_group_id: String,
    pub data_ingestion_grpc_url: String,
    pub warmup_bars_limit: u32,
    pub metrics_port: u16,
    pub log_level: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error("required env var `{0}` not set")]
    Missing(String),
    #[error("`{name}` must be a positive integer, got `{value}`")]
    InvalidPositiveInteger { name: String, value: String },
    #[error("`{name}` must be a port number (0-65535), got `{value}`")]
    InvalidPort { name: String, value: String },
}

impl AppConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        #[cfg(not(test))]
        {
            let workspace_root = find_workspace_root();
            dotenvy::from_path(workspace_root.join(".env")).ok();
            dotenvy::from_path(workspace_root.join("apps/feature-engineering/.env")).ok();
            dotenvy::dotenv().ok();
        }

        Ok(Self {
            kafka_brokers: require_var("KAFKA_BROKERS")?,
            kafka_consumer_group_id: optional_str(
                "FEATURE_ENGINEERING_KAFKA_CONSUMER_GROUP_ID",
                "feature-engineering",
            ),
            data_ingestion_grpc_url: normalize_grpc_url(&require_var("DATA_INGESTION_GRPC_URL")?),
            warmup_bars_limit: optional_u32("FEATURE_ENGINEERING_WARMUP_BARS_LIMIT", 120)?,
            metrics_port: optional_u16("FEATURE_ENGINEERING_METRICS_PORT", 9105)?,
            log_level: optional_str("LOG_LEVEL", "info"),
        })
    }
}

fn find_workspace_root() -> PathBuf {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
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
            None => return PathBuf::from("."),
        }
    }
}

fn require_var(name: &str) -> Result<String, ConfigError> {
    std::env::var(name).map_err(|_| ConfigError::Missing(name.to_string()))
}

fn optional_str(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn optional_u32(name: &str, default: u32) -> Result<u32, ConfigError> {
    match std::env::var(name) {
        Err(_) => Ok(default),
        Ok(value) => value
            .parse::<u32>()
            .map_err(|_| ConfigError::InvalidPositiveInteger {
                name: name.to_string(),
                value,
            }),
    }
}

fn optional_u16(name: &str, default: u16) -> Result<u16, ConfigError> {
    match std::env::var(name) {
        Err(_) => Ok(default),
        Ok(value) => value.parse::<u16>().map_err(|_| ConfigError::InvalidPort {
            name: name.to_string(),
            value,
        }),
    }
}

fn normalize_grpc_url(value: &str) -> String {
    if value.starts_with("http://") || value.starts_with("https://") {
        value.to_string()
    } else {
        format!("http://{value}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    const ENV_KEYS: &[&str] = &[
        "KAFKA_BROKERS",
        "FEATURE_ENGINEERING_KAFKA_CONSUMER_GROUP_ID",
        "DATA_INGESTION_GRPC_URL",
        "FEATURE_ENGINEERING_WARMUP_BARS_LIMIT",
        "FEATURE_ENGINEERING_METRICS_PORT",
        "LOG_LEVEL",
    ];

    fn with_env<F: FnOnce()>(vars: &[(&str, &str)], f: F) {
        let _guard = ENV_MUTEX.lock().expect("ENV_MUTEX poisoned");
        for key in ENV_KEYS {
            std::env::remove_var(key);
        }
        for (key, value) in vars {
            std::env::set_var(key, value);
        }

        f();

        for key in ENV_KEYS {
            std::env::remove_var(key);
        }
    }

    #[test]
    fn loads_required_vars_and_defaults() {
        with_env(
            &[
                ("KAFKA_BROKERS", "127.0.0.1:19092"),
                ("DATA_INGESTION_GRPC_URL", "127.0.0.1:50054"),
            ],
            || {
                let config = AppConfig::from_env().expect("config should load");

                assert_eq!(config.kafka_brokers, "127.0.0.1:19092");
                assert_eq!(config.kafka_consumer_group_id, "feature-engineering");
                assert_eq!(config.data_ingestion_grpc_url, "http://127.0.0.1:50054");
                assert_eq!(config.warmup_bars_limit, 120);
                assert_eq!(config.metrics_port, 9105);
                assert_eq!(config.log_level, "info");
            },
        );
    }

    #[test]
    fn preserves_grpc_url_scheme_when_present() {
        with_env(
            &[
                ("KAFKA_BROKERS", "127.0.0.1:19092"),
                ("DATA_INGESTION_GRPC_URL", "http://127.0.0.1:50054"),
            ],
            || {
                let config = AppConfig::from_env().expect("config should load");
                assert_eq!(config.data_ingestion_grpc_url, "http://127.0.0.1:50054");
            },
        );
    }

    #[test]
    fn parses_service_specific_overrides() {
        with_env(
            &[
                ("KAFKA_BROKERS", "127.0.0.1:19092"),
                ("DATA_INGESTION_GRPC_URL", "http://127.0.0.1:50054"),
                (
                    "FEATURE_ENGINEERING_KAFKA_CONSUMER_GROUP_ID",
                    "feature-engineering-test",
                ),
                ("FEATURE_ENGINEERING_WARMUP_BARS_LIMIT", "240"),
                ("FEATURE_ENGINEERING_METRICS_PORT", "19105"),
                ("LOG_LEVEL", "debug"),
            ],
            || {
                let config = AppConfig::from_env().expect("config should load");

                assert_eq!(config.kafka_consumer_group_id, "feature-engineering-test");
                assert_eq!(config.warmup_bars_limit, 240);
                assert_eq!(config.metrics_port, 19105);
                assert_eq!(config.log_level, "debug");
            },
        );
    }

    #[test]
    fn returns_error_when_required_var_missing() {
        with_env(&[("KAFKA_BROKERS", "127.0.0.1:19092")], || {
            let error = AppConfig::from_env().expect_err("config should fail");
            assert_eq!(
                error,
                ConfigError::Missing("DATA_INGESTION_GRPC_URL".to_string())
            );
        });
    }

    #[test]
    fn returns_error_for_invalid_numeric_values() {
        with_env(
            &[
                ("KAFKA_BROKERS", "127.0.0.1:19092"),
                ("DATA_INGESTION_GRPC_URL", "127.0.0.1:50054"),
                ("FEATURE_ENGINEERING_WARMUP_BARS_LIMIT", "many"),
            ],
            || {
                let error = AppConfig::from_env().expect_err("config should fail");
                assert_eq!(
                    error,
                    ConfigError::InvalidPositiveInteger {
                        name: "FEATURE_ENGINEERING_WARMUP_BARS_LIMIT".to_string(),
                        value: "many".to_string()
                    }
                );
            },
        );
    }
}
