from typing import Any, cast

import pytest
from common.signal_pb2 import BUY, SELL, Signal
from prediction_engine.cache import (
    SIGNAL_BY_ID_KEY,
    SIGNAL_INSTRUMENT_BY_ID_KEY,
    InMemorySignalCache,
    RedisSignalCache,
)


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


@pytest.mark.asyncio
async def test_redis_cache_prunes_payloads_evicted_from_all_indexes() -> None:
    redis = FakeRedis()
    cache = RedisSignalCache(cast(Any, redis), cache_limit=2, ttl_seconds=60)

    await cache.store_signal(_signal("signal-1", "instrument-1", 1))
    await cache.store_signal(_signal("signal-2", "instrument-1", 2))
    await cache.store_signal(_signal("signal-3", "instrument-1", 3))

    assert [signal.id for signal in await cache.get_latest(None, 10)] == [
        "signal-3",
        "signal-2",
    ]
    assert "signal-1" not in redis.hashes[SIGNAL_BY_ID_KEY]
    assert "signal-1" not in redis.hashes[SIGNAL_INSTRUMENT_BY_ID_KEY]


@pytest.mark.asyncio
async def test_redis_cache_keeps_payloads_still_referenced_by_instrument_index() -> None:
    redis = FakeRedis()
    cache = RedisSignalCache(cast(Any, redis), cache_limit=2, ttl_seconds=60)

    await cache.store_signal(_signal("signal-1", "instrument-1", 1))
    await cache.store_signal(_signal("signal-2", "instrument-2", 2))
    await cache.store_signal(_signal("signal-3", "instrument-2", 3))

    assert [signal.id for signal in await cache.get_latest(None, 10)] == [
        "signal-3",
        "signal-2",
    ]
    assert [signal.id for signal in await cache.get_latest("instrument-1", 10)] == ["signal-1"]
    assert "signal-1" in redis.hashes[SIGNAL_BY_ID_KEY]


def _signal(signal_id: str, instrument_id: str, timestamp: int) -> Signal:
    return Signal(
        id=signal_id,
        instrument_id=instrument_id,
        side=BUY,
        price=100,
        timestamp=timestamp,
    )


class FakeRedis:
    def __init__(self) -> None:
        self.hashes: dict[str, dict[str, bytes | str]] = {}
        self.zsets: dict[str, dict[str, float]] = {}

    async def eval(self, _script: str, numkeys: int, *args: object) -> None:
        keys = [str(item) for item in args[:numkeys]]
        argv = list(args[numkeys:])
        signal_payload_key, signal_instrument_key, global_recent_key, instrument_recent_key = keys
        signal_id = str(argv[0])
        payload = cast(bytes, argv[1])
        score = float(cast(int | float | str, argv[2]))
        cache_limit = int(cast(int | str, argv[3]))

        self.hashes.setdefault(signal_payload_key, {})[signal_id] = payload
        self.hashes.setdefault(signal_instrument_key, {})[signal_id] = instrument_recent_key
        self.zsets.setdefault(global_recent_key, {})[signal_id] = score
        self.zsets.setdefault(instrument_recent_key, {})[signal_id] = score

        evicted_global = self._evict_oldest(global_recent_key, cache_limit)
        evicted_instrument = self._evict_oldest(instrument_recent_key, cache_limit)

        self._prune_payloads(
            signal_payload_key, signal_instrument_key, global_recent_key, evicted_global
        )
        self._prune_payloads(
            signal_payload_key,
            signal_instrument_key,
            global_recent_key,
            evicted_instrument,
            fallback_instrument_key=instrument_recent_key,
        )

    async def zrevrange(self, key: str, start: int, end: int) -> list[str]:
        members = sorted(
            self.zsets.get(key, {}),
            key=lambda member: self.zsets[key][member],
            reverse=True,
        )
        return members[start : end + 1]

    async def hmget(self, key: str, signal_ids: list[str]) -> list[bytes | str | None]:
        return [self.hashes.get(key, {}).get(signal_id) for signal_id in signal_ids]

    def _evict_oldest(self, key: str, cache_limit: int) -> list[str]:
        members = sorted(self.zsets.get(key, {}), key=lambda member: self.zsets[key][member])
        evicted = members[: max(0, len(members) - cache_limit)]
        for member in evicted:
            del self.zsets[key][member]
        return evicted

    def _prune_payloads(
        self,
        signal_payload_key: str,
        signal_instrument_key: str,
        global_recent_key: str,
        signal_ids: list[str],
        *,
        fallback_instrument_key: str | None = None,
    ) -> None:
        for signal_id in signal_ids:
            instrument_key = (
                self.hashes.get(signal_instrument_key, {}).get(signal_id) or fallback_instrument_key
            )
            still_global = signal_id in self.zsets.get(global_recent_key, {})
            still_instrument = (
                signal_id in self.zsets.get(str(instrument_key), {}) if instrument_key else False
            )

            if not still_global and not still_instrument:
                self.hashes.get(signal_payload_key, {}).pop(signal_id, None)
                self.hashes.get(signal_instrument_key, {}).pop(signal_id, None)
