use std::collections::VecDeque;

use ta::indicators::{
    ExponentialMovingAverage, MovingAverageConvergenceDivergence, RelativeStrengthIndex,
    SimpleMovingAverage,
};
use ta::Next;

use crate::domain::MarketDataBarInput;

pub const CORE_FEATURE_SET: &str = "core-v1";

const SMA_CLOSE_20: &str = "sma.close.20";
const EMA_CLOSE_12: &str = "ema.close.12";
const EMA_CLOSE_26: &str = "ema.close.26";
const RSI_CLOSE_14: &str = "rsi.close.14";
const MACD_CLOSE_12_26_9: &str = "macd.close.12_26_9";
const MACD_SIGNAL_CLOSE_12_26_9: &str = "macd_signal.close.12_26_9";
const MACD_HISTOGRAM_CLOSE_12_26_9: &str = "macd_histogram.close.12_26_9";
const RETURN_CLOSE_1: &str = "return.close.1";
const VOLATILITY_LOG_RETURN_20: &str = "volatility.log_return.20";

const VOLATILITY_WINDOW: usize = 20;
const READY_CLOSE_COUNT: u64 = 35;

#[derive(Debug, Clone, PartialEq)]
pub struct NamedFeatureValue {
    pub name: &'static str,
    pub value: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CoreFeatureSnapshot {
    pub values: Vec<NamedFeatureValue>,
}

#[derive(Debug, Clone)]
pub struct CoreFeatureCalculator {
    sma_close_20: SimpleMovingAverage,
    ema_close_12: ExponentialMovingAverage,
    ema_close_26: ExponentialMovingAverage,
    rsi_close_14: RelativeStrengthIndex,
    macd_close_12_26_9: MovingAverageConvergenceDivergence,
    last_close: Option<f64>,
    log_returns: VecDeque<f64>,
    close_count: u64,
}

impl Default for CoreFeatureCalculator {
    fn default() -> Self {
        Self {
            sma_close_20: SimpleMovingAverage::new(20).expect("valid SMA period"),
            ema_close_12: ExponentialMovingAverage::new(12).expect("valid EMA period"),
            ema_close_26: ExponentialMovingAverage::new(26).expect("valid EMA period"),
            rsi_close_14: RelativeStrengthIndex::new(14).expect("valid RSI period"),
            macd_close_12_26_9: MovingAverageConvergenceDivergence::new(12, 26, 9)
                .expect("valid MACD periods"),
            last_close: None,
            log_returns: VecDeque::with_capacity(VOLATILITY_WINDOW),
            close_count: 0,
        }
    }
}

impl CoreFeatureCalculator {
    pub fn observe(&mut self, bar: &MarketDataBarInput) -> Option<CoreFeatureSnapshot> {
        let close = bar.close;
        let previous_close = self.last_close;
        let return_close_1 = previous_close.map(|previous| (close / previous) - 1.0);

        if let Some(previous) = previous_close {
            let log_return = (close / previous).ln();
            self.log_returns.push_back(log_return);
            if self.log_returns.len() > VOLATILITY_WINDOW {
                self.log_returns.pop_front();
            }
        }

        let sma_close_20 = self.sma_close_20.next(close);
        let ema_close_12 = self.ema_close_12.next(close);
        let ema_close_26 = self.ema_close_26.next(close);
        let rsi_close_14 = self.rsi_close_14.next(close);
        let macd = self.macd_close_12_26_9.next(close);

        self.last_close = Some(close);
        self.close_count += 1;

        if self.close_count < READY_CLOSE_COUNT || self.log_returns.len() < VOLATILITY_WINDOW {
            return None;
        }

        let return_close_1 = return_close_1?;
        let volatility = population_standard_deviation(&self.log_returns);

        Some(CoreFeatureSnapshot {
            values: vec![
                NamedFeatureValue {
                    name: SMA_CLOSE_20,
                    value: sma_close_20,
                },
                NamedFeatureValue {
                    name: EMA_CLOSE_12,
                    value: ema_close_12,
                },
                NamedFeatureValue {
                    name: EMA_CLOSE_26,
                    value: ema_close_26,
                },
                NamedFeatureValue {
                    name: RSI_CLOSE_14,
                    value: rsi_close_14,
                },
                NamedFeatureValue {
                    name: MACD_CLOSE_12_26_9,
                    value: macd.macd,
                },
                NamedFeatureValue {
                    name: MACD_SIGNAL_CLOSE_12_26_9,
                    value: macd.signal,
                },
                NamedFeatureValue {
                    name: MACD_HISTOGRAM_CLOSE_12_26_9,
                    value: macd.histogram,
                },
                NamedFeatureValue {
                    name: RETURN_CLOSE_1,
                    value: return_close_1,
                },
                NamedFeatureValue {
                    name: VOLATILITY_LOG_RETURN_20,
                    value: volatility,
                },
            ],
        })
    }
}

pub fn format_feature_value(value: f64) -> String {
    if value == 0.0 {
        return "0".to_string();
    }

    let formatted = format!("{value:.12}");
    formatted
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string()
}

fn population_standard_deviation(values: &VecDeque<f64>) -> f64 {
    let mean = values.iter().copied().sum::<f64>() / values.len() as f64;
    let variance = values
        .iter()
        .map(|value| {
            let delta = value - mean;
            delta * delta
        })
        .sum::<f64>()
        / values.len() as f64;

    variance.sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bar(index: i64, close: f64) -> MarketDataBarInput {
        MarketDataBarInput {
            instrument_id: "instrument-1".to_string(),
            symbol: "BTCUSDT".to_string(),
            venue: "BINANCE".to_string(),
            interval: "1m".to_string(),
            open_time_ms: 1_775_044_800_000 + index * 60_000,
            close_time_ms: 1_775_044_859_999 + index * 60_000,
            close,
        }
    }

    #[test]
    fn waits_for_core_v1_warmup_window() {
        let mut calculator = CoreFeatureCalculator::default();

        for i in 0..34 {
            assert!(calculator.observe(&bar(i, 100.0 + i as f64)).is_none());
        }

        assert!(calculator.observe(&bar(34, 134.0)).is_some());
    }

    #[test]
    fn emits_core_feature_names_in_contract_order() {
        let mut calculator = CoreFeatureCalculator::default();
        let mut snapshot = None;

        for i in 0..35 {
            snapshot = calculator.observe(&bar(i, 100.0 + i as f64));
        }

        let names = snapshot
            .expect("features should be ready")
            .values
            .into_iter()
            .map(|feature| feature.name)
            .collect::<Vec<_>>();

        assert_eq!(
            names,
            vec![
                SMA_CLOSE_20,
                EMA_CLOSE_12,
                EMA_CLOSE_26,
                RSI_CLOSE_14,
                MACD_CLOSE_12_26_9,
                MACD_SIGNAL_CLOSE_12_26_9,
                MACD_HISTOGRAM_CLOSE_12_26_9,
                RETURN_CLOSE_1,
                VOLATILITY_LOG_RETURN_20,
            ]
        );
    }

    #[test]
    fn formats_values_without_locale_or_float_noise() {
        assert_eq!(format_feature_value(1.234500000000), "1.2345");
        assert_eq!(format_feature_value(0.0), "0");
    }
}
