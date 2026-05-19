from dataclasses import dataclass

import pytest
from events.features_pb2 import IndicatorFeatureVector
from prediction_engine.consumer import retry
from prediction_engine.dlq import fallback_event_id
from tradingbot_common.kafka import EventContext


def test_fallback_event_id_is_deterministic() -> None:
    assert fallback_event_id(2, 42) == "features.indicators:2:42"


@pytest.mark.asyncio
async def test_retry_recovers_from_transient_error() -> None:
    attempts = 0

    async def operation() -> str:
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise RuntimeError("transient")
        return "ok"

    assert await retry(operation, max_attempts=3, retry_base_seconds=0) == "ok"
    assert attempts == 2


@pytest.mark.asyncio
async def test_retry_raises_last_error() -> None:
    async def operation() -> object:
        raise RuntimeError("bad proto")

    with pytest.raises(RuntimeError):
        await retry(operation, max_attempts=2, retry_base_seconds=0)


@dataclass(frozen=True)
class FeatureRecordFixture:
    value: bytes
    partition: int = 0
    offset: int = 1
    key: bytes = b"BINANCE:instrument-1"
    headers: list[tuple[str, bytes]] | None = None


def test_feature_record_fixture_matches_consumer_record_shape() -> None:
    vector = IndicatorFeatureVector(id="feature-vector-1")
    record = FeatureRecordFixture(value=vector.SerializeToString())
    context = EventContext(event_id=fallback_event_id(record.partition, record.offset))

    assert record.value
    assert context.event_id == "features.indicators:0:1"
