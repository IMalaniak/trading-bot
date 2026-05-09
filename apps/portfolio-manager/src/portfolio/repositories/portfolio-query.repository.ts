import { Injectable } from '@nestjs/common';

import {
  InstrumentModel,
  PortfolioInstrumentConfigModel,
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

export interface PortfolioInstrumentConfigReadModel extends PortfolioInstrumentConfigModel {
  instrument: InstrumentModel;
}

export interface PortfolioSummaryReadModel {
  portfolio: PortfolioModel;
  aggregateExposureNotional: PrismaDecimal;
  openPositionCount: number;
  updatedAt: Date;
}

export interface PortfolioReadModel extends PortfolioSummaryReadModel {
  positions: PortfolioPositionReadModel[];
  configuredInstruments: PortfolioInstrumentConfigReadModel[];
}

const maxDate = (dates: Date[]): Date =>
  dates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );

@Injectable()
export class PortfolioQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPortfolioSummaries(): Promise<PortfolioSummaryReadModel[]> {
    const portfolios = await this.prisma.portfolio.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });

    if (portfolios.length === 0) {
      return [];
    }

    const portfolioIds = portfolios.map((p) => p.id);

    const [
      exposureAggregates,
      openPositionGroups,
      snapshotMaxDates,
      configMaxDates,
    ] = await Promise.all([
      this.prisma.portfolioPosition.groupBy({
        by: ['portfolioId'],
        where: { portfolioId: { in: portfolioIds } },
        _sum: { exposureNotional: true },
        _max: { updatedAt: true },
      }),
      this.prisma.portfolioPosition.groupBy({
        by: ['portfolioId'],
        where: {
          portfolioId: { in: portfolioIds },
          quantity: { not: zeroPrismaDecimal() },
        },
        _count: { portfolioId: true },
      }),
      this.prisma.portfolioSummarySnapshot.groupBy({
        by: ['portfolioId'],
        where: { portfolioId: { in: portfolioIds } },
        _max: { updatedAt: true },
      }),
      this.prisma.portfolioInstrumentConfig.groupBy({
        by: ['portfolioId'],
        where: { portfolioId: { in: portfolioIds } },
        _max: { updatedAt: true },
      }),
    ]);

    const exposureMap = new Map(
      exposureAggregates.map((agg) => [agg.portfolioId, agg]),
    );
    const countMap = new Map(
      openPositionGroups.map((g) => [g.portfolioId, g._count.portfolioId]),
    );
    const snapshotMap = new Map(
      snapshotMaxDates.map((s) => [s.portfolioId, s._max.updatedAt]),
    );
    const configMap = new Map(
      configMaxDates.map((c) => [c.portfolioId, c._max.updatedAt]),
    );

    return portfolios.map((portfolio) => {
      const agg = exposureMap.get(portfolio.id);
      const latestPositionDate = agg?._max.updatedAt;
      const latestSnapshotDate = snapshotMap.get(portfolio.id);
      const latestConfigDate = configMap.get(portfolio.id);

      return {
        portfolio,
        aggregateExposureNotional: agg?._sum.exposureNotional
          ? toPrismaDecimal(agg._sum.exposureNotional)
          : zeroPrismaDecimal(),
        openPositionCount: countMap.get(portfolio.id) ?? 0,
        updatedAt: maxDate([
          portfolio.updatedAt,
          ...(latestSnapshotDate ? [latestSnapshotDate] : []),
          ...(latestPositionDate ? [latestPositionDate] : []),
          ...(latestConfigDate ? [latestConfigDate] : []),
        ]),
      };
    });
  }

  async findPortfolio(portfolioId: string): Promise<PortfolioReadModel | null> {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
    });

    if (!portfolio) {
      return null;
    }

    const [summary, positions, configuredInstruments] = await Promise.all([
      this.buildPortfolioSummary(portfolio),
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
      this.prisma.portfolioInstrumentConfig.findMany({
        where: { portfolioId },
        include: {
          instrument: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { instrumentId: 'asc' }],
      }),
    ]);

    return {
      ...summary,
      positions,
      configuredInstruments,
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

  private async buildPortfolioSummary(
    portfolio: PortfolioModel,
  ): Promise<PortfolioSummaryReadModel> {
    const portfolioId = portfolio.id;
    const [
      exposureAggregate,
      openPositionCount,
      latestSnapshot,
      latestPosition,
      latestConfiguredInstrument,
    ] = await Promise.all([
      this.prisma.portfolioPosition.aggregate({
        where: { portfolioId },
        _sum: { exposureNotional: true },
      }),
      this.prisma.portfolioPosition.count({
        where: {
          portfolioId,
          quantity: {
            not: zeroPrismaDecimal(),
          },
        },
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
      this.prisma.portfolioInstrumentConfig.findFirst({
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
      openPositionCount,
      updatedAt: maxDate([
        portfolio.updatedAt,
        ...(latestSnapshot ? [latestSnapshot.updatedAt] : []),
        ...(latestPosition ? [latestPosition.updatedAt] : []),
        ...(latestConfiguredInstrument
          ? [latestConfiguredInstrument.updatedAt]
          : []),
      ]),
    };
  }
}
