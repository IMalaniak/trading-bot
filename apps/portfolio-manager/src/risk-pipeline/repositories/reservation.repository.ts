import { Injectable } from '@nestjs/common';

import { ExposureReservationStatus } from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaDbClient } from '../../prisma/prisma-db-client';
import { PrismaDecimal, zeroPrismaDecimal } from '../../prisma/prisma-decimal';

interface CreateReservationInput {
  riskDecisionId: string;
  candidateIdempotencyKey: string;
  portfolioId: string;
  instrumentId: string;
  reservedNotional: PrismaDecimal;
  reservedQuantity: PrismaDecimal;
}

@Injectable()
export class ReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async sumActivePortfolioReservedNotional(
    portfolioId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<PrismaDecimal> {
    const result = await client.exposureReservation.aggregate({
      where: {
        portfolioId,
        status: ExposureReservationStatus.ACTIVE,
      },
      _sum: {
        reservedNotional: true,
      },
    });

    return result._sum.reservedNotional ?? zeroPrismaDecimal();
  }

  async sumActiveInstrumentReservedNotional(
    portfolioId: string,
    instrumentId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<PrismaDecimal> {
    const result = await client.exposureReservation.aggregate({
      where: {
        portfolioId,
        instrumentId,
        status: ExposureReservationStatus.ACTIVE,
      },
      _sum: {
        reservedNotional: true,
      },
    });

    return result._sum.reservedNotional ?? zeroPrismaDecimal();
  }

  async create(
    input: CreateReservationInput,
    client: PrismaDbClient = this.prisma,
  ): Promise<void> {
    await client.exposureReservation.create({
      data: {
        ...input,
        status: ExposureReservationStatus.ACTIVE,
      },
    });
  }
}
