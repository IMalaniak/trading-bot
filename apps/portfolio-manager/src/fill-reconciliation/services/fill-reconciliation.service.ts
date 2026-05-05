import { Injectable } from '@nestjs/common';
import { OrderStatus, SignalSide } from '@trading-bot/common/proto';

import { EventDispatcherService } from '../../event-dispatcher/event-dispatcher.service';
import { Prisma } from '../../prisma/generated/client';
import { PortfolioOrderStatus } from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaDbClient } from '../../prisma/prisma-db-client';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { PortfolioUpdatedEventFactory } from '../events/portfolio-updated-event.factory';
import { PortfolioReconciliationRepository } from '../repositories/portfolio-reconciliation.repository';
import {
  NormalizedOrderFill,
  SourceFillContext,
} from '../types/fill-reconciliation-types';
import { PositionAccountingService } from './position-accounting.service';

const requireString = (value: string, field: string): string => {
  if (!value) {
    throw new Error(`OrderFill.${field} is required`);
  }

  return value;
};

const parseDate = (value: string, field: string): Date => {
  const date = new Date(requireString(value, field));

  if (Number.isNaN(date.getTime())) {
    throw new Error(`OrderFill.${field} must be an ISO timestamp`);
  }

  return date;
};

const toPortfolioOrderStatus = (status: OrderStatus): PortfolioOrderStatus => {
  switch (status) {
    case OrderStatus.PLACED:
      return PortfolioOrderStatus.PLACED;
    case OrderStatus.PARTIALLY_FILLED:
      return PortfolioOrderStatus.PARTIALLY_FILLED;
    case OrderStatus.FILLED:
      return PortfolioOrderStatus.FILLED;
    default:
      throw new Error(`Unsupported order status '${String(status)}'`);
  }
};

const normalizeFill = ({
  kafkaEventId,
  receivedAt,
  fill,
}: SourceFillContext): NormalizedOrderFill => {
  if (!fill.signal) {
    throw new Error('OrderFill.signal is required');
  }

  if (
    fill.signal.side !== SignalSide.BUY &&
    fill.signal.side !== SignalSide.SELL
  ) {
    throw new Error(`Unsupported fill side '${String(fill.signal.side)}'`);
  }

  if (fill.sequence < 1) {
    throw new Error('OrderFill.sequence must be greater than zero');
  }

  const fillQuantity = toPrismaDecimal(
    requireString(fill.fillQuantity, 'fillQuantity'),
  );
  const fillPrice = toPrismaDecimal(requireString(fill.fillPrice, 'fillPrice'));

  if (fillQuantity.lte(0)) {
    throw new Error('OrderFill.fillQuantity must be greater than zero');
  }

  if (fillPrice.lte(0)) {
    throw new Error('OrderFill.fillPrice must be greater than zero');
  }

  return {
    id: requireString(fill.fillId, 'fillId'),
    kafkaEventId,
    orderId: requireString(fill.orderId, 'orderId'),
    approvalEventId: requireString(fill.approvalEventId, 'approvalEventId'),
    sourceEventId: requireString(fill.sourceEventId, 'sourceEventId'),
    candidateIdempotencyKey: requireString(
      fill.candidateIdempotencyKey,
      'candidateIdempotencyKey',
    ),
    portfolioId: requireString(fill.portfolioId, 'portfolioId'),
    instrumentId: requireString(
      fill.signal.instrumentId,
      'signal.instrumentId',
    ),
    signalId: requireString(fill.signal.id, 'signal.id'),
    side: fill.signal.side,
    sequence: fill.sequence,
    fillNotional: toPrismaDecimal(
      requireString(fill.fillNotional, 'fillNotional'),
    ),
    fillQuantity,
    fillPrice,
    cumulativeFilledNotional: toPrismaDecimal(
      requireString(fill.cumulativeFilledNotional, 'cumulativeFilledNotional'),
    ),
    cumulativeFilledQuantity: toPrismaDecimal(
      requireString(fill.cumulativeFilledQuantity, 'cumulativeFilledQuantity'),
    ),
    orderStatus: toPortfolioOrderStatus(fill.orderStatus),
    filledAt: parseDate(fill.filledAt, 'filledAt'),
    receivedAt,
  };
};

const sameDecimal = (left: Prisma.Decimal, right: Prisma.Decimal): boolean =>
  left.equals(right);

const sameFill = (
  left: NormalizedOrderFill,
  right: NormalizedOrderFill,
): boolean =>
  left.kafkaEventId === right.kafkaEventId &&
  left.orderId === right.orderId &&
  left.approvalEventId === right.approvalEventId &&
  left.sourceEventId === right.sourceEventId &&
  left.candidateIdempotencyKey === right.candidateIdempotencyKey &&
  left.portfolioId === right.portfolioId &&
  left.instrumentId === right.instrumentId &&
  left.signalId === right.signalId &&
  left.side === right.side &&
  left.sequence === right.sequence &&
  sameDecimal(left.fillNotional, right.fillNotional) &&
  sameDecimal(left.fillQuantity, right.fillQuantity) &&
  sameDecimal(left.fillPrice, right.fillPrice) &&
  sameDecimal(left.cumulativeFilledNotional, right.cumulativeFilledNotional) &&
  sameDecimal(left.cumulativeFilledQuantity, right.cumulativeFilledQuantity) &&
  left.orderStatus === right.orderStatus &&
  left.filledAt.getTime() === right.filledAt.getTime();

const isUniqueConstraintViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class FillReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PortfolioReconciliationRepository,
    private readonly positionAccounting: PositionAccountingService,
    private readonly eventFactory: PortfolioUpdatedEventFactory,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  async handleFill(context: SourceFillContext): Promise<void> {
    const fill = normalizeFill(context);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.reconcileFill(fill, tx);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const existingFill = await this.repository.findFillById(fill.id);

        if (existingFill && sameFill(existingFill, fill)) {
          return;
        }
      }

      throw error;
    }
  }

  private async reconcileFill(
    fill: NormalizedOrderFill,
    tx: PrismaDbClient,
  ): Promise<void> {
    const existingFill = await this.repository.findFillById(fill.id, tx);

    if (existingFill) {
      if (!sameFill(existingFill, fill)) {
        throw new Error(
          `Fill '${fill.id}' already exists with different fields`,
        );
      }

      return;
    }

    await this.repository.upsertOrderFromFill(fill, tx);
    await this.repository.createFill(fill, tx);

    const fillsForPosition = await this.repository.findPositionFills(
      fill.portfolioId,
      fill.instrumentId,
      tx,
    );
    const position = this.positionAccounting.calculate(fillsForPosition);

    await this.repository.upsertPosition(fill, position, tx);

    if (await this.repository.orderHasCompleteFinalSequence(fill.orderId, tx)) {
      await this.repository.releaseActiveReservation(
        fill.candidateIdempotencyKey,
        fill.receivedAt,
        tx,
      );
    }

    const aggregateExposureNotional =
      await this.repository.sumPortfolioExposure(fill.portfolioId, tx);
    const openPositionCount = await this.repository.countOpenPositions(
      fill.portfolioId,
      tx,
    );
    const snapshot = await this.repository.createSnapshot(
      {
        portfolioId: fill.portfolioId,
        sourceFillId: fill.id,
        orderId: fill.orderId,
        instrumentId: fill.instrumentId,
        aggregateExposureNotional,
        openPositionCount,
        changedPositionQuantity: position.quantity,
        changedPositionAverageEntryPrice: position.averageEntryPrice,
        changedPositionExposureNotional: position.exposureNotional,
        updatedAt: fill.receivedAt,
      },
      tx,
    );
    const event = this.eventFactory.create(snapshot);

    await this.eventDispatcher.enqueueEvent(tx, event.topic, event.message);
  }
}
