from decimal import Decimal

from common.signal_pb2 import BUY, SELL
from events.features_pb2 import IndicatorFeatureValue, IndicatorFeatureVector
from prediction_engine.model import (
    BaselineModelConfig,
    BaselineSignalModel,
    deterministic_signal_id,
)


def test_model_emits_deterministic_buy_signal() -> None:
    vector = make_vector(
        feature_vector_id="feature-vector-1",
        rsi="55",
        macd_histogram="0.01",
        close_return="0.001",
        price="100.5",
    )
    model = BaselineSignalModel(make_config())

    decision = model.predict(vector)

    assert decision is not None
    assert decision.side_name == "BUY"
    assert decision.signal.id == deterministic_signal_id(
        "baseline-core-v1", "feature-vector-1", "BUY"
    )
    assert decision.signal.side == BUY
    assert decision.signal.instrument_id == "instrument-1"
    assert decision.signal.price == 100.5
    assert decision.signal.timestamp == vector.close_time_ms


def test_model_emits_deterministic_sell_signal() -> None:
    vector = make_vector(
        feature_vector_id="feature-vector-2",
        rsi="65",
        macd_histogram="-0.01",
        close_return="-0.001",
        price="99.5",
    )

    decision = BaselineSignalModel(make_config()).predict(vector)

    assert decision is not None
    assert decision.side_name == "SELL"
    assert decision.signal.side == SELL
    assert decision.signal.id == deterministic_signal_id(
        "baseline-core-v1", "feature-vector-2", "SELL"
    )


def test_model_skips_neutral_output() -> None:
    vector = make_vector(
        feature_vector_id="feature-vector-3",
        rsi="50",
        macd_histogram="0.01",
        close_return="-0.001",
        price="100",
    )

    assert BaselineSignalModel(make_config()).predict(vector) is None


def test_model_skips_when_required_feature_is_missing() -> None:
    vector = make_vector(
        feature_vector_id="feature-vector-4",
        rsi="50",
        macd_histogram="0.01",
        close_return="0.001",
        price="100",
    )
    vector.features.pop()

    assert BaselineSignalModel(make_config()).predict(vector) is None


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


def make_vector(
    *,
    feature_vector_id: str,
    rsi: str,
    macd_histogram: str,
    close_return: str,
    price: str,
) -> IndicatorFeatureVector:
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
            IndicatorFeatureValue(name="rsi.close.14", value=rsi),
            IndicatorFeatureValue(
                name="macd_histogram.close.12_26_9",
                value=macd_histogram,
            ),
            IndicatorFeatureValue(name="return.close.1", value=close_return),
            IndicatorFeatureValue(name="ema.close.12", value=price),
        ],
    )
