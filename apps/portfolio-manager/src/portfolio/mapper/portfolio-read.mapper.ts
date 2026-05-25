import { Injectable } from '@nestjs/common';
import {
  GetPortfolioResponse,
  ListInstrumentsResponse,
  ListPortfoliosResponse,
  PortfolioInstrumentConfig,
  PortfolioSummary,
  Strategy,
} from '@trading-bot/common/proto';

import { InstrumentModel } from '../../prisma/generated/models';
import { StrategyModel } from '../../prisma/generated/models';
import { prismaDecimalToString } from '../../prisma/prisma-decimal';
import {
  PortfolioInstrumentConfigReadModel,
  PortfolioReadModel,
  PortfolioSummaryReadModel,
} from '../repositories/portfolio-query.repository';
import { InstrumentMapper } from './instrument.mapper';

@Injectable()
export class PortfolioReadMapper {
  constructor(private readonly instrumentMapper: InstrumentMapper) {}

  mapPortfolio(state: PortfolioReadModel): GetPortfolioResponse {
    return {
      summary: this.mapPortfolioSummary(state),
      positions: state.positions.map((position) => ({
        portfolioId: position.portfolioId,
        instrument: this.instrumentMapper.map(position.instrument),
        quantity: prismaDecimalToString(position.quantity),
        averageEntryPrice: prismaDecimalToString(position.averageEntryPrice),
        exposureNotional: prismaDecimalToString(position.exposureNotional),
        lastFillId: position.lastFillId ?? '',
        updatedAt: position.updatedAt.toISOString(),
      })),
      configuredInstruments: state.configuredInstruments.map((config) =>
        this.mapConfiguredInstrument(config),
      ),
      strategy: state.strategy ? this.mapStrategy(state.strategy) : undefined,
    };
  }

  mapPortfolioSummaries(
    summaries: readonly PortfolioSummaryReadModel[],
  ): ListPortfoliosResponse {
    return {
      portfolios: summaries.map((summary) => this.mapPortfolioSummary(summary)),
    };
  }

  mapConfiguredInstrument(
    config: PortfolioInstrumentConfigReadModel,
  ): PortfolioInstrumentConfig {
    return {
      portfolioId: config.portfolioId,
      instrument: this.instrumentMapper.map(config.instrument),
      enabled: config.enabled,
      targetNotional: prismaDecimalToString(config.targetNotional),
      maxTradeNotional: prismaDecimalToString(config.maxTradeNotional),
      maxPositionNotional: prismaDecimalToString(config.maxPositionNotional),
      updatedAt: config.updatedAt.toISOString(),
      ...(config.maxOpenTrades != null && {
        maxOpenTrades: config.maxOpenTrades,
      }),
      ...(config.maxDailyTurnoverNotional != null && {
        maxDailyTurnoverNotional: prismaDecimalToString(
          config.maxDailyTurnoverNotional,
        ),
      }),
      ...(config.cooldownSeconds != null && {
        cooldownSeconds: config.cooldownSeconds,
      }),
      ...(config.maxConsecutiveRejections != null && {
        maxConsecutiveRejections: config.maxConsecutiveRejections,
      }),
    };
  }

  mapInstruments(
    instruments: readonly InstrumentModel[],
  ): ListInstrumentsResponse {
    return {
      instruments: instruments.map((instrument) =>
        this.instrumentMapper.map(instrument),
      ),
    };
  }

  mapStrategy(strategy: StrategyModel): Strategy {
    return {
      id: strategy.id,
      name: strategy.name,
      ...(strategy.description != null && {
        description: strategy.description,
      }),
      allowedSides: strategy.allowedSides,
      ...(strategy.minIntervalSecs != null && {
        minIntervalSecs: strategy.minIntervalSecs,
      }),
      ...(strategy.activeTimeStart != null && {
        activeTimeStart: strategy.activeTimeStart,
      }),
      ...(strategy.activeTimeEnd != null && {
        activeTimeEnd: strategy.activeTimeEnd,
      }),
      createdAt: strategy.createdAt.toISOString(),
      updatedAt: strategy.updatedAt.toISOString(),
    };
  }

  private mapPortfolioSummary(
    state: PortfolioSummaryReadModel,
  ): PortfolioSummary {
    return {
      portfolioId: state.portfolio.id,
      name: state.portfolio.name,
      isActive: state.portfolio.isActive,
      exposureCapNotional: prismaDecimalToString(
        state.portfolio.exposureCapNotional,
      ),
      aggregateExposureNotional: prismaDecimalToString(
        state.aggregateExposureNotional,
      ),
      openPositionCount: state.openPositionCount,
      updatedAt: state.updatedAt.toISOString(),
    };
  }
}
