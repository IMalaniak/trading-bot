import pytest
from common.signal_pb2 import BUY, Signal
from prediction_engine.cache import InMemorySignalCache
from prediction_engine.grpc_server import SignalsService
from prediction_engine.metrics import NoopPredictionMetrics
from services.prediction_engine_pb2 import GetLatestSignalsRequest


@pytest.mark.asyncio
async def test_get_latest_signals_filters_by_instrument() -> None:
    cache = InMemorySignalCache()
    await cache.store_signal(
        Signal(id="signal-1", instrument_id="instrument-1", side=BUY, price=100, timestamp=1)
    )
    await cache.store_signal(
        Signal(id="signal-2", instrument_id="instrument-2", side=BUY, price=101, timestamp=2)
    )
    service = SignalsService(cache, NoopPredictionMetrics())

    response = await service.GetLatestSignals(
        GetLatestSignalsRequest(instrument_id="instrument-1", limit=10),
        None,
    )

    assert [signal.id for signal in response.signals] == ["signal-1"]
