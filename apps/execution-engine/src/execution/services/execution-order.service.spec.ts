import { KAFKA_TOPICS } from '@trading-bot/common';
import {
  Signal,
  SignalSide,
  TradeDecision,
  TradeDecisionKind,
} from '@trading-bot/common/proto';

import { EventDispatcherService } from '../../event-dispatcher/event-dispatcher.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderLifecycleEventFactory } from '../events/order-lifecycle-event.factory';
import { ExecutionOrderService } from './execution-order.service';
import { ExecutionSimulatorService } from './execution-simulator.service';

type TransactionMethod = (
  callback: (tx: typeof txMock) => Promise<unknown>,
) => Promise<unknown>;

const txMock = {
  executionOrder: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  executionFill: {
    createMany: jest.fn(),
  },
};

describe('ExecutionOrderService', () => {
  let service: ExecutionOrderService;
  let prisma: {
    executionOrder: { findFirst: jest.Mock };
    $transaction: jest.MockedFunction<TransactionMethod>;
  };
  let eventDispatcher: {
    enqueueEvent: jest.MockedFunction<EventDispatcherService['enqueueEvent']>;
  };

  const decision = TradeDecision.fromPartial({
    signal: Signal.fromPartial({
      id: 'signal-1',
      instrumentId: 'instrument-1',
      side: SignalSide.BUY,
      price: 100,
      timestamp: new Date('2026-03-25T12:00:00.000Z').getTime(),
    }),
    sourceEventId: 'source-event-1',
    portfolioId: 'portfolio-1',
    candidateIdempotencyKey: 'source-event-1:portfolio-1',
    decision: TradeDecisionKind.APPROVED,
    requestedNotional: '100',
    requestedQuantity: '1',
    referencePrice: '100',
    decidedAt: '2026-03-25T12:00:02.000Z',
  });

  beforeEach(() => {
    txMock.executionOrder.findFirst.mockReset();
    txMock.executionOrder.create.mockReset();
    txMock.executionFill.createMany.mockReset();
    txMock.executionOrder.findFirst.mockResolvedValue(null);
    txMock.executionOrder.create.mockResolvedValue(undefined);
    txMock.executionFill.createMany.mockResolvedValue({ count: 2 });

    prisma = {
      executionOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((callback) => callback(txMock)),
    };
    eventDispatcher = {
      enqueueEvent: jest.fn().mockResolvedValue('event-id'),
    };

    service = new ExecutionOrderService(
      prisma as unknown as PrismaService,
      new ExecutionSimulatorService(),
      new OrderLifecycleEventFactory(),
      eventDispatcher as unknown as EventDispatcherService,
    );
  });

  it('skips duplicate approved trade messages', async () => {
    prisma.executionOrder.findFirst.mockResolvedValue({
      id: 'existing-order',
    });

    await service.handleApprovedTrade('approval-event-1', decision);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(eventDispatcher.enqueueEvent).not.toHaveBeenCalled();
  });

  it('persists the simulated lifecycle and enqueues ordered outbox events', async () => {
    await service.handleApprovedTrade('approval-event-1', decision);

    expect(txMock.executionOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        approvalEventId: 'approval-event-1',
        candidateIdempotencyKey: 'source-event-1:portfolio-1',
        portfolioId: 'portfolio-1',
      }),
    });
    expect(txMock.executionFill.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ sequence: 1 }),
        expect.objectContaining({ sequence: 2 }),
      ],
    });
    expect(eventDispatcher.enqueueEvent).toHaveBeenCalledTimes(3);
    expect(
      eventDispatcher.enqueueEvent.mock.calls.map((call) => call[1]),
    ).toEqual([
      KAFKA_TOPICS.ORDERS_PLACED,
      KAFKA_TOPICS.ORDERS_FILLS,
      KAFKA_TOPICS.ORDERS_FILLS,
    ]);
    expect(
      eventDispatcher.enqueueEvent.mock.calls.map((call) => call[2]),
    ).toEqual([1, 2, 3]);
  });

  it('rejects invalid non-approved trade decisions before creating records', async () => {
    await expect(
      service.handleApprovedTrade(
        'approval-event-1',
        TradeDecision.fromPartial({
          ...decision,
          decision: TradeDecisionKind.REJECTED,
        }),
      ),
    ).rejects.toThrow('Execution simulator only accepts approved trades');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
