from __future__ import annotations

import asyncio
import logging
import signal

from aiokafka import AIOKafkaProducer
from redis.asyncio import Redis

from prediction_engine.cache import RedisSignalCache
from prediction_engine.config import AppConfig
from prediction_engine.consumer import FeatureVectorConsumer, create_consumer
from prediction_engine.dlq import FeatureVectorDlqPublisher
from prediction_engine.grpc_server import create_grpc_server
from prediction_engine.metrics import PrometheusPredictionMetrics, start_metrics_server
from prediction_engine.model import BaselineModelConfig, BaselineSignalModel
from prediction_engine.publisher import KafkaSignalPublisher
from prediction_engine.service import PredictionEngineService


async def run() -> None:
    config = AppConfig.from_env()
    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logger = logging.getLogger(__name__)
    metrics = PrometheusPredictionMetrics()
    start_metrics_server(config.metrics_port)

    redis = Redis.from_url(config.redis_url)
    producer = AIOKafkaProducer(
        bootstrap_servers=[
            broker.strip() for broker in config.kafka_brokers.split(",") if broker.strip()
        ]
    )
    await producer.start()

    cache = RedisSignalCache(
        redis,
        cache_limit=config.signal_cache_limit,
        ttl_seconds=config.signal_cache_ttl_seconds,
    )
    model = BaselineSignalModel(
        BaselineModelConfig(
            model_version=config.model_version,
            buy_rsi_max=config.buy_rsi_max,
            buy_return_min=config.buy_return_min,
            buy_macd_histogram_min=config.buy_macd_histogram_min,
            sell_rsi_min=config.sell_rsi_min,
            sell_return_max=config.sell_return_max,
            sell_macd_histogram_max=config.sell_macd_histogram_max,
            price_feature_name=config.price_feature_name,
        )
    )
    service = PredictionEngineService(
        model=model,
        publisher=KafkaSignalPublisher(producer),
        cache=cache,
        metrics=metrics,
    )
    consumer = FeatureVectorConsumer(
        consumer=create_consumer(
            kafka_brokers=config.kafka_brokers,
            consumer_group_id=config.kafka_consumer_group_id,
        ),
        service=service,
        dlq=FeatureVectorDlqPublisher(producer, config.kafka_consumer_group_id),
        metrics=metrics,
    )
    grpc_server = await create_grpc_server(cache=cache, metrics=metrics, port=config.grpc_port)
    await grpc_server.start()
    logger.info(
        "prediction-engine starting kafka=%s group=%s grpc_port=%s metrics_port=%s",
        config.kafka_brokers,
        config.kafka_consumer_group_id,
        config.grpc_port,
        config.metrics_port,
    )

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)

    consumer_task = asyncio.create_task(consumer.run(stop_event))
    await stop_event.wait()
    logger.info("prediction-engine shutdown signal received")

    consumer_task.cancel()
    await asyncio.gather(consumer_task, return_exceptions=True)
    await grpc_server.stop(grace=5)
    await producer.stop()
    await redis.aclose()
    logger.info("prediction-engine shut down cleanly")


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
