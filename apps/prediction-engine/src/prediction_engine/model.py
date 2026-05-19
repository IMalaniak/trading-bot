from __future__ import annotations

import hashlib
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from common.signal_pb2 import BUY, SELL, Signal
from events.features_pb2 import IndicatorFeatureVector


@dataclass(frozen=True)
class BaselineModelConfig:
    model_version: str
    buy_rsi_max: Decimal
    buy_return_min: Decimal
    buy_macd_histogram_min: Decimal
    sell_rsi_min: Decimal
    sell_return_max: Decimal
    sell_macd_histogram_max: Decimal
    price_feature_name: str


@dataclass(frozen=True)
class ModelDecision:
    signal: Signal
    side_name: str
    model_version: str


class BaselineSignalModel:
    def __init__(self, config: BaselineModelConfig) -> None:
        self._config = config

    def predict(self, vector: IndicatorFeatureVector) -> ModelDecision | None:
        values = feature_values(vector)
        required_names = [
            "rsi.close.14",
            "macd_histogram.close.12_26_9",
            "return.close.1",
            self._config.price_feature_name,
        ]
        if not all(name in values for name in required_names):
            return None

        rsi = values["rsi.close.14"]
        macd_histogram = values["macd_histogram.close.12_26_9"]
        close_return = values["return.close.1"]
        price = values[self._config.price_feature_name]

        if (
            rsi <= self._config.buy_rsi_max
            and macd_histogram >= self._config.buy_macd_histogram_min
            and close_return >= self._config.buy_return_min
        ):
            return self._decision(vector, BUY, "BUY", price)

        if (
            rsi >= self._config.sell_rsi_min
            and macd_histogram <= self._config.sell_macd_histogram_max
            and close_return <= self._config.sell_return_max
        ):
            return self._decision(vector, SELL, "SELL", price)

        return None

    def _decision(
        self,
        vector: IndicatorFeatureVector,
        side: int,
        side_name: str,
        price: Decimal,
    ) -> ModelDecision:
        signal_id = deterministic_signal_id(self._config.model_version, vector.id, side_name)
        return ModelDecision(
            signal=Signal(
                id=signal_id,
                instrument_id=vector.instrument_id,
                side=side,
                price=float(price),
                timestamp=vector.close_time_ms,
            ),
            side_name=side_name,
            model_version=self._config.model_version,
        )


def deterministic_signal_id(model_version: str, feature_vector_id: str, side_name: str) -> str:
    digest = hashlib.sha256(f"{model_version}:{feature_vector_id}:{side_name}".encode()).hexdigest()
    return f"sig_{digest[:32]}"


def feature_values(vector: IndicatorFeatureVector) -> dict[str, Decimal]:
    parsed: dict[str, Decimal] = {}
    for feature in vector.features:
        try:
            parsed[feature.name] = Decimal(feature.value)
        except InvalidOperation:
            continue
    return parsed
