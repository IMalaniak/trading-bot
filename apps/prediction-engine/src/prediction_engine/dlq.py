from __future__ import annotations

from datetime import UTC, datetime

from aiokafka import AIOKafkaProducer
from events.events_pb2 import DeadLetterEvent, DeadLetterHeader
from tradingbot_common.kafka import (
    PRODUCER_PREDICTION_ENGINE,
    SCHEMA_VERSION_FEATURES_INDICATORS_DLQ,
    TOPIC_FEATURES_INDICATORS,
    TOPIC_FEATURES_INDICATORS_DLQ,
    EventContext,
    build_event_metadata_headers,
    normalize_headers,
)
from tradingbot_common.protobuf import serialize_message


class FeatureVectorDlqPublisher:
    def __init__(self, producer: AIOKafkaProducer, consumer_group: str) -> None:
        self._producer = producer
        self._consumer_group = consumer_group

    async def publish(
        self,
        *,
        original_topic: str,
        original_partition: int,
        original_offset: int,
        original_key: bytes | None,
        original_value: bytes,
        original_headers: list[tuple[str, bytes | str | None]] | None,
        attempts: int,
        error: Exception,
        event_context: EventContext,
    ) -> None:
        now = utc_now_iso()
        normalized_headers = normalize_headers(original_headers)
        dead_letter = DeadLetterEvent(
            original_topic=original_topic,
            original_partition=original_partition,
            original_offset=str(original_offset),
            original_key=original_key.decode("utf-8") if original_key else "",
            original_value=original_value,
            original_headers=[
                DeadLetterHeader(name=name, value=value)
                for name, value in sorted(normalized_headers.items())
            ],
            service=PRODUCER_PREDICTION_ENGINE,
            consumer_group=self._consumer_group,
            attempts=attempts,
            failure_class=error.__class__.__name__,
            error_message=str(error),
            first_failed_at=now,
            dead_lettered_at=now,
            correlation_id=event_context.correlation_id or "",
            causation_id=event_context.event_id or "",
        )
        event_id = f"{TOPIC_FEATURES_INDICATORS_DLQ}:{original_partition}:{original_offset}"
        headers = build_event_metadata_headers(
            event_id=event_id,
            event_type=TOPIC_FEATURES_INDICATORS_DLQ,
            schema_version=SCHEMA_VERSION_FEATURES_INDICATORS_DLQ,
            occurred_at=now,
            producer=PRODUCER_PREDICTION_ENGINE,
            correlation_id=event_context.correlation_id,
            causation_id=event_context.event_id,
            traceparent=event_context.traceparent,
        )
        await self._producer.send_and_wait(
            TOPIC_FEATURES_INDICATORS_DLQ,
            key=original_key,
            value=serialize_message(dead_letter),
            headers=headers,
        )


def fallback_event_id(partition: int, offset: int) -> str:
    return f"{TOPIC_FEATURES_INDICATORS}:{partition}:{offset}"


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
