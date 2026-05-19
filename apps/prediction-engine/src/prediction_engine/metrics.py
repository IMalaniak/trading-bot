from __future__ import annotations

from typing import Protocol

from prometheus_client import Counter, start_http_server


class PredictionMetrics(Protocol):
    def feature_consumed(self) -> None: ...

    def signal_published(self, side: str) -> None: ...

    def neutral_skipped(self) -> None: ...

    def dlq_attempt(self) -> None: ...

    def cache_write(self) -> None: ...

    def grpc_request(self, method: str) -> None: ...

    def model_decision(self, side: str) -> None: ...


class PrometheusPredictionMetrics:
    def __init__(self) -> None:
        self._features_consumed = Counter(
            "prediction_engine_features_consumed_total",
            "Number of features.indicators messages consumed",
        )
        self._signals_published = Counter(
            "prediction_engine_signals_published_total",
            "Number of trading.signals messages published",
            ["side"],
        )
        self._neutral_skipped = Counter(
            "prediction_engine_neutral_outputs_skipped_total",
            "Number of neutral model outputs skipped",
        )
        self._dlq_attempts = Counter(
            "prediction_engine_dlq_attempts_total",
            "Number of Prediction Engine DLQ publish attempts",
        )
        self._cache_writes = Counter(
            "prediction_engine_signal_cache_writes_total",
            "Number of signals written to cache",
        )
        self._grpc_requests = Counter(
            "prediction_engine_grpc_requests_total",
            "Number of Prediction Engine gRPC requests",
            ["method"],
        )
        self._model_decisions = Counter(
            "prediction_engine_model_decisions_total",
            "Number of model decisions by side",
            ["side"],
        )

    def feature_consumed(self) -> None:
        self._features_consumed.inc()

    def signal_published(self, side: str) -> None:
        self._signals_published.labels(side=side).inc()

    def neutral_skipped(self) -> None:
        self._neutral_skipped.inc()

    def dlq_attempt(self) -> None:
        self._dlq_attempts.inc()

    def cache_write(self) -> None:
        self._cache_writes.inc()

    def grpc_request(self, method: str) -> None:
        self._grpc_requests.labels(method=method).inc()

    def model_decision(self, side: str) -> None:
        self._model_decisions.labels(side=side).inc()


class NoopPredictionMetrics:
    def feature_consumed(self) -> None:
        return None

    def signal_published(self, side: str) -> None:
        return None

    def neutral_skipped(self) -> None:
        return None

    def dlq_attempt(self) -> None:
        return None

    def cache_write(self) -> None:
        return None

    def grpc_request(self, method: str) -> None:
        return None

    def model_decision(self, side: str) -> None:
        return None


def start_metrics_server(port: int) -> None:
    start_http_server(port)
