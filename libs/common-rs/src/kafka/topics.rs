pub const INSTRUMENT_REGISTERED: &str = "instrument.registered";
pub const INSTRUMENT_REGISTERED_DLQ: &str = "instrument.registered.dlq";

pub const MARKET_RAW_DATA: &str = "market.raw.data";
pub const MARKET_RAW_DATA_DLQ: &str = "market.raw.data.dlq";

pub const FEATURES_INDICATORS: &str = "features.indicators";

pub const TRADING_SIGNALS: &str = "trading.signals";
pub const TRADING_SIGNALS_DLQ: &str = "trading.signals.dlq";

pub const TRADING_SIGNALS_PORTFOLIO: &str = "trading.signals.portfolio";
pub const TRADING_SIGNALS_PORTFOLIO_DLQ: &str = "trading.signals.portfolio.dlq";

pub const TRADES_APPROVED: &str = "trades.approved";
pub const TRADES_APPROVED_DLQ: &str = "trades.approved.dlq";

pub const TRADES_REJECTED: &str = "trades.rejected";

pub const ORDERS_PLACED: &str = "orders.placed";

pub const ORDERS_FILLS: &str = "orders.fills";
pub const ORDERS_FILLS_DLQ: &str = "orders.fills.dlq";

pub const PORTFOLIO_UPDATED: &str = "portfolio.updated";

pub mod schema_versions {
    pub const INSTRUMENT_REGISTERED: &str = "1";
    pub const MARKET_RAW_DATA: &str = "1";
    pub const FEATURES_INDICATORS: &str = "1";
    pub const TRADING_SIGNALS: &str = "1";
    pub const TRADING_SIGNALS_PORTFOLIO: &str = "1";
    pub const TRADES_APPROVED: &str = "1";
    pub const TRADES_REJECTED: &str = "1";
    pub const ORDERS_PLACED: &str = "1";
    pub const ORDERS_FILLS: &str = "1";
    pub const PORTFOLIO_UPDATED: &str = "1";
    pub const INSTRUMENT_REGISTERED_DLQ: &str = "1";
    pub const MARKET_RAW_DATA_DLQ: &str = "1";
    pub const TRADING_SIGNALS_DLQ: &str = "1";
    pub const TRADING_SIGNALS_PORTFOLIO_DLQ: &str = "1";
    pub const TRADES_APPROVED_DLQ: &str = "1";
    pub const ORDERS_FILLS_DLQ: &str = "1";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_feature_topic_contract() {
        assert_eq!(FEATURES_INDICATORS, "features.indicators");
        assert_eq!(schema_versions::FEATURES_INDICATORS, "1");
    }
}
