use std::net::SocketAddr;

use prometheus::{register_int_counter, Encoder, IntCounter, TextEncoder};
use tokio::io::AsyncWriteExt;
use tracing::info;

#[cfg_attr(test, mockall::automock)]
pub trait FeatureEngineeringMetrics: Send + Sync {
    fn increment_bars_consumed(&self);
    fn increment_warmups(&self);
    fn increment_feature_vectors_published(&self);
    fn increment_skipped_warmup_bars(&self);
    fn increment_dlq_attempts(&self);
}

#[derive(Debug, Clone, Default)]
pub struct NoopFeatureEngineeringMetrics;

impl FeatureEngineeringMetrics for NoopFeatureEngineeringMetrics {
    fn increment_bars_consumed(&self) {}
    fn increment_warmups(&self) {}
    fn increment_feature_vectors_published(&self) {}
    fn increment_skipped_warmup_bars(&self) {}
    fn increment_dlq_attempts(&self) {}
}

#[derive(Debug, Clone)]
pub struct PrometheusFeatureEngineeringMetrics {
    bars_consumed: IntCounter,
    warmups: IntCounter,
    feature_vectors_published: IntCounter,
    skipped_warmup_bars: IntCounter,
    dlq_attempts: IntCounter,
}

impl PrometheusFeatureEngineeringMetrics {
    pub fn new() -> Result<Self, prometheus::Error> {
        Ok(Self {
            bars_consumed: register_int_counter!(
                "feature_engineering_market_bars_consumed_total",
                "Number of market.raw.data messages consumed by Feature Engineering"
            )?,
            warmups: register_int_counter!(
                "feature_engineering_warmups_total",
                "Number of rolling-state warm-ups requested from Data Ingestion"
            )?,
            feature_vectors_published: register_int_counter!(
                "feature_engineering_feature_vectors_published_total",
                "Number of features.indicators vectors published"
            )?,
            skipped_warmup_bars: register_int_counter!(
                "feature_engineering_warmup_skipped_bars_total",
                "Number of final bars observed before the core feature set was ready"
            )?,
            dlq_attempts: register_int_counter!(
                "feature_engineering_dlq_attempts_total",
                "Number of attempts to publish malformed or failed market-data events to DLQ"
            )?,
        })
    }
}

impl FeatureEngineeringMetrics for PrometheusFeatureEngineeringMetrics {
    fn increment_bars_consumed(&self) {
        self.bars_consumed.inc();
    }

    fn increment_warmups(&self) {
        self.warmups.inc();
    }

    fn increment_feature_vectors_published(&self) {
        self.feature_vectors_published.inc();
    }

    fn increment_skipped_warmup_bars(&self) {
        self.skipped_warmup_bars.inc();
    }

    fn increment_dlq_attempts(&self) {
        self.dlq_attempts.inc();
    }
}

pub async fn serve_metrics(
    port: u16,
    shutdown: impl std::future::Future<Output = ()>,
) -> anyhow::Result<()> {
    tokio::pin!(shutdown);
    let metrics_addr: SocketAddr = format!("0.0.0.0:{port}").parse()?;
    let metrics_listener = tokio::net::TcpListener::bind(metrics_addr).await?;
    info!(%metrics_addr, "feature-engineering metrics HTTP server listening");

    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            accept = metrics_listener.accept() => {
                let (mut stream, _) = accept?;
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
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.write_all(&body).await;
                });
            }
        }
    }

    Ok(())
}
