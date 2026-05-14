use std::sync::Arc;

use chrono::DateTime;
use tonic::{Request, Response, Status};
use tracing::instrument;

use trading_common::proto::tradingbot::data_ingestion::{
    data_ingestion_server::DataIngestion, GetMarketDataBarsRequest, GetMarketDataBarsResponse,
    MarketDataBarRecord,
};

use crate::domain::BarsQuery;
use crate::repository::MarketDataRepository;

/// tonic gRPC server implementation for the `DataIngestion` service.
///
/// The generic parameter `R` allows swapping the repository in tests with a
/// `MockMarketDataRepository` — the same pattern used by the consumers.
pub struct DataIngestionGrpcService<R: MarketDataRepository> {
    repository: Arc<R>,
}

impl<R: MarketDataRepository> DataIngestionGrpcService<R> {
    pub fn new(repository: Arc<R>) -> Self {
        Self { repository }
    }
}

#[tonic::async_trait]
impl<R> DataIngestion for DataIngestionGrpcService<R>
where
    R: MarketDataRepository + 'static,
{
    #[instrument(skip(self, request))]
    async fn get_market_data_bars(
        &self,
        request: Request<GetMarketDataBarsRequest>,
    ) -> Result<Response<GetMarketDataBarsResponse>, Status> {
        let req = request.into_inner();

        // Convert Unix-ms timestamps to DateTime<Utc>.
        // Invalid timestamps become gRPC InvalidArgument errors.
        let from = DateTime::from_timestamp_millis(req.from_ms).ok_or_else(|| {
            Status::invalid_argument(format!("invalid from_ms: {}", req.from_ms))
        })?;
        let to = DateTime::from_timestamp_millis(req.to_ms).ok_or_else(|| {
            Status::invalid_argument(format!("invalid to_ms: {}", req.to_ms))
        })?;

        if from > to {
            return Err(Status::invalid_argument("from_ms must be <= to_ms"));
        }

        let query = BarsQuery {
            instrument_id: req.instrument_id,
            interval: req.interval,
            from,
            to,
            limit: req.limit as i64,
        };

        let rows = self
            .repository
            .get_bars(&query)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let bars = rows
            .into_iter()
            .map(|row| MarketDataBarRecord {
                instrument_id: row.instrument_id,
                symbol: row.symbol,
                venue: row.venue,
                interval: row.interval,
                open_time_ms: row.time.timestamp_millis(),
                // close_time_ms is not stored; derive it as open + 1ms so the
                // field is non-zero. Consumers that need the real close time
                // should store it separately (future schema iteration).
                close_time_ms: row.time.timestamp_millis() + 1,
                open: row.open.to_string(),
                high: row.high.to_string(),
                low: row.low.to_string(),
                close: row.close.to_string(),
                volume: row.volume.to_string(),
                quote_volume: row.quote_volume.to_string(),
                trade_count: row.trade_count,
            })
            .collect();

        Ok(Response::new(GetMarketDataBarsResponse { bars }))
    }
}
