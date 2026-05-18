use async_trait::async_trait;
use tonic::{transport::Channel, Request};

use trading_common::proto::tradingbot::data_ingestion::{
    data_ingestion_client::DataIngestionClient, GetMarketDataBarsRequest,
};

use crate::domain::{interval_to_millis, MarketDataBarInput};
use crate::error::FeatureEngineeringError;

#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait WarmupGateway: Send + Sync {
    async fn get_prior_bars(
        &self,
        bar: &MarketDataBarInput,
        limit: u32,
    ) -> Result<Vec<MarketDataBarInput>, FeatureEngineeringError>;
}

pub struct DataIngestionWarmupClient {
    client: tokio::sync::Mutex<DataIngestionClient<Channel>>,
}

impl DataIngestionWarmupClient {
    pub async fn connect(url: String) -> Result<Self, tonic::transport::Error> {
        let client = DataIngestionClient::connect(url).await?;
        Ok(Self {
            client: tokio::sync::Mutex::new(client),
        })
    }
}

#[async_trait]
impl WarmupGateway for DataIngestionWarmupClient {
    async fn get_prior_bars(
        &self,
        bar: &MarketDataBarInput,
        limit: u32,
    ) -> Result<Vec<MarketDataBarInput>, FeatureEngineeringError> {
        let interval_ms = interval_to_millis(&bar.interval)?;
        let lookback_ms = interval_ms.saturating_mul(i64::from(limit));
        let from_ms = bar.open_time_ms.saturating_sub(lookback_ms);
        let to_ms = bar.open_time_ms.saturating_sub(1);

        let request = GetMarketDataBarsRequest {
            instrument_id: bar.instrument_id.clone(),
            interval: bar.interval.clone(),
            from_ms,
            to_ms,
            limit: limit.min(i32::MAX as u32) as i32,
        };

        let mut client = self.client.lock().await;
        let response = client
            .get_market_data_bars(Request::new(request))
            .await
            .map_err(|error| FeatureEngineeringError::Warmup(error.to_string()))?;

        response
            .into_inner()
            .bars
            .into_iter()
            .map(MarketDataBarInput::from_record)
            .collect()
    }
}
