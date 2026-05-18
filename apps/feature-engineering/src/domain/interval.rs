use crate::error::FeatureEngineeringError;

pub fn interval_to_millis(interval: &str) -> Result<i64, FeatureEngineeringError> {
    let trimmed = interval.trim();
    if trimmed.len() < 2 {
        return Err(FeatureEngineeringError::UnsupportedInterval(
            interval.to_string(),
        ));
    }

    let (value, unit) = trimmed.split_at(trimmed.len() - 1);
    let value = value
        .parse::<i64>()
        .map_err(|_| FeatureEngineeringError::UnsupportedInterval(interval.to_string()))?;

    if value <= 0 {
        return Err(FeatureEngineeringError::UnsupportedInterval(
            interval.to_string(),
        ));
    }

    let multiplier = match unit {
        "s" => 1_000,
        "m" => 60_000,
        "h" => 3_600_000,
        "d" => 86_400_000,
        "w" => 604_800_000,
        _ => {
            return Err(FeatureEngineeringError::UnsupportedInterval(
                interval.to_string(),
            ))
        }
    };

    value
        .checked_mul(multiplier)
        .ok_or_else(|| FeatureEngineeringError::UnsupportedInterval(interval.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_intervals() {
        assert_eq!(interval_to_millis("1m").unwrap(), 60_000);
        assert_eq!(interval_to_millis("5m").unwrap(), 300_000);
        assert_eq!(interval_to_millis("1h").unwrap(), 3_600_000);
    }

    #[test]
    fn rejects_unsupported_intervals() {
        assert!(interval_to_millis("tick").is_err());
        assert!(interval_to_millis("0m").is_err());
    }
}
