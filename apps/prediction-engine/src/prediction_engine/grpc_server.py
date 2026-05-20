from __future__ import annotations

import grpc
from services.prediction_engine_pb2 import GetLatestSignalsRequest, GetLatestSignalsResponse
from services.prediction_engine_pb2_grpc import SignalsServicer, add_SignalsServicer_to_server

from prediction_engine.cache import SignalCache
from prediction_engine.metrics import PredictionMetrics


class SignalsService(SignalsServicer):  # type: ignore[misc]
    def __init__(self, cache: SignalCache, metrics: PredictionMetrics) -> None:
        self._cache = cache
        self._metrics = metrics

    async def GetLatestSignals(
        self,
        request: GetLatestSignalsRequest,
        context: grpc.aio.ServicerContext,
    ) -> GetLatestSignalsResponse:
        self._metrics.grpc_request("GetLatestSignals")
        signals = await self._cache.get_latest(
            request.instrument_id or None,
            request.limit,
        )
        return GetLatestSignalsResponse(signals=signals)


async def create_grpc_server(
    *,
    cache: SignalCache,
    metrics: PredictionMetrics,
    port: int,
) -> grpc.aio.Server:
    server = grpc.aio.server()
    add_SignalsServicer_to_server(SignalsService(cache, metrics), server)
    server.add_insecure_port(f"[::]:{port}")
    return server
