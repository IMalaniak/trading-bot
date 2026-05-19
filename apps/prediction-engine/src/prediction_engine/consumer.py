from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Protocol

from aiokafka import AIOKafkaConsumer
from events.features_pb2 import IndicatorFeatureVector
from tradingbot_common.kafka import (
    TOPIC_FEATURES_INDICATORS,
    EventContext,
    resolve_event_context,
)

from prediction_engine.dlq import FeatureVectorDlqPublisher, fallback_event_id
from prediction_engine.metrics import PredictionMetrics
from prediction_engine.service import PredictionEngineService

logger = logging.getLogger(__name__)


class FeatureVectorRecord(Protocol):
    headers: list[tuple[str, bytes | str | None]] | None
    partition: int
    offset: int
    value: bytes | None
    key: bytes | None


class FeatureVectorConsumer:
    def __init__(
        self,
        *,
        consumer: AIOKafkaConsumer,
        service: PredictionEngineService,
        dlq: FeatureVectorDlqPublisher,
        metrics: PredictionMetrics,
        max_attempts: int = 5,
        retry_base_seconds: float = 0.25,
    ) -> None:
        self._consumer = consumer
        self._service = service
        self._dlq = dlq
        self._metrics = metrics
        self._max_attempts = max_attempts
        self._retry_base_seconds = retry_base_seconds

    async def run(self, stop_event: asyncio.Event) -> None:
        await self._consumer.start()
        try:
            while not stop_event.is_set():
                batch = await self._consumer.getmany(timeout_ms=500, max_records=10)
                for records in batch.values():
                    for record in records:
                        await self.handle_record(record)
        finally:
            await self._consumer.stop()

    async def handle_record(self, record: FeatureVectorRecord) -> None:
        headers = record.headers
        partition = int(record.partition)
        offset = int(record.offset)
        value = bytes(record.value or b"")
        key = record.key
        event_context = resolve_event_context(headers, fallback_event_id(partition, offset))

        try:
            vector = IndicatorFeatureVector.FromString(value)
        except Exception as error:
            await self._publish_dlq(
                partition=partition,
                offset=offset,
                key=key,
                value=value,
                headers=headers,
                attempts=1,
                error=error,
                event_context=event_context,
            )
            await self._consumer.commit()
            return

        try:
            await retry(
                lambda: self._service.process_feature_vector(vector, event_context),
                max_attempts=self._max_attempts,
                retry_base_seconds=self._retry_base_seconds,
            )
        except Exception as error:
            await self._publish_dlq(
                partition=partition,
                offset=offset,
                key=key,
                value=value,
                headers=headers,
                attempts=self._max_attempts,
                error=error,
                event_context=event_context,
            )

        await self._consumer.commit()

    async def _publish_dlq(
        self,
        *,
        partition: int,
        offset: int,
        key: bytes | None,
        value: bytes,
        headers: list[tuple[str, bytes | str | None]] | None,
        attempts: int,
        error: Exception,
        event_context: EventContext,
    ) -> None:
        self._metrics.dlq_attempt()
        await self._dlq.publish(
            original_topic=TOPIC_FEATURES_INDICATORS,
            original_partition=partition,
            original_offset=offset,
            original_key=key,
            original_value=value,
            original_headers=headers,
            attempts=attempts,
            error=error,
            event_context=event_context,
        )


async def retry(
    operation: Callable[[], Awaitable[object]],
    *,
    max_attempts: int,
    retry_base_seconds: float,
) -> object:
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await operation()
        except Exception as error:
            last_error = error
            if attempt == max_attempts:
                break
            await asyncio.sleep(retry_base_seconds * 2 ** (attempt - 1))

    if last_error is not None:
        raise last_error
    raise RuntimeError("retry operation did not run")


def create_consumer(*, kafka_brokers: str, consumer_group_id: str) -> AIOKafkaConsumer:
    return AIOKafkaConsumer(
        TOPIC_FEATURES_INDICATORS,
        bootstrap_servers=[broker.strip() for broker in kafka_brokers.split(",") if broker.strip()],
        group_id=consumer_group_id,
        auto_offset_reset="earliest",
        enable_auto_commit=False,
    )
