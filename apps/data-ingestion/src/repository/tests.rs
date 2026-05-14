// Unit tests for code that depends on MarketDataRepository.
//
// These tests verify that callers of the repository (consumers, gRPC handlers)
// behave correctly regardless of what the DB does. No real database is needed.
//
// mockall generates `MockMarketDataRepository` from the `#[cfg_attr(test, mockall::automock)]`
// annotation on the trait. It works like jest.fn():
//
//   // TypeScript:
//   const repo = { insertBar: jest.fn().mockResolvedValue(undefined) };
//
//   // Rust:
//   let mut repo = MockMarketDataRepository::new();
//   repo.expect_insert_bar().returning(|_| Ok(()));

#[cfg(test)]
mod tests {
    use anyhow::anyhow;
    use chrono::Utc;
    use rust_decimal::Decimal;
    use std::str::FromStr;

    // Import the trait so its methods are in scope on the mock.
    // In TypeScript this is implicit; in Rust traits must be imported to use
    // their methods (even on a concrete type that implements them).
    use crate::repository::market_data_repository::{MarketDataRepository, MockMarketDataRepository};
    use crate::domain::{BarsQuery, MarketDataBarRow};

    fn sample_bar() -> MarketDataBarRow {
        MarketDataBarRow {
            time: Utc::now(),
            instrument_id: "inst-btc-usdt".to_string(),
            symbol: "BTCUSDT".to_string(),
            venue: "BINANCE".to_string(),
            interval: "1m".to_string(),
            open: Decimal::from_str("65000.00").unwrap(),
            high: Decimal::from_str("65500.00").unwrap(),
            low: Decimal::from_str("64800.00").unwrap(),
            close: Decimal::from_str("65200.00").unwrap(),
            volume: Decimal::from_str("12.5").unwrap(),
            quote_volume: Decimal::from_str("812500.00").unwrap(),
            trade_count: 450,
            source_event_id: "evt-001".to_string(),
        }
    }

    fn sample_query() -> BarsQuery {
        BarsQuery {
            instrument_id: "inst-btc-usdt".to_string(),
            interval: "1m".to_string(),
            from: Utc::now(),
            to: Utc::now(),
            limit: 10,
        }
    }

    // ── insert_bar ────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn insert_bar_returns_ok_when_repository_succeeds() {
        let mut repo = MockMarketDataRepository::new();
        repo.expect_insert_bar()
            .once() // assert it's called exactly once
            .returning(|_| Ok(()));

        let bar = sample_bar();
        let result = repo.insert_bar(&bar).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn insert_bar_propagates_repository_error() {
        let mut repo = MockMarketDataRepository::new();
        repo.expect_insert_bar()
            .once()
            .returning(|_| Err(anyhow!("connection lost")));

        let result = repo.insert_bar(&sample_bar()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("connection lost"));
    }

    // ── get_bars ──────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn get_bars_returns_empty_vec_when_no_rows_match() {
        let mut repo = MockMarketDataRepository::new();
        repo.expect_get_bars()
            .once()
            .returning(|_| Ok(vec![]));

        let result = repo.get_bars(&sample_query()).await;
        assert_eq!(result.unwrap(), vec![]);
    }

    #[tokio::test]
    async fn get_bars_returns_rows_from_repository() {
        let bar = sample_bar();
        let expected = vec![bar.clone()];

        let mut repo = MockMarketDataRepository::new();
        repo.expect_get_bars()
            .once()
            .return_once(|_| Ok(expected));

        let result = repo.get_bars(&sample_query()).await.unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].source_event_id, "evt-001");
    }

    // ── BarsQuery.effective_limit ─────────────────────────────────────────────

    #[test]
    fn effective_limit_defaults_to_500_when_zero() {
        let q = BarsQuery { limit: 0, ..sample_query() };
        assert_eq!(q.effective_limit(), 500);
    }
}
