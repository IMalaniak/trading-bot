from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class AppConfig:
    kafka_brokers: str
    kafka_consumer_group_id: str
    redis_url: str
    grpc_port: int
    metrics_port: int
    signal_cache_limit: int
    signal_cache_ttl_seconds: int
    model_version: str
    buy_rsi_max: Decimal
    buy_return_min: Decimal
    buy_macd_histogram_min: Decimal
    sell_rsi_min: Decimal
    sell_return_max: Decimal
    sell_macd_histogram_max: Decimal
    price_feature_name: str
    log_level: str

    @classmethod
    def from_env(cls, getenv: Callable[[str], str | None] | None = None) -> AppConfig:
        import os

        load_env_files()
        env = getenv or os.environ.get

        return cls(
            kafka_brokers=require_env(env, "KAFKA_BROKERS"),
            kafka_consumer_group_id=optional_str(
                env, "PREDICTION_ENGINE_KAFKA_CONSUMER_GROUP_ID", "prediction-engine"
            ),
            redis_url=require_env(env, "REDIS_URL"),
            grpc_port=optional_port(env, "PREDICTION_ENGINE_GRPC_PORT", 50055),
            metrics_port=optional_port(env, "PREDICTION_ENGINE_METRICS_PORT", 9106),
            signal_cache_limit=optional_positive_int(
                env, "PREDICTION_ENGINE_SIGNAL_CACHE_LIMIT", 200
            ),
            signal_cache_ttl_seconds=optional_positive_int(
                env, "PREDICTION_ENGINE_SIGNAL_CACHE_TTL_SECONDS", 86_400
            ),
            model_version=optional_str(env, "PREDICTION_ENGINE_MODEL_VERSION", "baseline-core-v1"),
            buy_rsi_max=optional_decimal(env, "PREDICTION_ENGINE_BUY_RSI_MAX", "80"),
            buy_return_min=optional_decimal(env, "PREDICTION_ENGINE_BUY_RETURN_MIN", "0"),
            buy_macd_histogram_min=optional_decimal(
                env, "PREDICTION_ENGINE_BUY_MACD_HISTOGRAM_MIN", "0"
            ),
            sell_rsi_min=optional_decimal(env, "PREDICTION_ENGINE_SELL_RSI_MIN", "20"),
            sell_return_max=optional_decimal(env, "PREDICTION_ENGINE_SELL_RETURN_MAX", "0"),
            sell_macd_histogram_max=optional_decimal(
                env, "PREDICTION_ENGINE_SELL_MACD_HISTOGRAM_MAX", "0"
            ),
            price_feature_name=optional_str(
                env, "PREDICTION_ENGINE_PRICE_FEATURE_NAME", "ema.close.12"
            ),
            log_level=optional_str(env, "LOG_LEVEL", "info"),
        )


def load_env_files() -> None:
    workspace_root = find_workspace_root()
    load_dotenv(workspace_root / ".env", override=False)
    load_dotenv(workspace_root / "apps/prediction-engine/.env", override=False)


def find_workspace_root() -> Path:
    current = Path.cwd().resolve()
    for directory in (current, *current.parents):
        if (directory / "nx.json").exists():
            return directory
    return current


def require_env(getenv: Callable[[str], str | None], name: str) -> str:
    value = getenv(name)
    if value is None or value == "":
        raise ValueError(f"required env var `{name}` not set")
    return value


def optional_str(getenv: Callable[[str], str | None], name: str, default: str) -> str:
    return getenv(name) or default


def optional_positive_int(getenv: Callable[[str], str | None], name: str, default: int) -> int:
    value = getenv(name)
    if value is None or value == "":
        return default
    parsed = int(value)
    if parsed <= 0:
        raise ValueError(f"`{name}` must be positive")
    return parsed


def optional_port(getenv: Callable[[str], str | None], name: str, default: int) -> int:
    parsed = optional_positive_int(getenv, name, default)
    if parsed > 65_535:
        raise ValueError(f"`{name}` must be a valid port")
    return parsed


def optional_decimal(getenv: Callable[[str], str | None], name: str, default: str) -> Decimal:
    value = getenv(name) or default
    try:
        return Decimal(value)
    except InvalidOperation as error:
        raise ValueError(f"`{name}` must be a decimal") from error
