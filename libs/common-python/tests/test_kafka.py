from tradingbot_common.kafka import (
    HEADER_CAUSATION_ID,
    HEADER_CORRELATION_ID,
    HEADER_EVENT_ID,
    SCHEMA_VERSION_TRADING_SIGNALS,
    TOPIC_TRADING_SIGNALS,
    build_event_metadata_headers,
    child_event_context,
    instrument_key,
    normalize_headers,
    resolve_event_context,
)


def test_instrument_key_matches_typescript_and_rust_contract() -> None:
    assert instrument_key(" binance ", " instrument-1 ") == "BINANCE:instrument-1"


def test_builds_and_resolves_metadata_headers() -> None:
    headers = build_event_metadata_headers(
        event_id="signal-event-1",
        event_type=TOPIC_TRADING_SIGNALS,
        schema_version=SCHEMA_VERSION_TRADING_SIGNALS,
        occurred_at="2026-03-22T12:34:56.789Z",
        producer="prediction-engine",
        correlation_id="workflow-1",
        causation_id="feature-vector-1",
        traceparent="trace-1",
    )

    normalized = normalize_headers(headers)

    assert normalized[HEADER_EVENT_ID] == "signal-event-1"
    assert normalized[HEADER_CORRELATION_ID] == "workflow-1"
    assert normalized[HEADER_CAUSATION_ID] == "feature-vector-1"
    assert resolve_event_context(headers).correlation_id == "workflow-1"


def test_child_context_uses_parent_event_as_causation() -> None:
    parent = resolve_event_context(
        [(HEADER_EVENT_ID, b"feature-vector-1"), (HEADER_CORRELATION_ID, b"workflow-1")]
    )

    child = child_event_context(parent, "signal-event-1")

    assert child.event_id == "signal-event-1"
    assert child.correlation_id == "workflow-1"
    assert child.causation_id == "feature-vector-1"
