use async_trait::async_trait;
use tonic::transport::Channel;
use tracing::instrument;

use trading_common::proto::tradingbot::external_api_facade::{
    external_api_facade_client::ExternalApiFacadeClient, StartMarketDataSubscriptionRequest,
    StopMarketDataSubscriptionRequest,
};

use crate::error::AppError;

use super::gateway::{Result, SubscriptionGateway};

/// gRPC client wrapper around the External API Facade service.
///
/// In production this is wired up to the real service endpoint. In tests the
/// `SubscriptionGateway` trait is mocked so this struct is never instantiated.
pub struct ExternalFacadeGrpcClient {
    client: ExternalApiFacadeClient<Channel>,
}

impl ExternalFacadeGrpcClient {
    /// Create a new client connected to `endpoint`
    /// (e.g. `"http://external-api-facade:50053"`).
    pub async fn connect(endpoint: String) -> std::result::Result<Self, AppError> {
        let client = ExternalApiFacadeClient::connect(endpoint)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        Ok(Self { client })
    }
}

#[async_trait]
impl SubscriptionGateway for ExternalFacadeGrpcClient {
    #[instrument(skip(self, req), fields(symbol = %req.symbol, venue = %req.venue))]
    async fn start_subscription(
        &self,
        req: StartMarketDataSubscriptionRequest,
    ) -> Result<()> {
        self.client
            .clone()
            .start_market_data_subscription(req)
            .await
            .map(|_| ())
            .map_err(AppError::from)
    }

    #[instrument(skip(self), fields(instrument_id))]
    async fn stop_subscription(&self, instrument_id: &str) -> Result<()> {
        let req = StopMarketDataSubscriptionRequest {
            instrument_id: instrument_id.to_owned(),
        };
        self.client
            .clone()
            .stop_market_data_subscription(req)
            .await
            .map(|_| ())
            .map_err(AppError::from)
    }
}
