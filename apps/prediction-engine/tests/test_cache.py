import pytest
from common.signal_pb2 import BUY, SELL, Signal
from prediction_engine.cache import InMemorySignalCache


@pytest.mark.asyncio
async def test_cache_returns_latest_global_and_instrument_signals() -> None:
    cache = InMemorySignalCache(cache_limit=2)
    first = Signal(
        id="signal-1",
        instrument_id="instrument-1",
        side=BUY,
        price=100,
        timestamp=1,
    )
    second = Signal(
        id="signal-2",
        instrument_id="instrument-2",
        side=SELL,
        price=101,
        timestamp=2,
    )
    third = Signal(
        id="signal-3",
        instrument_id="instrument-1",
        side=BUY,
        price=102,
        timestamp=3,
    )

    await cache.store_signal(first)
    await cache.store_signal(second)
    await cache.store_signal(third)

    assert [signal.id for signal in await cache.get_latest(None, 10)] == [
        "signal-3",
        "signal-2",
    ]
    assert [signal.id for signal in await cache.get_latest("instrument-1", 10)] == ["signal-3"]


@pytest.mark.asyncio
async def test_cache_deduplicates_signal_id() -> None:
    cache = InMemorySignalCache(cache_limit=10)
    signal = Signal(
        id="signal-1",
        instrument_id="instrument-1",
        side=BUY,
        price=100,
        timestamp=1,
    )

    await cache.store_signal(signal)
    await cache.store_signal(signal)

    assert [item.id for item in await cache.get_latest(None, 10)] == ["signal-1"]
