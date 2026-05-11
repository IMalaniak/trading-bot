import { OrderStatus, SignalSide } from '@trading-bot/common/proto';
import { describe, expect, it } from 'vitest';

import type { ExecutionFillDto, ExecutionOrderDto } from './api-client';
import { buildOrderFillReplay } from './fill-replay';

describe('buildOrderFillReplay', () => {
  it('reconstructs an orders.fills payload from the REST order and fill DTOs', () => {
    const order: ExecutionOrderDto = {
      approvalEventId: 'approval-1',
      approvedAt: '2026-03-25T12:00:02.000Z',
      candidateIdempotencyKey: 'source-1:portfolio-alpha',
      fills: [],
      instrumentId: 'instrument-1',
      lastActivityAt: '2026-03-25T12:00:05.000Z',
      orderId: 'order-1',
      placedAt: '2026-03-25T12:00:03.000Z',
      portfolioId: 'portfolio-alpha',
      referencePrice: '100',
      requestedNotional: '100',
      requestedQuantity: '1',
      side: 'BUY',
      signalId: 'signal-1',
      sourceEventId: 'source-1',
      status: 'FILLED',
    };
    const fill: ExecutionFillDto = {
      cumulativeFilledNotional: '100',
      cumulativeFilledQuantity: '1',
      fillId: 'order-1:fill:2',
      fillNotional: '50',
      fillPrice: '100',
      fillQuantity: '0.5',
      filledAt: '2026-03-25T12:00:05.000Z',
      instrumentId: 'instrument-1',
      orderId: 'order-1',
      orderStatus: 'FILLED',
      portfolioId: 'portfolio-alpha',
      sequence: 2,
    };

    expect(buildOrderFillReplay(order, fill)).toEqual(
      expect.objectContaining({
        approvalEventId: 'approval-1',
        candidateIdempotencyKey: 'source-1:portfolio-alpha',
        fillId: 'order-1:fill:2',
        orderId: 'order-1',
        orderStatus: OrderStatus.FILLED,
        portfolioId: 'portfolio-alpha',
        sequence: 2,
        signal: expect.objectContaining({
          id: 'signal-1',
          instrumentId: 'instrument-1',
          price: 100,
          side: SignalSide.BUY,
        }),
        sourceEventId: 'source-1',
      }),
    );
  });
});
