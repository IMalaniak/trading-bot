import {
  Signal,
  SignalSide,
  TradeDecision,
  TradeDecisionKind,
} from '@trading-bot/common/proto';

import { ExecutionOrderStatus } from '../../prisma/generated/client';
import {
  deriveOrderId,
  ExecutionSimulatorService,
  InvalidTradeDecisionError,
} from './execution-simulator.service';

describe('ExecutionSimulatorService', () => {
  let service: ExecutionSimulatorService;

  const decision = TradeDecision.fromPartial({
    signal: Signal.fromPartial({
      id: 'signal-1',
      instrumentId: 'instrument-1',
      side: SignalSide.SELL,
      price: 300,
      timestamp: new Date('2026-03-25T12:00:00.000Z').getTime(),
    }),
    sourceEventId: 'source-event-1',
    portfolioId: 'portfolio-1',
    candidateIdempotencyKey: 'source-event-1:portfolio-1',
    decision: TradeDecisionKind.APPROVED,
    requestedNotional: '100.000000000000000001',
    requestedQuantity: '0.333333333333333333',
    referencePrice: '300.000000000000000003',
    decidedAt: '2026-03-25T12:00:02.000Z',
  });

  beforeEach(() => {
    service = new ExecutionSimulatorService();
  });

  it('derives deterministic order ids from candidate idempotency keys', () => {
    expect(deriveOrderId('source-event-1:portfolio-1')).toBe(
      deriveOrderId('source-event-1:portfolio-1'),
    );
    expect(deriveOrderId('source-event-1:portfolio-1')).toMatch(
      /^ord_[a-f0-9]{32}$/,
    );
  });

  it('creates placed, partial fill, and final fill lifecycle data', () => {
    const lifecycle = service.simulate('approval-event-1', decision);

    expect(lifecycle.order.id).toBe(
      deriveOrderId(decision.candidateIdempotencyKey),
    );
    expect(lifecycle.order.side).toBe(SignalSide.SELL);
    expect(lifecycle.order.status).toBe(ExecutionOrderStatus.FILLED);
    expect(lifecycle.order.placedAt.toISOString()).toBe(
      '2026-03-25T12:00:03.000Z',
    );

    expect(lifecycle.fills).toHaveLength(2);
    expect(lifecycle.fills[0]).toEqual(
      expect.objectContaining({
        id: `${lifecycle.order.id}:fill:1`,
        sequence: 1,
        orderStatus: ExecutionOrderStatus.PARTIALLY_FILLED,
        filledAt: new Date('2026-03-25T12:00:04.000Z'),
      }),
    );
    expect(lifecycle.fills[1]).toEqual(
      expect.objectContaining({
        id: `${lifecycle.order.id}:fill:2`,
        sequence: 2,
        orderStatus: ExecutionOrderStatus.FILLED,
        filledAt: new Date('2026-03-25T12:00:05.000Z'),
      }),
    );
  });

  it('uses the second fill as the exact remainder', () => {
    const lifecycle = service.simulate('approval-event-1', decision);
    const totalQuantity = lifecycle.fills[0].fillQuantity.plus(
      lifecycle.fills[1].fillQuantity,
    );
    const totalNotional = lifecycle.fills[0].fillNotional.plus(
      lifecycle.fills[1].fillNotional,
    );

    expect(totalQuantity.toString()).toBe(decision.requestedQuantity);
    expect(totalNotional.toString()).toBe(decision.requestedNotional);
    expect(lifecycle.fills[1].fillQuantity.toString()).toBe(
      lifecycle.order.requestedQuantity
        .minus(lifecycle.fills[0].fillQuantity)
        .toString(),
    );
  });

  it('rejects non-approved decisions', () => {
    expect(() =>
      service.simulate(
        'approval-event-1',
        TradeDecision.fromPartial({
          ...decision,
          decision: TradeDecisionKind.REJECTED,
        }),
      ),
    ).toThrow(InvalidTradeDecisionError);
  });
});
