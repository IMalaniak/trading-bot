from __future__ import annotations

from typing import Any, Protocol, cast

from common.signal_pb2 import Signal
from redis.asyncio import Redis
from tradingbot_common.protobuf import serialize_message

GLOBAL_RECENT_KEY = "prediction:signals:recent"
SIGNAL_BY_ID_KEY = "prediction:signals:by_id"
INSTRUMENT_RECENT_PREFIX = "prediction:signals:instrument:"


class SignalCache(Protocol):
    async def store_signal(self, signal: Signal) -> None: ...

    async def get_latest(self, instrument_id: str | None, limit: int) -> list[Signal]: ...


class RedisSignalCache:
    def __init__(
        self,
        redis: Redis,
        *,
        cache_limit: int,
        ttl_seconds: int,
        default_read_limit: int = 20,
    ) -> None:
        self._redis = redis
        self._cache_limit = cache_limit
        self._ttl_seconds = ttl_seconds
        self._default_read_limit = default_read_limit

    async def store_signal(self, signal: Signal) -> None:
        payload = serialize_message(signal)
        score = signal.timestamp
        instrument_key = self._instrument_recent_key(signal.instrument_id)

        pipe = cast(Any, self._redis.pipeline(transaction=True))
        pipe.hset(SIGNAL_BY_ID_KEY, signal.id, payload)
        pipe.zadd(GLOBAL_RECENT_KEY, {signal.id: score})
        pipe.zadd(instrument_key, {signal.id: score})
        pipe.zremrangebyrank(GLOBAL_RECENT_KEY, 0, -(self._cache_limit + 1))
        pipe.zremrangebyrank(instrument_key, 0, -(self._cache_limit + 1))
        pipe.expire(SIGNAL_BY_ID_KEY, self._ttl_seconds)
        pipe.expire(GLOBAL_RECENT_KEY, self._ttl_seconds)
        pipe.expire(instrument_key, self._ttl_seconds)
        await pipe.execute()

    async def get_latest(self, instrument_id: str | None, limit: int) -> list[Signal]:
        resolved_limit = limit if limit > 0 else self._default_read_limit
        recent_key = (
            self._instrument_recent_key(instrument_id) if instrument_id else GLOBAL_RECENT_KEY
        )
        redis = cast(Any, self._redis)
        signal_ids = await redis.zrevrange(recent_key, 0, resolved_limit - 1)
        if not signal_ids:
            return []

        payloads = await redis.hmget(SIGNAL_BY_ID_KEY, signal_ids)
        signals: list[Signal] = []
        for payload in payloads:
            if payload is None:
                continue
            signal = Signal()
            signal.ParseFromString(payload)
            signals.append(signal)
        return signals

    def _instrument_recent_key(self, instrument_id: str) -> str:
        return f"{INSTRUMENT_RECENT_PREFIX}{instrument_id}"


class InMemorySignalCache:
    def __init__(self, *, cache_limit: int = 200) -> None:
        self._cache_limit = cache_limit
        self._signals_by_id: dict[str, Signal] = {}
        self._ordered_ids: list[str] = []

    async def store_signal(self, signal: Signal) -> None:
        self._signals_by_id[signal.id] = signal
        self._ordered_ids = [item for item in self._ordered_ids if item != signal.id]
        self._ordered_ids.append(signal.id)
        self._ordered_ids = self._ordered_ids[-self._cache_limit :]

    async def get_latest(self, instrument_id: str | None, limit: int) -> list[Signal]:
        resolved_limit = limit if limit > 0 else 20
        signals = [self._signals_by_id[signal_id] for signal_id in reversed(self._ordered_ids)]
        if instrument_id:
            signals = [signal for signal in signals if signal.instrument_id == instrument_id]
        return signals[:resolved_limit]
