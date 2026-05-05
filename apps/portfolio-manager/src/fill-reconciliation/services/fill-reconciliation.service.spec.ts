import { KAFKA_TOPICS } from '@trading-bot/common';
import { OrderFill, OrderStatus, SignalSide } from '@trading-bot/common/proto';

import { EventDispatcherService } from '../../event-dispatcher/event-dispatcher.service';
import { PortfolioOrderStatus } from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toPrismaDecimal,
  zeroPrismaDecimal,
} from '../../prisma/prisma-decimal';
import { PortfolioUpdatedEventFactory } from '../events/portfolio-updated-event.factory';
import { PortfolioReconciliationRepository } from '../repositories/portfolio-reconciliation.repository';
import {
  NormalizedOrderFill,
  PositionState,
  SourceFillContext,
} from '../types/fill-reconciliation-types';
import { FillReconciliationService } from './fill-reconciliation.service';
import { PositionAccountingService } from './position-accounting.service';

type TransactionMethod = <T>(
  callback: (tx: object) => Promise<T>,
) => Promise<T>;
type MockRepository = {
  findFillById: jest.MockedFunction<
    PortfolioReconciliationRepository['findFillById']
  >;
  upsertOrderFromFill: jest.MockedFunction<
    PortfolioReconciliationRepository['upsertOrderFromFill']
  >;
  createFill: jest.MockedFunction<
    PortfolioReconciliationRepository['createFill']
  >;
  findPositionFills: jest.MockedFunction<
    PortfolioReconciliationRepository['findPositionFills']
  >;
  upsertPosition: jest.MockedFunction<
    PortfolioReconciliationRepository['upsertPosition']
  >;
  sumPortfolioExposure: jest.MockedFunction<
    PortfolioReconciliationRepository['sumPortfolioExposure']
  >;
  countOpenPositions: jest.MockedFunction<
    PortfolioReconciliationRepository['countOpenPositions']
  >;
  createSnapshot: jest.MockedFunction<
    PortfolioReconciliationRepository['createSnapshot']
  >;
  orderHasCompleteFinalSequence: jest.MockedFunction<
    PortfolioReconciliationRepository['orderHasCompleteFinalSequence']
  >;
  releaseActiveReservation: jest.MockedFunction<
    PortfolioReconciliationRepository['releaseActiveReservation']
  >;
};
type MockPositionAccounting = {
  calculate: jest.MockedFunction<PositionAccountingService['calculate']>;
};
type MockEventFactory = {
  create: jest.MockedFunction<PortfolioUpdatedEventFactory['create']>;
};
type MockEventDispatcher = {
  enqueueEvent: jest.MockedFunction<EventDispatcherService['enqueueEvent']>;
};

describe('FillReconciliationService', () => {
  let service: FillReconciliationService;
  let prisma: { $transaction: TransactionMethod };
  let transactionMock: jest.MockedFunction<
    (callback: (tx: object) => Promise<unknown>) => Promise<unknown>
  >;
  let repository: MockRepository;
  let positionAccounting: MockPositionAccounting;
  let eventFactory: MockEventFactory;
  let eventDispatcher: MockEventDispatcher;

  const receivedAt = new Date('2026-03-25T12:00:04.000Z');
  const baseFill = OrderFill.fromPartial({
    fillId: 'order-1:fill:1',
    orderId: 'order-1',
    approvalEventId: 'approval-1',
    sourceEventId: 'source-1',
    candidateIdempotencyKey: 'source-1:portfolio-1',
    portfolioId: 'portfolio-1',
    signal: {
      id: 'signal-1',
      instrumentId: 'instrument-1',
      side: SignalSide.BUY,
      price: 100,
      timestamp: new Date('2026-03-25T12:00:00.000Z').getTime(),
    },
    sequence: 1,
    fillNotional: '50',
    fillQuantity: '0.5',
    fillPrice: '100',
    cumulativeFilledNotional: '50',
    cumulativeFilledQuantity: '0.5',
    orderStatus: OrderStatus.PARTIALLY_FILLED,
    filledAt: '2026-03-25T12:00:03.000Z',
  });
  const normalizedFill: NormalizedOrderFill = {
    id: 'order-1:fill:1',
    kafkaEventId: 'order-1:fill:1',
    orderId: 'order-1',
    approvalEventId: 'approval-1',
    sourceEventId: 'source-1',
    candidateIdempotencyKey: 'source-1:portfolio-1',
    portfolioId: 'portfolio-1',
    instrumentId: 'instrument-1',
    signalId: 'signal-1',
    side: SignalSide.BUY,
    sequence: 1,
    fillNotional: toPrismaDecimal('50'),
    fillQuantity: toPrismaDecimal('0.5'),
    fillPrice: toPrismaDecimal('100'),
    cumulativeFilledNotional: toPrismaDecimal('50'),
    cumulativeFilledQuantity: toPrismaDecimal('0.5'),
    orderStatus: PortfolioOrderStatus.PARTIALLY_FILLED,
    filledAt: new Date('2026-03-25T12:00:03.000Z'),
    receivedAt,
  };
  const position: PositionState = {
    quantity: toPrismaDecimal('0.5'),
    averageEntryPrice: toPrismaDecimal('100'),
    exposureNotional: toPrismaDecimal('50'),
  };
  const context: SourceFillContext = {
    kafkaEventId: 'order-1:fill:1',
    kafkaKey: 'portfolio-1',
    receivedAt,
    fill: baseFill,
  };

  beforeEach(() => {
    transactionMock = jest.fn((callback) => callback({}));
    prisma = {
      $transaction: transactionMock as unknown as TransactionMethod,
    };
    repository = {
      findFillById: jest.fn(),
      upsertOrderFromFill: jest.fn(),
      createFill: jest.fn(),
      findPositionFills: jest.fn(),
      upsertPosition: jest.fn(),
      sumPortfolioExposure: jest.fn(),
      countOpenPositions: jest.fn(),
      createSnapshot: jest.fn(),
      orderHasCompleteFinalSequence: jest.fn(),
      releaseActiveReservation: jest.fn(),
    };
    positionAccounting = {
      calculate: jest.fn(),
    };
    eventFactory = {
      create: jest.fn(),
    };
    eventDispatcher = {
      enqueueEvent: jest.fn(),
    };

    repository.findFillById.mockResolvedValue(null);
    repository.findPositionFills.mockResolvedValue([normalizedFill]);
    positionAccounting.calculate.mockReturnValue(position);
    repository.orderHasCompleteFinalSequence.mockResolvedValue(false);
    repository.sumPortfolioExposure.mockResolvedValue(toPrismaDecimal('50'));
    repository.countOpenPositions.mockResolvedValue(1);
    repository.createSnapshot.mockResolvedValue({
      id: 'snapshot-1',
      portfolioId: 'portfolio-1',
      sourceFillId: 'order-1:fill:1',
      orderId: 'order-1',
      instrumentId: 'instrument-1',
      aggregateExposureNotional: toPrismaDecimal('50'),
      openPositionCount: 1,
      changedPositionQuantity: position.quantity,
      changedPositionAverageEntryPrice: position.averageEntryPrice,
      changedPositionExposureNotional: position.exposureNotional,
      updatedAt: receivedAt,
    });
    eventFactory.create.mockReturnValue({
      topic: KAFKA_TOPICS.PORTFOLIO_UPDATED,
      message: {
        eventId: 'order-1:fill:1:portfolio-updated',
        key: 'portfolio-1',
        value: new Uint8Array([1]),
        headers: {},
      },
    });

    service = new FillReconciliationService(
      prisma as unknown as PrismaService,
      repository as unknown as PortfolioReconciliationRepository,
      positionAccounting,
      eventFactory,
      eventDispatcher as unknown as EventDispatcherService,
    );
  });

  it('persists a unique fill, updates the position, snapshots, and enqueues portfolio.updated', async () => {
    await service.handleFill(context);

    expect(repository.upsertOrderFromFill).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1:fill:1', orderId: 'order-1' }),
      expect.any(Object),
    );
    expect(repository.createFill).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'order-1:fill:1',
        fillQuantity: expect.objectContaining({}),
      }),
      expect.any(Object),
    );
    expect(repository.upsertPosition).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1:fill:1' }),
      position,
      expect.any(Object),
    );
    expect(eventDispatcher.enqueueEvent).toHaveBeenCalledWith(
      expect.any(Object),
      KAFKA_TOPICS.PORTFOLIO_UPDATED,
      expect.objectContaining({ key: 'portfolio-1' }),
    );
  });

  it('absorbs duplicate identical fills without writing another snapshot or event', async () => {
    repository.findFillById.mockResolvedValue(normalizedFill);

    await service.handleFill(context);

    expect(repository.createFill).not.toHaveBeenCalled();
    expect(repository.createSnapshot).not.toHaveBeenCalled();
    expect(eventDispatcher.enqueueEvent).not.toHaveBeenCalled();
  });

  it('rejects duplicate fill ids with divergent fields', async () => {
    repository.findFillById.mockResolvedValue({
      ...normalizedFill,
      fillQuantity: toPrismaDecimal('0.75'),
    });

    await expect(service.handleFill(context)).rejects.toThrow(
      "Fill 'order-1:fill:1' already exists with different fields",
    );
  });

  it('does not release reservations until the order has a complete final sequence', async () => {
    repository.orderHasCompleteFinalSequence.mockResolvedValue(false);

    await service.handleFill(context);

    expect(repository.releaseActiveReservation).not.toHaveBeenCalled();
  });

  it('releases the matching reservation when the final fill sequence is complete', async () => {
    repository.orderHasCompleteFinalSequence.mockResolvedValue(true);

    await service.handleFill(context);

    expect(repository.releaseActiveReservation).toHaveBeenCalledWith(
      'source-1:portfolio-1',
      receivedAt,
      expect.any(Object),
    );
  });

  it('stores flat positions as zero-value snapshots', async () => {
    const flatPosition = {
      quantity: zeroPrismaDecimal(),
      averageEntryPrice: zeroPrismaDecimal(),
      exposureNotional: zeroPrismaDecimal(),
    };
    positionAccounting.calculate.mockReturnValue(flatPosition);
    repository.sumPortfolioExposure.mockResolvedValue(zeroPrismaDecimal());
    repository.countOpenPositions.mockResolvedValue(0);

    await service.handleFill(context);

    expect(repository.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateExposureNotional: expect.objectContaining({}),
        openPositionCount: 0,
        changedPositionQuantity: flatPosition.quantity,
        changedPositionAverageEntryPrice: flatPosition.averageEntryPrice,
        changedPositionExposureNotional: flatPosition.exposureNotional,
      }),
      expect.any(Object),
    );
  });
});
