use tokio::signal;
use tracing::info;
use tracing_subscriber::EnvFilter;

use feature_engineering::config::AppConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = AppConfig::from_env().map_err(|error| anyhow::anyhow!(error.to_string()))?;

    tracing_subscriber::fmt()
        .json()
        .with_env_filter(EnvFilter::new(&config.log_level))
        .init();

    info!(
        kafka_brokers = %config.kafka_brokers,
        consumer_group = %config.kafka_consumer_group_id,
        data_ingestion_grpc_url = %config.data_ingestion_grpc_url,
        warmup_bars_limit = config.warmup_bars_limit,
        metrics_port = config.metrics_port,
        "feature-engineering skeleton started"
    );

    signal::ctrl_c().await?;
    info!("feature-engineering skeleton shut down");

    Ok(())
}
