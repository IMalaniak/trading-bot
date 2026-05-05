import { Injectable } from '@nestjs/common';

import {
  ExposureReservationStatus,
  PortfolioOrderStatus,
} from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaDbClient } from '../../prisma/prisma-db-client';
import {
  toPrismaDecimal,
  zeroPrismaDecimal,
} from '../../prisma/prisma-decimal';
import {
  NormalizedOrderFill,
  PortfolioSummarySnapshotRecord,
  PositionAccountingFill,
  PositionState,
} from '../types/fill-reconciliation-types';

const STATUS_RANK: Record<PortfolioOrderStatus, number> = {
  [PortfolioOrderStatus.PLACED]: 1,
  [PortfolioOrderStatus.PARTIALLY_FILLED]: 2,
  [PortfolioOrderStatus.FILLED]: 3,
};

const laterStatus = (
  left: PortfolioOrderStatus,
  right: PortfolioOrderStatus,
): PortfolioOrderStatus =>
  STATUS_RANK[left] >= STATUS_RANK[right] ? left : right;

const mapFill = (
  fill: Awaited<ReturnType<PrismaService['portfolioFill']['findUnique']>>,
): NormalizedOrderFill | null => {
  if (!fill) {
    return null;
  }

  return {
    id: fill.id,
    kafkaEventId: fill.kafkaEventId,
    orderId: fill.orderId,
    approvalEventId: fill.approvalEventId,
    sourceEventId: fill.sourceEventId,
    candidateIdempotencyKey: fill.candidateIdempotencyKey,
    portfolioId: fill.portfolioId,
    instrumentId: fill.instrumentId,
    signalId: fill.signalId,
    side: fill.side,
    sequence: fill.sequence,
    fillNotional: toPrismaDecimal(fill.fillNotional),
    fillQuantity: toPrismaDecimal(fill.fillQuantity),
    fillPrice: toPrismaDecimal(fill.fillPrice),
    cumulativeFilledNotional: toPrismaDecimal(fill.cumulativeFilledNotional),
    cumulativeFilledQuantity: toPrismaDecimal(fill.cumulativeFilledQuantity),
    orderStatus: fill.orderStatus,
    filledAt: fill.filledAt,
    receivedAt: fill.receivedAt,
  };
};

@Injectable()
export class PortfolioReconciliationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findFillById(
    fillId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<NormalizedOrderFill | null> {
    const fill = await client.portfolioFill.findUnique({
      where: { id: fillId },
    });

    return mapFill(fill);
  }

  async upsertOrderFromFill(
    fill: NormalizedOrderFill,
    client: PrismaDbClient = this.prisma,
  ): Promise<void> {
    const existingOrder = await client.portfolioOrder.findUnique({
      where: { id: fill.orderId },
    });

    const finalSequence =
      fill.orderStatus === PortfolioOrderStatus.FILLED ? fill.sequence : null;

    if (!existingOrder) {
      await client.portfolioOrder.create({
        data: {
          id: fill.orderId,
          approvalEventId: fill.approvalEventId,
          candidateIdempotencyKey: fill.candidateIdempotencyKey,
          sourceEventId: fill.sourceEventId,
          portfolioId: fill.portfolioId,
          instrumentId: fill.instrumentId,
          signalId: fill.signalId,
          side: fill.side,
          status: fill.orderStatus,
          finalSequence,
          firstFilledAt: fill.filledAt,
          lastFilledAt: fill.filledAt,
        },
      });
      return;
    }

    if (
      existingOrder.approvalEventId !== fill.approvalEventId ||
      existingOrder.candidateIdempotencyKey !== fill.candidateIdempotencyKey ||
      existingOrder.sourceEventId !== fill.sourceEventId ||
      existingOrder.portfolioId !== fill.portfolioId ||
      existingOrder.instrumentId !== fill.instrumentId ||
      existingOrder.signalId !== fill.signalId ||
      existingOrder.side !== Number(fill.side)
    ) {
      throw new Error(
        `Order '${fill.orderId}' already exists with different identity fields`,
      );
    }

    await client.portfolioOrder.update({
      where: { id: fill.orderId },
      data: {
        status: laterStatus(existingOrder.status, fill.orderStatus),
        finalSequence: existingOrder.finalSequence ?? finalSequence,
        firstFilledAt:
          fill.filledAt.getTime() < existingOrder.firstFilledAt.getTime()
            ? fill.filledAt
            : existingOrder.firstFilledAt,
        lastFilledAt:
          fill.filledAt.getTime() > existingOrder.lastFilledAt.getTime()
            ? fill.filledAt
            : existingOrder.lastFilledAt,
      },
    });
  }

  async createFill(
    fill: NormalizedOrderFill,
    client: PrismaDbClient = this.prisma,
  ): Promise<void> {
    await client.portfolioFill.create({
      data: {
        id: fill.id,
        kafkaEventId: fill.kafkaEventId,
        orderId: fill.orderId,
        approvalEventId: fill.approvalEventId,
        sourceEventId: fill.sourceEventId,
        candidateIdempotencyKey: fill.candidateIdempotencyKey,
        portfolioId: fill.portfolioId,
        instrumentId: fill.instrumentId,
        signalId: fill.signalId,
        side: fill.side,
        sequence: fill.sequence,
        fillNotional: fill.fillNotional,
        fillQuantity: fill.fillQuantity,
        fillPrice: fill.fillPrice,
        cumulativeFilledNotional: fill.cumulativeFilledNotional,
        cumulativeFilledQuantity: fill.cumulativeFilledQuantity,
        orderStatus: fill.orderStatus,
        filledAt: fill.filledAt,
        receivedAt: fill.receivedAt,
      },
    });
  }

  async findPositionFills(
    portfolioId: string,
    instrumentId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<PositionAccountingFill[]> {
    const fills = await client.portfolioFill.findMany({
      where: {
        portfolioId,
        instrumentId,
      },
      orderBy: [{ filledAt: 'asc' }, { sequence: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        side: true,
        sequence: true,
        fillQuantity: true,
        fillPrice: true,
        filledAt: true,
      },
    });

    return fills.map((fill) => ({
      id: fill.id,
      side: fill.side,
      sequence: fill.sequence,
      fillQuantity: toPrismaDecimal(fill.fillQuantity),
      fillPrice: toPrismaDecimal(fill.fillPrice),
      filledAt: fill.filledAt,
    }));
  }

  async upsertPosition(
    fill: NormalizedOrderFill,
    position: PositionState,
    client: PrismaDbClient = this.prisma,
  ): Promise<void> {
    await client.portfolioPosition.upsert({
      where: {
        portfolioId_instrumentId: {
          portfolioId: fill.portfolioId,
          instrumentId: fill.instrumentId,
        },
      },
      create: {
        portfolioId: fill.portfolioId,
        instrumentId: fill.instrumentId,
        quantity: position.quantity,
        averageEntryPrice: position.averageEntryPrice,
        exposureNotional: position.exposureNotional,
        lastFillId: fill.id,
      },
      update: {
        quantity: position.quantity,
        averageEntryPrice: position.averageEntryPrice,
        exposureNotional: position.exposureNotional,
        lastFillId: fill.id,
      },
    });
  }

  async sumPortfolioExposure(
    portfolioId: string,
    client: PrismaDbClient = this.prisma,
  ) {
    const result = await client.portfolioPosition.aggregate({
      where: { portfolioId },
      _sum: { exposureNotional: true },
    });

    return result._sum.exposureNotional
      ? toPrismaDecimal(result._sum.exposureNotional)
      : zeroPrismaDecimal();
  }

  async countOpenPositions(
    portfolioId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<number> {
    return client.portfolioPosition.count({
      where: {
        portfolioId,
        quantity: {
          not: zeroPrismaDecimal(),
        },
      },
    });
  }

  async createSnapshot(
    input: Omit<PortfolioSummarySnapshotRecord, 'id'>,
    client: PrismaDbClient = this.prisma,
  ): Promise<PortfolioSummarySnapshotRecord> {
    const snapshot = await client.portfolioSummarySnapshot.create({
      data: input,
    });

    return {
      id: snapshot.id,
      portfolioId: snapshot.portfolioId,
      sourceFillId: snapshot.sourceFillId,
      orderId: snapshot.orderId,
      instrumentId: snapshot.instrumentId,
      aggregateExposureNotional: toPrismaDecimal(
        snapshot.aggregateExposureNotional,
      ),
      openPositionCount: snapshot.openPositionCount,
      changedPositionQuantity: toPrismaDecimal(
        snapshot.changedPositionQuantity,
      ),
      changedPositionAverageEntryPrice: toPrismaDecimal(
        snapshot.changedPositionAverageEntryPrice,
      ),
      changedPositionExposureNotional: toPrismaDecimal(
        snapshot.changedPositionExposureNotional,
      ),
      updatedAt: snapshot.updatedAt,
    };
  }

  async orderHasCompleteFinalSequence(
    orderId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<boolean> {
    const order = await client.portfolioOrder.findUnique({
      where: { id: orderId },
      select: { finalSequence: true },
    });

    if (!order?.finalSequence) {
      return false;
    }

    const fills = await client.portfolioFill.findMany({
      where: { orderId },
      select: { sequence: true },
    });
    const sequences = new Set(fills.map((fill) => fill.sequence));

    for (let sequence = 1; sequence <= order.finalSequence; sequence += 1) {
      if (!sequences.has(sequence)) {
        return false;
      }
    }

    return true;
  }

  async releaseActiveReservation(
    candidateIdempotencyKey: string,
    releasedAt: Date,
    client: PrismaDbClient = this.prisma,
  ): Promise<void> {
    await client.exposureReservation.updateMany({
      where: {
        candidateIdempotencyKey,
        status: ExposureReservationStatus.ACTIVE,
      },
      data: {
        status: ExposureReservationStatus.RELEASED,
        releasedAt,
      },
    });
  }
}
