import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { PrismaDbClient } from '../../prisma/prisma-db-client';
import { PortfolioRiskConfig } from '../types/risk-types';

@Injectable()
export class RiskConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async instrumentExists(
    instrumentId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<boolean> {
    const instrument = await client.instrument.findUnique({
      where: { id: instrumentId },
      select: { id: true },
    });

    return instrument !== null;
  }

  async findConfigsByInstrumentId(
    instrumentId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<PortfolioRiskConfig[]> {
    const configs = await client.portfolioInstrumentConfig.findMany({
      where: {
        instrumentId,
        portfolio: {
          isActive: true,
        },
      },
      include: {
        portfolio: {
          select: {
            exposureCapNotional: true,
          },
        },
      },
      orderBy: {
        portfolioId: 'asc',
      },
    });

    return configs.map((config) => ({
      portfolioId: config.portfolioId,
      instrumentId: config.instrumentId,
      enabled: config.enabled,
      targetNotional: config.targetNotional,
      maxTradeNotional: config.maxTradeNotional,
      maxPositionNotional: config.maxPositionNotional,
      portfolioExposureCapNotional: config.portfolio.exposureCapNotional,
    }));
  }

  async findConfig(
    portfolioId: string,
    instrumentId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<PortfolioRiskConfig | null> {
    const config = await client.portfolioInstrumentConfig.findUnique({
      where: {
        portfolioId_instrumentId: {
          portfolioId,
          instrumentId,
        },
      },
      include: {
        portfolio: {
          select: {
            exposureCapNotional: true,
            isActive: true,
          },
        },
      },
    });

    if (!config || !config.portfolio.isActive) {
      return null;
    }

    return {
      portfolioId: config.portfolioId,
      instrumentId: config.instrumentId,
      enabled: config.enabled,
      targetNotional: config.targetNotional,
      maxTradeNotional: config.maxTradeNotional,
      maxPositionNotional: config.maxPositionNotional,
      portfolioExposureCapNotional: config.portfolio.exposureCapNotional,
    };
  }
}
