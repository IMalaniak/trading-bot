from decimal import Decimal

import pytest
from prediction_engine.config import AppConfig


def test_loads_required_env_and_defaults() -> None:
    values = {
        "KAFKA_BROKERS": "127.0.0.1:19092",
        "REDIS_URL": "redis://127.0.0.1:6379/0",
    }

    def get_env(name: str) -> str | None:
        return values.get(name)

    config = AppConfig.from_env(get_env)

    assert config.kafka_brokers == "127.0.0.1:19092"
    assert config.redis_url == "redis://127.0.0.1:6379/0"
    assert config.kafka_consumer_group_id == "prediction-engine"
    assert config.grpc_port == 50055
    assert config.metrics_port == 9106
    assert config.buy_rsi_max == Decimal("80")


def test_rejects_missing_required_env() -> None:
    def get_env(name: str) -> str | None:
        return None

    with pytest.raises(ValueError, match="KAFKA_BROKERS"):
        AppConfig.from_env(get_env)
