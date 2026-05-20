from decimal import Decimal

import pytest
from events.features_pb2 import IndicatorFeatureValue, IndicatorFeatureVector
from prediction_engine.cache import InMemorySignalCache
from prediction_engine.metrics import NoopPredictionMetrics
from prediction_engine.model import BaselineModelConfig, BaselineSignalModel
from prediction_engine.publisher import InMemorySignalPublisher
from prediction_engine.service import PredictionEngineService, UnsupportedFeatureSetError
from tradingbot_common.kafka import (
    HEADER_CAUSATION_ID,
    HEADER_CORRELATION_ID,
    HEADER_EVENT_ID,
    HEADER_EVENT_TYPE,
    HEADER_SCHEMA_VERSION,
    SCHEMA_VERSION_TRADING_SIGNALS,
    TOPIC_TRADING_SIGNALS,
    EventContext,
    normalize_headers,
)


@pytest.mark.asyncio
async def test_process_feature_vector_publishes_signal_with_metadata() -> None:
    publisher = InMemorySignalPublisher()
    cache = InMemorySignalCache()
    service = PredictionEngineService(
        model=BaselineSignalModel(make_config()),
        publisher=publisher,
        cache=cache,
        metrics=NoopPredictionMetrics(),
    )

    outcome = await service.process_feature_vector(
        make_vector("feature-vector-1"),
        EventContext(event_id="feature-event-1", correlation_id="workflow-1"),
    )

    assert outcome.status == "published"
    assert len(publisher.records) == 1
    record = publisher.records[0]
    headers = normalize_headers(record.headers)
    assert record.topic == TOPIC_TRADING_SIGNALS
    assert record.key == b"BINANCE:instrument-1"
    assert headers[HEADER_EVENT_ID] == record.signal.id
    assert headers[HEADER_EVENT_TYPE] == TOPIC_TRADING_SIGNALS
    assert headers[HEADER_SCHEMA_VERSION] == SCHEMA_VERSION_TRADING_SIGNALS
    assert headers[HEADER_CORRELATION_ID] == "workflow-1"
    assert headers[HEADER_CAUSATION_ID] == "feature-vector-1"
    assert (await cache.get_latest("instrument-1", 10))[0].id == record.signal.id


@pytest.mark.asyncio
async def test_process_feature_vector_skips_neutral_output() -> None:
    publisher = InMemorySignalPublisher()
    service = PredictionEngineService(
        model=BaselineSignalModel(make_config()),
        publisher=publisher,
        cache=InMemorySignalCache(),
        metrics=NoopPredictionMetrics(),
    )
    vector = make_vector("feature-vector-neutral")
    vector.features[1].value = "0.01"
    vector.features[2].value = "-0.001"

    outcome = await service.process_feature_vector(vector, EventContext(event_id="feature-event-1"))

    assert outcome.status == "skipped-neutral"
    assert publisher.records == []


@pytest.mark.asyncio
async def test_unsupported_feature_set_is_rejected() -> None:
    service = PredictionEngineService(
        model=BaselineSignalModel(make_config()),
        publisher=InMemorySignalPublisher(),
        cache=InMemorySignalCache(),
        metrics=NoopPredictionMetrics(),
    )
    vector = make_vector("feature-vector-1")
    vector.feature_set = "experimental"

    with pytest.raises(UnsupportedFeatureSetError):
        await service.process_feature_vector(vector, EventContext(event_id="feature-event-1"))


def make_config() -> BaselineModelConfig:
    return BaselineModelConfig(
        model_version="baseline-core-v1",
        buy_rsi_max=Decimal("80"),
        buy_return_min=Decimal("0"),
        buy_macd_histogram_min=Decimal("0"),
        sell_rsi_min=Decimal("20"),
        sell_return_max=Decimal("0"),
        sell_macd_histogram_max=Decimal("0"),
        price_feature_name="ema.close.12",
    )


def make_vector(feature_vector_id: str) -> IndicatorFeatureVector:
    return IndicatorFeatureVector(
        id=feature_vector_id,
        instrument_id="instrument-1",
        symbol="BTCUSDT",
        venue="BINANCE",
        interval="1m",
        open_time_ms=1_700_000_000_000,
        close_time_ms=1_700_000_059_999,
        source_event_id="market-event-1",
        feature_set="core-v1",
        calculated_at="2026-03-22T12:34:56.789Z",
        features=[
            IndicatorFeatureValue(name="rsi.close.14", value="55"),
            IndicatorFeatureValue(name="macd_histogram.close.12_26_9", value="0.01"),
            IndicatorFeatureValue(name="return.close.1", value="0.001"),
            IndicatorFeatureValue(name="ema.close.12", value="100.5"),
        ],
    )
