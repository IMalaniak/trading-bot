from __future__ import annotations

from aiokafka import AIOKafkaProducer

from prediction_engine.service import SignalPublishRecord


class KafkaSignalPublisher:
    def __init__(self, producer: AIOKafkaProducer) -> None:
        self._producer = producer

    async def publish(self, record: SignalPublishRecord) -> None:
        await self._producer.send_and_wait(
            record.topic,
            value=record.value,
            key=record.key,
            headers=record.headers,
        )


class InMemorySignalPublisher:
    def __init__(self) -> None:
        self.records: list[SignalPublishRecord] = []

    async def publish(self, record: SignalPublishRecord) -> None:
        self.records.append(record)
