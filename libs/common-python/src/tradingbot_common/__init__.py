"""Shared Python helpers for Trading Bot services."""

from tradingbot_common.kafka import (
    CONTENT_TYPE_PROTOBUF,
    PRODUCER_PREDICTION_ENGINE,
    SCHEMA_VERSION_FEATURES_INDICATORS,
    SCHEMA_VERSION_FEATURES_INDICATORS_DLQ,
    SCHEMA_VERSION_TRADING_SIGNALS,
    TOPIC_FEATURES_INDICATORS,
    TOPIC_FEATURES_INDICATORS_DLQ,
    TOPIC_TRADING_SIGNALS,
    EventContext,
    build_event_metadata_headers,
    child_event_context,
    instrument_key,
    normalize_headers,
    resolve_event_context,
)

__all__ = [
    "CONTENT_TYPE_PROTOBUF",
    "PRODUCER_PREDICTION_ENGINE",
    "SCHEMA_VERSION_FEATURES_INDICATORS",
    "SCHEMA_VERSION_FEATURES_INDICATORS_DLQ",
    "SCHEMA_VERSION_TRADING_SIGNALS",
    "TOPIC_FEATURES_INDICATORS",
    "TOPIC_FEATURES_INDICATORS_DLQ",
    "TOPIC_TRADING_SIGNALS",
    "EventContext",
    "build_event_metadata_headers",
    "child_event_context",
    "instrument_key",
    "normalize_headers",
    "resolve_event_context",
]
