fn sanitize_key_part(value: &str) -> &str {
    value.trim()
}

pub fn instrument_key(venue: &str, instrument_id: &str) -> String {
    format!(
        "{}:{}",
        sanitize_key_part(venue).to_uppercase(),
        sanitize_key_part(instrument_id)
    )
}

pub fn portfolio_key(portfolio_id: &str) -> String {
    sanitize_key_part(portfolio_id).to_string()
}

pub fn risk_key(portfolio_id: &str, instrument_id: &str) -> String {
    format!(
        "{}:{}",
        portfolio_key(portfolio_id),
        sanitize_key_part(instrument_id)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_deterministic_key_values() {
        assert_eq!(
            instrument_key("  binance  ", " instrument-1 "),
            "BINANCE:instrument-1"
        );
        assert_eq!(portfolio_key("  portfolio-1  "), "portfolio-1");
        assert_eq!(
            risk_key(" portfolio-1 ", " instrument-1 "),
            "portfolio-1:instrument-1"
        );
    }
}
