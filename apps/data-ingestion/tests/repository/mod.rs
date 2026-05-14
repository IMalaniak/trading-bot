/// Integration tests for PgMarketDataRepository against a live TimescaleDB.
///
/// These tests require a running TimescaleDB instance with the migrations applied.
/// Run via: `npx nx run data-ingestion:test-integration`
///
/// The infra target (serve-integration) starts TimescaleDB on port 15433 and
/// the migrate target applies the schema before these tests execute.

use chrono::{TimeZone, Utc};
use rust_decimal::Decimal;
use sqlx::PgPool;
use std::str::FromStr;

use data_ingestion::domain::{BarsQuery, MarketDataBarRow};
use data_ingestion::repository::{
    market_data_repository::MarketDataRepository, pg_market_data_repository::PgMarketDataRepository,
};

/// Helper: build a minimal MarketDataBarRow with only the fields varied by each test.
fn make_bar(
    source_event_id: &str,
    instrument_id: &str,
    interval: &str,
    time_offset_secs: i64,
) -> MarketDataBarRow {
    MarketDataBarRow {
        time: Utc.timestamp_opt(1_700_000_000 + time_offset_secs, 0).unwrap(),
        instrument_id: instrument_id.to_owned(),
        symbol: "BTCUSDT".to_owned(),
        venue: "binance".to_owned(),
        interval: interval.to_owned(),
        open: Decimal::from_str("42000.5").unwrap(),
        high: Decimal::from_str("42100.0").unwrap(),
        low: Decimal::from_str("41900.0").unwrap(),
        close: Decimal::from_str("42050.25").unwrap(),
        volume: Decimal::from_str("1.23456789").unwrap(),
        quote_volume: Decimal::from_str("51975.12").unwrap(),
        trade_count: 1234,
        source_event_id: source_event_id.to_owned(),
    }
}

async fn connect() -> PgPool {
    let url = std::env::var("DATA_INGESTION_DATABASE_URL")
        .expect("DATA_INGESTION_DATABASE_URL must be set for integration tests");
    PgPool::connect(&url).await.expect("Failed to connect to TimescaleDB")
}

/// Clean up rows inserted by a specific test to keep tests independent.
async fn cleanup(pool: &PgPool, instrument_id: &str) {
    sqlx::query("DELETE FROM market_data_bars WHERE instrument_id = $1")
        .bind(instrument_id)
        .execute(pool)
        .await
        .expect("Cleanup failed");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn given_a_valid_bar_when_insert_then_it_can_be_queried_back() {
    let pool = connect().await;
    let repo = PgMarketDataRepository::new(pool.clone());
    let instrument_id = "integ-insert-query";
    cleanup(&pool, instrument_id).await;

    let bar = make_bar("evt-iq-001", instrument_id, "1m", 0);

    repo.insert_bar(&bar).await.expect("insert_bar should succeed");

    let query = BarsQuery {
        instrument_id: instrument_id.to_owned(),
        interval: "1m".to_owned(),
        from: Utc.timestamp_opt(0, 0).unwrap(),
        to: Utc.timestamp_opt(9_999_999_999, 0).unwrap(),
        limit: 10,
    };
    let results = repo.get_bars(&query).await.expect("get_bars should succeed");

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].source_event_id, "evt-iq-001");
    assert_eq!(results[0].instrument_id, instrument_id);
    assert_eq!(results[0].open, bar.open);
    assert_eq!(results[0].close, bar.close);

    cleanup(&pool, instrument_id).await;
}

#[tokio::test]
async fn given_duplicate_event_id_when_insert_twice_then_second_insert_is_ignored() {
    let pool = connect().await;
    let repo = PgMarketDataRepository::new(pool.clone());
    let instrument_id = "integ-idempotent";
    cleanup(&pool, instrument_id).await;

    let bar = make_bar("evt-idem-001", instrument_id, "1m", 0);

    repo.insert_bar(&bar).await.expect("first insert should succeed");
    repo.insert_bar(&bar).await.expect("second insert (duplicate) should be a no-op, not an error");

    let query = BarsQuery {
        instrument_id: instrument_id.to_owned(),
        interval: "1m".to_owned(),
        from: Utc.timestamp_opt(0, 0).unwrap(),
        to: Utc.timestamp_opt(9_999_999_999, 0).unwrap(),
        limit: 10,
    };
    let results = repo.get_bars(&query).await.expect("get_bars should succeed");

    assert_eq!(results.len(), 1, "duplicate insert must not create a second row");

    cleanup(&pool, instrument_id).await;
}

#[tokio::test]
async fn given_multiple_bars_when_queried_then_results_are_ordered_by_time_ascending() {
    let pool = connect().await;
    let repo = PgMarketDataRepository::new(pool.clone());
    let instrument_id = "integ-ordering";
    cleanup(&pool, instrument_id).await;

    // Insert in reverse order to confirm DB returns them sorted.
    let bar_t2 = make_bar("evt-ord-002", instrument_id, "1m", 120);
    let bar_t1 = make_bar("evt-ord-001", instrument_id, "1m", 60);
    let bar_t0 = make_bar("evt-ord-000", instrument_id, "1m", 0);

    for bar in [&bar_t2, &bar_t1, &bar_t0] {
        repo.insert_bar(bar).await.expect("insert should succeed");
    }

    let query = BarsQuery {
        instrument_id: instrument_id.to_owned(),
        interval: "1m".to_owned(),
        from: Utc.timestamp_opt(0, 0).unwrap(),
        to: Utc.timestamp_opt(9_999_999_999, 0).unwrap(),
        limit: 10,
    };
    let results = repo.get_bars(&query).await.expect("get_bars should succeed");

    assert_eq!(results.len(), 3);
    assert!(results[0].time <= results[1].time, "rows must be ordered ASC by time");
    assert!(results[1].time <= results[2].time, "rows must be ordered ASC by time");

    cleanup(&pool, instrument_id).await;
}

#[tokio::test]
async fn given_bars_outside_time_range_when_queried_then_they_are_excluded() {
    let pool = connect().await;
    let repo = PgMarketDataRepository::new(pool.clone());
    let instrument_id = "integ-time-filter";
    cleanup(&pool, instrument_id).await;

    // Three bars at t=0, t=60, t=120.  Query only covers t=30..t=90.
    for (id, offset) in [("evt-tf-0", 0), ("evt-tf-60", 60), ("evt-tf-120", 120)] {
        repo.insert_bar(&make_bar(id, instrument_id, "1m", offset))
            .await
            .expect("insert should succeed");
    }

    let from = Utc.timestamp_opt(1_700_000_030, 0).unwrap();
    let to = Utc.timestamp_opt(1_700_000_090, 0).unwrap();
    let query = BarsQuery {
        instrument_id: instrument_id.to_owned(),
        interval: "1m".to_owned(),
        from,
        to,
        limit: 10,
    };
    let results = repo.get_bars(&query).await.expect("get_bars should succeed");

    assert_eq!(results.len(), 1, "only the bar within the time range should be returned");
    assert_eq!(results[0].source_event_id, "evt-tf-60");

    cleanup(&pool, instrument_id).await;
}

#[tokio::test]
async fn given_limit_is_set_when_queried_then_result_is_capped() {
    let pool = connect().await;
    let repo = PgMarketDataRepository::new(pool.clone());
    let instrument_id = "integ-limit";
    cleanup(&pool, instrument_id).await;

    for i in 0..5_i64 {
        repo.insert_bar(&make_bar(
            &format!("evt-lim-{i:03}"),
            instrument_id,
            "1m",
            i * 60,
        ))
        .await
        .expect("insert should succeed");
    }

    let query = BarsQuery {
        instrument_id: instrument_id.to_owned(),
        interval: "1m".to_owned(),
        from: Utc.timestamp_opt(0, 0).unwrap(),
        to: Utc.timestamp_opt(9_999_999_999, 0).unwrap(),
        limit: 3,
    };
    let results = repo.get_bars(&query).await.expect("get_bars should succeed");

    assert_eq!(results.len(), 3, "limit must cap the result set");

    cleanup(&pool, instrument_id).await;
}
