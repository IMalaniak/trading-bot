from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

TOPIC_FEATURES_INDICATORS = "features.indicators"
TOPIC_FEATURES_INDICATORS_DLQ = "features.indicators.dlq"
TOPIC_TRADING_SIGNALS = "trading.signals"

SCHEMA_VERSION_FEATURES_INDICATORS = "1"
SCHEMA_VERSION_FEATURES_INDICATORS_DLQ = "1"
SCHEMA_VERSION_TRADING_SIGNALS = "1"

PRODUCER_PREDICTION_ENGINE = "prediction-engine"
CONTENT_TYPE_PROTOBUF = "application/x-protobuf"

HEADER_EVENT_ID = "event-id"
HEADER_EVENT_TYPE = "event-type"
HEADER_SCHEMA_VERSION = "schema-version"
HEADER_OCCURRED_AT = "occurred-at"
HEADER_PRODUCER = "producer"
HEADER_CONTENT_TYPE = "content-type"
HEADER_CORRELATION_ID = "correlation-id"
HEADER_CAUSATION_ID = "causation-id"
HEADER_TRACEPARENT = "traceparent"


@dataclass(frozen=True)
class EventContext:
    event_id: str | None = None
    correlation_id: str | None = None
    causation_id: str | None = None
    traceparent: str | None = None


def instrument_key(venue: str, instrument_id: str) -> str:
    return f"{venue.strip().upper()}:{instrument_id.strip()}"


def build_event_metadata_headers(
    *,
    event_id: str,
    event_type: str,
    schema_version: str,
    occurred_at: str,
    producer: str,
    content_type: str = CONTENT_TYPE_PROTOBUF,
    correlation_id: str | None = None,
    causation_id: str | None = None,
    traceparent: str | None = None,
) -> list[tuple[str, bytes]]:
    headers = {
        HEADER_EVENT_ID: event_id,
        HEADER_EVENT_TYPE: event_type,
        HEADER_SCHEMA_VERSION: schema_version,
        HEADER_OCCURRED_AT: occurred_at,
        HEADER_PRODUCER: producer,
        HEADER_CONTENT_TYPE: content_type,
        HEADER_CORRELATION_ID: correlation_id or event_id,
    }

    if causation_id:
        headers[HEADER_CAUSATION_ID] = causation_id
    if traceparent:
        headers[HEADER_TRACEPARENT] = traceparent

    return [(name, value.encode("utf-8")) for name, value in headers.items()]


def normalize_headers(headers: Iterable[tuple[str, bytes | str | None]] | None) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for name, value in headers or []:
        if value is None:
            continue
        normalized[name] = value.decode("utf-8") if isinstance(value, bytes) else str(value)
    return normalized


def resolve_event_context(
    headers: Iterable[tuple[str, bytes | str | None]] | None,
    fallback_event_id: str | None = None,
) -> EventContext:
    normalized = normalize_headers(headers)
    event_id = _present(normalized.get(HEADER_EVENT_ID))

    return EventContext(
        event_id=event_id,
        correlation_id=_present(normalized.get(HEADER_CORRELATION_ID))
        or event_id
        or fallback_event_id,
        causation_id=_present(normalized.get(HEADER_CAUSATION_ID)),
        traceparent=_present(normalized.get(HEADER_TRACEPARENT)),
    )


def child_event_context(parent: EventContext | None, event_id: str) -> EventContext:
    return EventContext(
        event_id=event_id,
        correlation_id=(
            parent.correlation_id or parent.event_id if parent is not None else event_id
        )
        or event_id,
        causation_id=parent.event_id if parent is not None else None,
        traceparent=parent.traceparent if parent is not None else None,
    )


def _present(value: str | None) -> str | None:
    return value if value else None
