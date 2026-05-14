#[cfg(test)]
mod tests {
    use mockall::predicate::*;
    use trading_common::proto::tradingbot::external_api_facade::StartMarketDataSubscriptionRequest;

    use crate::error::AppError;
    use crate::subscription::gateway::{MockSubscriptionGateway, SubscriptionGateway};

    fn make_request(symbol: &str, venue: &str, interval: &str) -> StartMarketDataSubscriptionRequest {
        StartMarketDataSubscriptionRequest {
            instrument_id: format!("{}-{}", symbol, venue),
            symbol: symbol.to_owned(),
            venue: venue.to_owned(),
            intervals: vec![interval.to_owned()],
        }
    }

    #[tokio::test]
    async fn start_subscription_delegates_to_gateway() {
        let req = make_request("BTCUSD", "COINBASE", "1m");
        let req_clone = req.clone();

        let mut mock = MockSubscriptionGateway::new();
        mock.expect_start_subscription()
            .with(eq(req_clone))
            .times(1)
            .returning(|_| Ok(()));

        let result = mock.start_subscription(req).await;
        assert!(result.is_ok(), "start_subscription should succeed");
    }

    #[tokio::test]
    async fn start_subscription_propagates_grpc_error() {
        let req = make_request("ETHUSD", "KRAKEN", "5m");

        let mut mock = MockSubscriptionGateway::new();
        mock.expect_start_subscription()
            .times(1)
            .returning(|_| Err(AppError::from(tonic::Status::unavailable("service down"))));

        let result = mock.start_subscription(req).await;
        assert!(
            matches!(result, Err(AppError::Grpc(_))),
            "gRPC error should be surfaced as AppError::Grpc"
        );
    }

    #[tokio::test]
    async fn stop_subscription_delegates_to_gateway() {
        let instrument_id = "BTCUSD-COINBASE";

        let mut mock = MockSubscriptionGateway::new();
        mock.expect_stop_subscription()
            .with(eq(instrument_id))
            .times(1)
            .returning(|_| Ok(()));

        let result = mock.stop_subscription(instrument_id).await;
        assert!(result.is_ok(), "stop_subscription should succeed");
    }

    #[tokio::test]
    async fn stop_subscription_propagates_grpc_error() {
        let mut mock = MockSubscriptionGateway::new();
        mock.expect_stop_subscription()
            .times(1)
            .returning(|_| Err(AppError::from(tonic::Status::not_found("no such subscription"))));

        let result = mock.stop_subscription("UNKNOWN-VENUE").await;
        assert!(
            matches!(result, Err(AppError::Grpc(_))),
            "gRPC error should propagate"
        );
    }
}
