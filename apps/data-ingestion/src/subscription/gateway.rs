use async_trait::async_trait;
use trading_common::proto::tradingbot::external_api_facade::StartMarketDataSubscriptionRequest;

use crate::error::AppError;

pub type Result<T> = std::result::Result<T, AppError>;

/// Abstraction over the External API Facade gRPC service.
///
/// Any component that needs to start/stop market-data subscriptions depends on
/// this trait rather than on the concrete gRPC client. This makes unit testing
/// straightforward — callers receive a `MockSubscriptionGateway` in tests and
/// never open a real network connection.
#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait SubscriptionGateway: Send + Sync {
    /// Ask the External API Facade to begin streaming market data for the
    /// instrument described in `req` (symbol, venue, interval).
    async fn start_subscription(
        &self,
        req: StartMarketDataSubscriptionRequest,
    ) -> Result<()>;

    /// Cancel an active subscription by instrument identifier.
    async fn stop_subscription(&self, instrument_id: &str) -> Result<()>;
}
