import { Injectable } from '@nestjs/common';

import {
  InstrumentModel,
  PortfolioModel,
  PortfolioPositionModel,
} from '../../prisma/generated/models';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PrismaDecimal,
  toPrismaDecimal,
  zeroPrismaDecimal,
} from '../../prisma/prisma-decimal';

export interface PortfolioPositionReadModel extends PortfolioPositionModel {
  instrument: InstrumentModel;
}

export interface PortfolioReadModel {
  portfolio: PortfolioModel;
  aggregateExposureNotional: PrismaDecimal;
  openPositionCount: number;
  updatedAt: Date;
  positions: PortfolioPositionReadModel[];
}

const maxDate = (dates: Date[]): Date =>
  dates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );

@Injectable()
export class PortfolioQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPortfolio(portfolioId: string): Promise<PortfolioReadModel | null> {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
    });

    if (!portfolio) {
      return null;
    }

    const [positions, exposureAggregate, latestSnapshot, latestPosition] =
      await Promise.all([
        this.prisma.portfolioPosition.findMany({
          where: {
            portfolioId,
            quantity: {
              not: zeroPrismaDecimal(),
            },
          },
          include: {
            instrument: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { instrumentId: 'asc' }],
        }),
        this.prisma.portfolioPosition.aggregate({
          where: { portfolioId },
          _sum: { exposureNotional: true },
        }),
        this.prisma.portfolioSummarySnapshot.findFirst({
          where: { portfolioId },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        this.prisma.portfolioPosition.findFirst({
          where: { portfolioId },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
      ]);

    return {
      portfolio,
      aggregateExposureNotional: exposureAggregate._sum.exposureNotional
        ? toPrismaDecimal(exposureAggregate._sum.exposureNotional)
        : zeroPrismaDecimal(),
      openPositionCount: positions.length,
      updatedAt: maxDate([
        portfolio.updatedAt,
        ...(latestSnapshot ? [latestSnapshot.updatedAt] : []),
        ...(latestPosition ? [latestPosition.updatedAt] : []),
      ]),
      positions,
    };
  }

  async listInstruments(
    instrumentIds: readonly string[],
  ): Promise<InstrumentModel[]> {
    const uniqueInstrumentIds = [...new Set(instrumentIds.filter(Boolean))];

    if (uniqueInstrumentIds.length === 0) {
      return [];
    }

    return await this.prisma.instrument.findMany({
      where: {
        id: {
          in: uniqueInstrumentIds,
        },
      },
      orderBy: [{ symbol: 'asc' }, { venue: 'asc' }, { id: 'asc' }],
    });
  }
}
