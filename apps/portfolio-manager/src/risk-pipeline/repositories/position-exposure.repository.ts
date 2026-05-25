import { Injectable } from '@nestjs/common';

import { PositionAccountingService } from '../../fill-reconciliation/services/position-accounting.service';
import { PositionAccountingFill } from '../../fill-reconciliation/types/fill-reconciliation-types';
import { ExposureReservationStatus } from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaDbClient } from '../../prisma/prisma-db-client';
import {
  PrismaDecimal,
  toPrismaDecimal,
  zeroPrismaDecimal,
} from '../../prisma/prisma-decimal';

@Injectable()
export class PositionExposureRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly positionAccounting: PositionAccountingService,
  ) {}

  async sumPortfolioPositionExposure(
    portfolioId: string,
    client: PrismaDbClient = this.prisma,
  ) {
    const settledFills = await this.findSettledFills(portfolioId, client);
    const fillsByInstrument = new Map<string, PositionAccountingFill[]>();

    for (const fill of settledFills) {
      const instrumentFills = fillsByInstrument.get(fill.instrumentId) ?? [];

      instrumentFills.push(fill);
      fillsByInstrument.set(fill.instrumentId, instrumentFills);
    }

    return [...fillsByInstrument.values()].reduce(
      (totalExposure, fills) =>
        totalExposure.plus(
          this.positionAccounting.calculate(fills).exposureNotional,
        ),
      zeroPrismaDecimal(),
    );
  }

  async sumInstrumentPositionExposure(
    portfolioId: string,
    instrumentId: string,
    client: PrismaDbClient = this.prisma,
  ) {
    const settledFills = await this.findSettledFills(
      portfolioId,
      client,
      instrumentId,
    );

    return this.positionAccounting.calculate(settledFills).exposureNotional;
  }

  async sumInstrumentDailyFilledNotional(
    portfolioId: string,
    instrumentId: string,
    date: Date,
    client: PrismaDbClient = this.prisma,
  ): Promise<PrismaDecimal> {
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const result = await client.portfolioFill.aggregate({
      where: {
        portfolioId,
        instrumentId,
        filledAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      _sum: {
        fillNotional: true,
      },
    });

    return result._sum.fillNotional
      ? toPrismaDecimal(result._sum.fillNotional.toString())
      : zeroPrismaDecimal();
  }

  private async findActiveReservationKeys(
    portfolioId: string,
    client: PrismaDbClient,
  ): Promise<string[]> {
    const reservations = await client.exposureReservation.findMany({
      where: {
        portfolioId,
        status: ExposureReservationStatus.ACTIVE,
      },
      select: {
        candidateIdempotencyKey: true,
      },
    });

    return reservations.map(
      (reservation) => reservation.candidateIdempotencyKey,
    );
  }

  private async findSettledFills(
    portfolioId: string,
    client: PrismaDbClient,
    instrumentId?: string,
  ): Promise<Array<PositionAccountingFill & { instrumentId: string }>> {
    const activeReservationKeys = await this.findActiveReservationKeys(
      portfolioId,
      client,
    );
    const fills = await client.portfolioFill.findMany({
      where: {
        portfolioId,
        ...(instrumentId ? { instrumentId } : {}),
        ...(activeReservationKeys.length > 0
          ? {
              candidateIdempotencyKey: {
                notIn: activeReservationKeys,
              },
            }
          : {}),
      },
      orderBy: [
        { instrumentId: 'asc' },
        { filledAt: 'asc' },
        { sequence: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        instrumentId: true,
        side: true,
        sequence: true,
        fillQuantity: true,
        fillPrice: true,
        filledAt: true,
      },
    });

    return fills.map((fill) => ({
      id: fill.id,
      instrumentId: fill.instrumentId,
      side: fill.side,
      sequence: fill.sequence,
      fillQuantity: toPrismaDecimal(fill.fillQuantity),
      fillPrice: toPrismaDecimal(fill.fillPrice),
      filledAt: fill.filledAt,
    }));
  }
}
