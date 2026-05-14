use std::net::SocketAddr;
use std::sync::Arc;

use prometheus::{Encoder, TextEncoder};
use sqlx::postgres::PgPoolOptions;
use tonic::transport::Server;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

use data_ingestion::config::AppConfig;
use data_ingestion::consumers::{InstrumentConsumer, MarketDataConsumer};
use data_ingestion::grpc::DataIngestionGrpcService;
use data_ingestion::repository::PgMarketDataRepository;
use data_ingestion::subscription::{ExternalFacadeGrpcClient, SubscriptionGateway};

use trading_common::kafka::consumer::RetryConfig;
use trading_common::kafka::dlq::DlqPublisher;
use trading_common::proto::tradingbot::data_ingestion::data_ingestion_server::DataIngestionServer;
use trading_common::proto::tradingbot::external_api_facade::StartMarketDataSubscriptionRequest;
use trading_common::proto::tradingbot::portfolio_manager::{
    risk_and_portfolio_manager_client::RiskAndPortfolioManagerClient, ListInstrumentsRequest,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ── 1. Config ────────────────────────────────────────────────────────────
    let config = AppConfig::from_env().map_err(|e| anyhow::anyhow!(e.to_string()))?;

    // ── 2. Logging ───────────────────────────────────────────────────────────
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(EnvFilter::new(&config.log_level))
        .init();

    info!("data-ingestion starting up");

    // ── 3. Database pool + migrations ────────────────────────────────────────
    let pool = PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;
    info!("Database migrations applied");

    // ── 4. Shared components ─────────────────────────────────────────────────
    let repository = Arc::new(PgMarketDataRepository::new(pool));

    let gateway = Arc::new(
        ExternalFacadeGrpcClient::connect(config.external_api_facade_url.clone())?,
    );

    let dlq_producer: rdkafka::producer::FutureProducer = rdkafka::ClientConfig::new()
        .set("bootstrap.servers", &config.kafka_brokers)
        .set("message.timeout.ms", "5000")
        .create()?;
    let dlq = DlqPublisher::new(dlq_producer.clone());
    let dlq2 = DlqPublisher::new(dlq_producer);

    let retry_config = RetryConfig::default();

    // ── 5. Startup: re-subscribe to all known instruments ────────────────────
    // On restart the process has no in-memory state. Query Portfolio Manager
    // for every registered instrument and start market-data subscriptions so
    // we don't miss bars during the downtime window.
    // If Portfolio Manager is not yet reachable (e.g. during e2e startup),
    // skip re-subscription and rely on incoming instrument.registered events.
    {
        match RiskAndPortfolioManagerClient::connect(config.portfolio_manager_url.clone()).await {
            Err(e) => {
                info!(error = %e, "Portfolio Manager unreachable on startup — skipping re-subscription");
            }
            Ok(mut pm_client) => {
                match pm_client
                    .list_instruments(ListInstrumentsRequest {
                        instrument_ids: vec![], // empty = all instruments
                    })
                    .await
                {
                    Err(e) => {
                        info!(error = %e, "list_instruments failed on startup — skipping re-subscription");
                    }
                    Ok(resp) => {
                        let instruments = resp.into_inner().instruments;
                        info!(count = instruments.len(), "Re-subscribing to all instruments on startup");

                        for instrument in instruments {
                            for interval in &config.kafka_default_intervals {
                                let req = StartMarketDataSubscriptionRequest {
                                    instrument_id: instrument.id.clone(),
                                    symbol: instrument.symbol.clone(),
                                    venue: instrument.venue.clone(),
                                    intervals: vec![interval.clone()],
                                };
                                if let Err(e) = gateway.start_subscription(req).await {
                                    // Log and continue — a single subscription failure should not
                                    // prevent the service from starting.
                                    error!(
                                        instrument_id = %instrument.id,
                                        interval,
                                        error = %e,
                                        "Startup re-subscription failed"
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ── 6. Graceful shutdown signal ───────────────────────────────────────────
    let (tx, rx1) = tokio::sync::watch::channel(());
    let rx2 = rx1.clone();
    let rx3 = rx1.clone();

    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to listen for CTRL-C");
        info!("Shutdown signal received");
        let _ = tx.send(());
    });

    // ── 7. Spawn consumers ────────────────────────────────────────────────────
    let instrument_consumer = InstrumentConsumer::new(
        Arc::clone(&gateway),
        config.kafka_default_intervals.clone(),
        retry_config.clone(),
        dlq,
    );
    let market_data_consumer = MarketDataConsumer::new(
        Arc::clone(&repository),
        retry_config.clone(),
        dlq2,
    );

    let config_clone = config.clone();
    let instrument_task = tokio::spawn(async move {
        let mut rx = rx1;
        instrument_consumer
            .run(&config_clone, async move { rx.changed().await.ok(); })
            .await;
    });

    let config_clone2 = config.clone();
    let market_data_task = tokio::spawn(async move {
        let mut rx = rx2;
        market_data_consumer
            .run(&config_clone2, async move { rx.changed().await.ok(); })
            .await;
    });

    // ── 8. gRPC server ────────────────────────────────────────────────────────
    let grpc_addr: SocketAddr = format!("0.0.0.0:{}", config.grpc_port)
        .parse()
        .expect("invalid gRPC bind address");

    let grpc_service = DataIngestionGrpcService::new(Arc::clone(&repository));

    info!(%grpc_addr, "gRPC server listening");

    // ── 9. Metrics HTTP server ─────────────────────────────────────────────────
    // Serves GET /metrics in Prometheus text format.
    // Uses only tokio primitives — no extra HTTP framework needed.
    let metrics_addr: SocketAddr = format!("0.0.0.0:{}", config.metrics_port)
        .parse()
        .expect("invalid metrics bind address");
    let metrics_listener = tokio::net::TcpListener::bind(metrics_addr)
        .await
        .expect("failed to bind metrics port");
    info!(%metrics_addr, "metrics HTTP server listening");

    let rx4 = rx3.clone();
    tokio::spawn(async move {
        let mut shutdown = rx4;
        loop {
            tokio::select! {
                _ = shutdown.changed() => break,
                accept = metrics_listener.accept() => {
                    match accept {
                        Ok((mut stream, _)) => {
                            tokio::spawn(async move {
                                let encoder = TextEncoder::new();
                                let families = prometheus::gather();
                                let mut body = Vec::new();
                                let _ = encoder.encode(&families, &mut body);
                                let response = format!(
                                    "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                                    encoder.format_type(),
                                    body.len()
                                );
                                use tokio::io::AsyncWriteExt;
                                let _ = stream.write_all(response.as_bytes()).await;
                                let _ = stream.write_all(&body).await;
                            });
                        }
                        Err(_) => break,
                    }
                }
            }
        }
    });

    let mut rx = rx3;
    Server::builder()
        .add_service(DataIngestionServer::new(grpc_service))
        .serve_with_shutdown(grpc_addr, async move {
            rx.changed().await.ok();
        })
        .await?;

    // Wait for the consumer tasks to finish their in-flight messages.
    let _ = tokio::join!(instrument_task, market_data_task);
    info!("data-ingestion shut down cleanly");

    Ok(())
}
