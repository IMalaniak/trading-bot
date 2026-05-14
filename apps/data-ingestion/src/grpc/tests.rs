#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use chrono::Utc;
    use rust_decimal::Decimal;
    use tonic::Request;

    use trading_common::proto::tradingbot::data_ingestion::data_ingestion_server::DataIngestion;
    use trading_common::proto::tradingbot::data_ingestion::GetMarketDataBarsRequest;

    use crate::domain::MarketDataBarRow;
    use crate::grpc::data_ingestion_service::DataIngestionGrpcService;
    use crate::repository::market_data_repository::{
        MockMarketDataRepository,
    };

    fn make_row(symbol: &str) -> MarketDataBarRow {
        MarketDataBarRow {
            time:          Utc::now(),
            instrument_id: "inst-1".to_owned(),
            symbol:        symbol.to_owned(),
            venue:         "BINANCE".to_owned(),
            interval:      "1m".to_owned(),
            open:          Decimal::new(40000, 0),
            high:          Decimal::new(40100, 0),
            low:           Decimal::new(39900, 0),
            close:         Decimal::new(40050, 0),
            volume:        Decimal::new(100, 0),
            quote_volume:  Decimal::new(4_000_000, 0),
            trade_count:   1000,
            source_event_id: "evt-1".to_owned(),
        }
    }

    fn make_request(from_ms: i64, to_ms: i64) -> Request<GetMarketDataBarsRequest> {
        Request::new(GetMarketDataBarsRequest {
            instrument_id: "inst-1".to_owned(),
            interval: "1m".to_owned(),
            from_ms,
            to_ms,
            limit: 0,
        })
    }

    #[tokio::test]
    async fn returns_bars_from_repository() {
        let mut mock = MockMarketDataRepository::new();
        mock.expect_get_bars()
            .times(1)
            .returning(|_| Ok(vec![make_row("BTCUSDT")]));

        let svc = DataIngestionGrpcService::new(Arc::new(mock));
        let resp = svc
            .get_market_data_bars(make_request(1_700_000_000_000, 1_700_001_000_000))
            .await
            .expect("should succeed");

        assert_eq!(resp.get_ref().bars.len(), 1);
        assert_eq!(resp.get_ref().bars[0].symbol, "BTCUSDT");
    }

    #[tokio::test]
    async fn returns_empty_vec_when_no_bars() {
        let mut mock = MockMarketDataRepository::new();
        mock.expect_get_bars()
            .times(1)
            .returning(|_| Ok(vec![]));

        let svc = DataIngestionGrpcService::new(Arc::new(mock));
        let resp = svc
            .get_market_data_bars(make_request(1_700_000_000_000, 1_700_001_000_000))
            .await
            .expect("should succeed");

        assert_eq!(resp.get_ref().bars.len(), 0);
    }

    #[tokio::test]
    async fn returns_invalid_argument_for_bad_from_ms() {
        let mock = MockMarketDataRepository::new();
        let svc = DataIngestionGrpcService::new(Arc::new(mock));

        // i64::MIN is not a valid Unix ms timestamp
        let result = svc
            .get_market_data_bars(make_request(i64::MIN, 1_700_001_000_000))
            .await;

        assert!(result.is_err());
        let status = result.unwrap_err();
        assert_eq!(status.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn returns_invalid_argument_when_from_after_to() {
        let mock = MockMarketDataRepository::new();
        let svc = DataIngestionGrpcService::new(Arc::new(mock));

        let result = svc
            .get_market_data_bars(make_request(1_700_001_000_000, 1_700_000_000_000))
            .await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn propagates_repository_error_as_internal() {
        let mut mock = MockMarketDataRepository::new();
        mock.expect_get_bars()
            .times(1)
            .returning(|_| Err(anyhow::anyhow!("DB connection lost")));

        let svc = DataIngestionGrpcService::new(Arc::new(mock));
        let result = svc
            .get_market_data_bars(make_request(1_700_000_000_000, 1_700_001_000_000))
            .await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code(), tonic::Code::Internal);
    }
}
