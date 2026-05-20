from common.signal_pb2 import BUY, Signal
from events.features_pb2 import IndicatorFeatureValue, IndicatorFeatureVector
from services.prediction_engine_pb2 import GetLatestSignalsResponse


def test_indicator_feature_vector_round_trips() -> None:
    vector = IndicatorFeatureVector(
        id="feature-vector-1",
        instrument_id="instrument-1",
        symbol="BTCUSDT",
        venue="BINANCE",
        interval="1m",
        open_time_ms=1_700_000_000_000,
        close_time_ms=1_700_000_059_999,
        source_event_id="market-event-1",
        feature_set="core-v1",
        features=[IndicatorFeatureValue(name="rsi.close.14", value="28.5")],
        calculated_at="2026-03-22T12:34:56.789Z",
    )

    decoded = IndicatorFeatureVector.FromString(vector.SerializeToString())

    assert decoded.id == "feature-vector-1"
    assert decoded.features[0].name == "rsi.close.14"
    assert decoded.features[0].value == "28.5"


def test_prediction_response_uses_common_signal() -> None:
    response = GetLatestSignalsResponse(
        signals=[
            Signal(
                id="signal-1",
                instrument_id="instrument-1",
                side=BUY,
                price=100.0,
                timestamp=1_700_000_000_000,
            )
        ]
    )

    decoded = GetLatestSignalsResponse.FromString(response.SerializeToString())

    assert decoded.signals[0].id == "signal-1"
    assert decoded.signals[0].side == BUY
