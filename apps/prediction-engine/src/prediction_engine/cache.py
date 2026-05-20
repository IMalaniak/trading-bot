from __future__ import annotations

from typing import Any, Protocol, cast

from common.signal_pb2 import Signal
from redis.asyncio import Redis
from tradingbot_common.protobuf import serialize_message

GLOBAL_RECENT_KEY = "prediction:signals:recent"
SIGNAL_BY_ID_KEY = "prediction:signals:by_id"
SIGNAL_INSTRUMENT_BY_ID_KEY = "prediction:signals:instrument_by_id"
INSTRUMENT_RECENT_PREFIX = "prediction:signals:instrument:"

_STORE_SIGNAL_SCRIPT = """
local signal_payload_key = KEYS[1]
local signal_instrument_key = KEYS[2]
local global_recent_key = KEYS[3]
local instrument_recent_key = KEYS[4]

local signal_id = ARGV[1]
local payload = ARGV[2]
local score = ARGV[3]
local cache_limit = tonumber(ARGV[4])
local ttl_seconds = tonumber(ARGV[5])
local trim_end = -(cache_limit + 1)

redis.call("HSET", signal_payload_key, signal_id, payload)
redis.call("HSET", signal_instrument_key, signal_id, instrument_recent_key)
redis.call("ZADD", global_recent_key, score, signal_id)
redis.call("ZADD", instrument_recent_key, score, signal_id)

local evicted_global = redis.call("ZRANGE", global_recent_key, 0, trim_end)
local evicted_instrument = redis.call("ZRANGE", instrument_recent_key, 0, trim_end)

redis.call("ZREMRANGEBYRANK", global_recent_key, 0, trim_end)
redis.call("ZREMRANGEBYRANK", instrument_recent_key, 0, trim_end)

local function prune_payloads(signal_ids, fallback_instrument_key)
  for _, current_signal_id in ipairs(signal_ids) do
    local current_instrument_key = redis.call("HGET", signal_instrument_key, current_signal_id)
      or fallback_instrument_key
    local still_global = redis.call("ZSCORE", global_recent_key, current_signal_id)
    local still_instrument = nil

    if current_instrument_key then
      still_instrument = redis.call("ZSCORE", current_instrument_key, current_signal_id)
    end

    if not still_global and not still_instrument then
      redis.call("HDEL", signal_payload_key, current_signal_id)
      redis.call("HDEL", signal_instrument_key, current_signal_id)
    end
  end
end

prune_payloads(evicted_global, nil)
prune_payloads(evicted_instrument, instrument_recent_key)

redis.call("EXPIRE", signal_payload_key, ttl_seconds)
redis.call("EXPIRE", signal_instrument_key, ttl_seconds)
redis.call("EXPIRE", global_recent_key, ttl_seconds)
redis.call("EXPIRE", instrument_recent_key, ttl_seconds)
"""


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
        redis = cast(Any, self._redis)

        await redis.eval(
            _STORE_SIGNAL_SCRIPT,
            4,
            SIGNAL_BY_ID_KEY,
            SIGNAL_INSTRUMENT_BY_ID_KEY,
            GLOBAL_RECENT_KEY,
            instrument_key,
            signal.id,
            payload,
            score,
            self._cache_limit,
            self._ttl_seconds,
        )

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
