// Domain entity for a stored OHLCV candlestick bar.
//
// TypeScript analogy:
//   export interface MarketDataBarRow {
//     instrumentId: string;
//     symbol: string;
//     ...
//   }
//
// This is the internal representation used between the repository and
// the business logic. It differs from:
//   - `trading_common::proto::tradingbot::events::MarketDataBar`
//     (the Kafka message coming from External API Facade — has `is_final`)
//   - `trading_common::proto::tradingbot::data_ingestion::MarketDataBarRecord`
//     (the gRPC response type — prices as strings for proto compat)
//
// Prices are `rust_decimal::Decimal` here — exact fixed-point arithmetic,
// no floating-point rounding. sqlx maps NUMERIC(36,18) ↔ Decimal natively.
//
// Note: we use `chrono::DateTime<Utc>` for timestamps — sqlx maps
// TIMESTAMPTZ ↔ DateTime<Utc> natively via the `chrono` feature.

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;

/// A single OHLCV bar as stored in the `market_data_bars` hypertable.
///
/// `#[derive(sqlx::FromRow)]` lets sqlx automatically map a `SELECT` result row
/// to this struct — like TypeORM's `@Entity` mapping but checked at runtime.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
pub struct MarketDataBarRow {
    pub time: DateTime<Utc>,
    pub instrument_id: String,
    pub symbol: String,
    pub venue: String,
    pub interval: String,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub volume: Decimal,
    pub quote_volume: Decimal,
    pub trade_count: i64,
    /// Kafka event-id header — used as idempotency key.
    pub source_event_id: String,
}

/// Query parameters for `MarketDataRepository::get_bars`.
///
/// TypeScript analogy:
///   interface GetBarsOptions {
///     instrumentId: string;
///     interval: string;
///     fromMs: number;
///     toMs: number;
///     limit: number;
///   }
#[derive(Debug, Clone)]
pub struct BarsQuery {
    pub instrument_id: String,
    pub interval: String,
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    /// Maximum rows to return. Defaults to 500 if 0.
    pub limit: i64,
}

impl BarsQuery {
    pub fn effective_limit(&self) -> i64 {
        if self.limit <= 0 {
            500
        } else {
            self.limit
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn effective_limit_returns_500_when_zero() {
        let q = BarsQuery {
            instrument_id: "inst-1".into(),
            interval: "1m".into(),
            from: Utc::now(),
            to: Utc::now(),
            limit: 0,
        };
        assert_eq!(q.effective_limit(), 500);
    }

    #[test]
    fn effective_limit_returns_value_when_positive() {
        let q = BarsQuery {
            instrument_id: "inst-1".into(),
            interval: "1m".into(),
            from: Utc::now(),
            to: Utc::now(),
            limit: 100,
        };
        assert_eq!(q.effective_limit(), 100);
    }
}
