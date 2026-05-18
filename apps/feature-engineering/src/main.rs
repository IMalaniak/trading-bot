use std::sync::Arc;

use rdkafka::ClientConfig;
use tracing::info;
use tracing_subscriber::EnvFilter;

use feature_engineering::config::AppConfig;
use feature_engineering::consumer::{KafkaDeadLetterPublisher, MarketDataConsumer};
use feature_engineering::metrics::{serve_metrics, PrometheusFeatureEngineeringMetrics};
use feature_engineering::publisher::KafkaFeaturePublisher;
use feature_engineering::service::FeatureEngineeringService;
use feature_engineering::warmup::DataIngestionWarmupClient;
use trading_common::kafka::consumer::RetryConfig;
use trading_common::kafka::dlq::DlqPublisher;

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
        "feature-engineering starting"
    );

    let producer: rdkafka::producer::FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", &config.kafka_brokers)
        .set("message.timeout.ms", "5000")
        .create()?;

    let metrics = Arc::new(PrometheusFeatureEngineeringMetrics::new()?);
    let publisher = Arc::new(KafkaFeaturePublisher::new(producer.clone()));
    let dlq = Arc::new(KafkaDeadLetterPublisher::new(DlqPublisher::new(producer)));
    let warmup = Arc::new(DataIngestionWarmupClient::connect_lazy(
        config.data_ingestion_grpc_url.clone(),
    )?);
    let service = Arc::new(FeatureEngineeringService::new(
        warmup,
        publisher,
        metrics.clone(),
        config.warmup_bars_limit,
    ));
    let consumer = MarketDataConsumer::new(service, RetryConfig::default(), dlq, metrics.clone());

    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(());
    let consumer_shutdown = shutdown_rx.clone();
    let metrics_shutdown = shutdown_rx.clone();

    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to listen for CTRL-C");
        info!("feature-engineering shutdown signal received");
        let _ = shutdown_tx.send(());
    });

    let consumer_config = config.clone();
    let consumer_task = tokio::spawn(async move {
        let mut shutdown = consumer_shutdown;
        consumer
            .run(&consumer_config, async move {
                shutdown.changed().await.ok();
            })
            .await;
    });

    let metrics_port = config.metrics_port;
    let metrics_task = tokio::spawn(async move {
        let mut shutdown = metrics_shutdown;
        serve_metrics(metrics_port, async move {
            shutdown.changed().await.ok();
        })
        .await
    });

    tokio::select! {
        result = consumer_task => {
            result?;
        }
        result = metrics_task => {
            result??;
        }
    }
    info!("feature-engineering shut down cleanly");

    Ok(())
}
