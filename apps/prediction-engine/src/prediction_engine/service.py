from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from common.signal_pb2 import Signal
from events.features_pb2 import IndicatorFeatureVector
from tradingbot_common.kafka import (
    PRODUCER_PREDICTION_ENGINE,
    SCHEMA_VERSION_TRADING_SIGNALS,
    TOPIC_TRADING_SIGNALS,
    EventContext,
    build_event_metadata_headers,
    child_event_context,
    instrument_key,
)
from tradingbot_common.protobuf import serialize_message

from prediction_engine.cache import SignalCache
from prediction_engine.metrics import PredictionMetrics
from prediction_engine.model import BaselineSignalModel


class SignalPublisher(Protocol):
    async def publish(self, record: SignalPublishRecord) -> None: ...


@dataclass(frozen=True)
class SignalPublishRecord:
    topic: str
    key: bytes
    value: bytes
    headers: list[tuple[str, bytes]]
    signal: Signal
    side_name: str


@dataclass(frozen=True)
class ProcessOutcome:
    status: str
    signal_id: str | None = None


class UnsupportedFeatureSetError(ValueError):
    pass


class PredictionEngineService:
    def __init__(
        self,
        *,
        model: BaselineSignalModel,
        publisher: SignalPublisher,
        cache: SignalCache,
        metrics: PredictionMetrics,
    ) -> None:
        self._model = model
        self._publisher = publisher
        self._cache = cache
        self._metrics = metrics

    async def process_feature_vector(
        self,
        vector: IndicatorFeatureVector,
        source_context: EventContext,
    ) -> ProcessOutcome:
        if vector.feature_set != "core-v1":
            raise UnsupportedFeatureSetError(f"unsupported feature_set `{vector.feature_set}`")

        self._metrics.feature_consumed()
        decision = self._model.predict(vector)
        if decision is None:
            self._metrics.neutral_skipped()
            self._metrics.model_decision("NEUTRAL")
            return ProcessOutcome(status="skipped-neutral")

        self._metrics.model_decision(decision.side_name)
        child_context = child_event_context(source_context, decision.signal.id)
        headers = build_event_metadata_headers(
            event_id=decision.signal.id,
            event_type=TOPIC_TRADING_SIGNALS,
            schema_version=SCHEMA_VERSION_TRADING_SIGNALS,
            occurred_at=utc_now_iso(),
            producer=PRODUCER_PREDICTION_ENGINE,
            correlation_id=child_context.correlation_id,
            causation_id=vector.id,
            traceparent=child_context.traceparent,
        )
        key = instrument_key(vector.venue, vector.instrument_id).encode("utf-8")
        record = SignalPublishRecord(
            topic=TOPIC_TRADING_SIGNALS,
            key=key,
            value=serialize_message(decision.signal),
            headers=headers,
            signal=decision.signal,
            side_name=decision.side_name,
        )

        await self._publisher.publish(record)
        self._metrics.signal_published(decision.side_name)
        await self._cache.store_signal(decision.signal)
        self._metrics.cache_write()

        return ProcessOutcome(status="published", signal_id=decision.signal.id)


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
