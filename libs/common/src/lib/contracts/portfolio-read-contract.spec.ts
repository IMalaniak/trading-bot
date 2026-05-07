import {
  AssetClass,
  ExecutionOrder,
  GetPortfolioResponse,
  Instrument,
  ListPortfolioExecutionOrdersResponse,
  OrderStatus,
  PortfolioSummary,
  Position,
  SignalSide,
} from '../../proto';

describe('portfolio read contracts', () => {
  it('round-trips portfolio read state with decimal strings', () => {
    const response = GetPortfolioResponse.fromPartial({
      summary: PortfolioSummary.fromPartial({
        portfolioId: 'portfolio-alpha',
        name: 'Alpha Portfolio',
        isActive: true,
        exposureCapNotional: '1000.000000000000000001',
        aggregateExposureNotional: '150.000000000000000004',
        openPositionCount: 1,
        updatedAt: '2026-03-25T12:00:05.000Z',
      }),
      positions: [
        Position.fromPartial({
          portfolioId: 'portfolio-alpha',
          instrument: Instrument.fromPartial({
            id: 'instrument-1',
            assetClass: AssetClass.CRYPTO,
            symbol: 'BTC/USDT',
            venue: 'BINANCE',
            externalSymbol: 'BTCUSDT',
          }),
          quantity: '0.500000000000000001',
          averageEntryPrice: '300.000000000000000003',
          exposureNotional: '150.000000000000000004',
          lastFillId: 'ord_abc:fill:2',
          updatedAt: '2026-03-25T12:00:05.000Z',
        }),
      ],
    });

    const decoded = GetPortfolioResponse.decode(
      GetPortfolioResponse.encode(response).finish(),
    );

    expect(decoded.summary?.exposureCapNotional).toBe(
      '1000.000000000000000001',
    );
    expect(decoded.positions[0]?.quantity).toBe('0.500000000000000001');
    expect(decoded.positions[0]?.instrument?.symbol).toBe('BTC/USDT');
  });

  it('round-trips execution orders with nested fills and exact decimals', () => {
    const response = ListPortfolioExecutionOrdersResponse.fromPartial({
      orders: [
        ExecutionOrder.fromPartial({
          orderId: 'ord_abc',
          approvalEventId: 'approval-event-1',
          candidateIdempotencyKey: 'source-event-1:portfolio-alpha',
          sourceEventId: 'source-event-1',
          portfolioId: 'portfolio-alpha',
          instrumentId: 'instrument-1',
          signalId: 'signal-1',
          side: SignalSide.BUY,
          requestedNotional: '100.000000000000000001',
          requestedQuantity: '0.333333333333333333',
          referencePrice: '300.000000000000000003',
          status: OrderStatus.FILLED,
          approvedAt: '2026-03-25T12:00:02.000Z',
          placedAt: '2026-03-25T12:00:03.000Z',
          lastActivityAt: '2026-03-25T12:00:05.000Z',
          fills: [
            {
              fillId: 'ord_abc:fill:1',
              orderId: 'ord_abc',
              portfolioId: 'portfolio-alpha',
              instrumentId: 'instrument-1',
              sequence: 1,
              fillNotional: '50.000000000000000001',
              fillQuantity: '0.166666666666666667',
              fillPrice: '300.000000000000000003',
              cumulativeFilledNotional: '50.000000000000000001',
              cumulativeFilledQuantity: '0.166666666666666667',
              orderStatus: OrderStatus.PARTIALLY_FILLED,
              filledAt: '2026-03-25T12:00:04.000Z',
            },
          ],
        }),
      ],
    });

    const decoded = ListPortfolioExecutionOrdersResponse.decode(
      ListPortfolioExecutionOrdersResponse.encode(response).finish(),
    );

    expect(decoded.orders[0]?.requestedQuantity).toBe('0.333333333333333333');
    expect(decoded.orders[0]?.fills[0]?.fillNotional).toBe(
      '50.000000000000000001',
    );
    expect(decoded.orders[0]?.status).toBe(OrderStatus.FILLED);
  });
});
