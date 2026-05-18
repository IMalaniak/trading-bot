use std::str::FromStr;

use rust_decimal::{prelude::ToPrimitive, Decimal};
use trading_common::proto::tradingbot::{
    data_ingestion::MarketDataBarRecord, events::MarketDataBar,
};

use crate::error::FeatureEngineeringError;

#[derive(Debug, Clone, PartialEq)]
pub struct MarketDataBarInput {
    pub instrument_id: String,
    pub symbol: String,
    pub venue: String,
    pub interval: String,
    pub open_time_ms: i64,
    pub close_time_ms: i64,
    pub close: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FeatureSeriesKey {
    pub instrument_id: String,
    pub interval: String,
}

impl FeatureSeriesKey {
    pub fn from_bar(bar: &MarketDataBarInput) -> Self {
        Self {
            instrument_id: bar.instrument_id.clone(),
            interval: bar.interval.clone(),
        }
    }
}

impl MarketDataBarInput {
    pub fn from_proto(bar: &MarketDataBar) -> Result<Self, FeatureEngineeringError> {
        Ok(Self {
            instrument_id: bar.instrument_id.clone(),
            symbol: bar.symbol.clone(),
            venue: bar.venue.clone(),
            interval: bar.interval.clone(),
            open_time_ms: bar.open_time_ms,
            close_time_ms: bar.close_time_ms,
            close: parse_positive_close(&bar.close)?,
        })
    }

    pub fn from_record(record: MarketDataBarRecord) -> Result<Self, FeatureEngineeringError> {
        Ok(Self {
            instrument_id: record.instrument_id,
            symbol: record.symbol,
            venue: record.venue,
            interval: record.interval,
            open_time_ms: record.open_time_ms,
            close_time_ms: record.close_time_ms,
            close: parse_positive_close(&record.close)?,
        })
    }
}

pub fn fallback_market_data_event_id(bar: &MarketDataBar) -> String {
    format!(
        "raw:{}:{}:{}:{}",
        bar.instrument_id, bar.interval, bar.open_time_ms, bar.close_time_ms
    )
}

pub fn feature_vector_id(bar: &MarketDataBarInput) -> String {
    format!(
        "feat:{}:{}:{}:core-v1",
        bar.instrument_id, bar.interval, bar.open_time_ms
    )
}

pub fn market_data_bar_identity(bar: &MarketDataBarInput) -> String {
    format!(
        "{}:{}:{}",
        bar.instrument_id, bar.interval, bar.open_time_ms
    )
}

fn parse_positive_close(value: &str) -> Result<f64, FeatureEngineeringError> {
    let decimal =
        Decimal::from_str(value).map_err(|_| FeatureEngineeringError::InvalidDecimal {
            field: "close",
            value: value.to_string(),
        })?;

    let close = decimal
        .to_f64()
        .ok_or_else(|| FeatureEngineeringError::InvalidDecimal {
            field: "close",
            value: value.to_string(),
        })?;

    if close <= 0.0 {
        return Err(FeatureEngineeringError::NonPositiveClose(value.to_string()));
    }

    Ok(close)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_deterministic_feature_vector_id() {
        let bar = MarketDataBarInput {
            instrument_id: "btc-usdt".to_string(),
            symbol: "BTCUSDT".to_string(),
            venue: "BINANCE".to_string(),
            interval: "1m".to_string(),
            open_time_ms: 1_775_044_800_000,
            close_time_ms: 1_775_044_859_999,
            close: 62_000.0,
        };

        assert_eq!(
            feature_vector_id(&bar),
            "feat:btc-usdt:1m:1775044800000:core-v1"
        );
    }

    #[test]
    fn bar_identity_ignores_derived_close_time() {
        let first = MarketDataBarInput {
            instrument_id: "btc-usdt".to_string(),
            symbol: "BTCUSDT".to_string(),
            venue: "BINANCE".to_string(),
            interval: "1m".to_string(),
            open_time_ms: 1_775_044_800_000,
            close_time_ms: 1_775_044_800_001,
            close: 62_000.0,
        };
        let second = MarketDataBarInput {
            close_time_ms: 1_775_044_859_999,
            ..first.clone()
        };

        assert_eq!(
            market_data_bar_identity(&first),
            market_data_bar_identity(&second)
        );
    }
}
