import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AppResponseCode, GrpcStatusCode } from '@trading-bot/common';
import type {
  AssignStrategyToPortfolioRequest,
  AssignStrategyToPortfolioResponse,
} from '@trading-bot/common/proto';

import type {
  PortfolioModel,
  StrategyModel,
} from '../../prisma/generated/models';
import { prismaDecimalToString } from '../../prisma/prisma-decimal';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';

@Injectable()
export class AssignStrategyToPortfolioService {
  constructor(private readonly repository: PortfolioWriteRepository) {}

  async assignStrategyToPortfolio(
    request: AssignStrategyToPortfolioRequest,
  ): Promise<AssignStrategyToPortfolioResponse> {
    const portfolio = await this.repository.findPortfolioById(
      request.portfolioId,
    );

    if (!portfolio) {
      throw new RpcException({
        message: `Portfolio '${request.portfolioId}' was not found`,
        code: GrpcStatusCode.NOT_FOUND,
        appCode: AppResponseCode.PORTFOLIO_NOT_FOUND,
      });
    }

    let strategyModel: StrategyModel | undefined;

    if (request.strategyId) {
      const found = await this.repository.findStrategyById(request.strategyId);

      if (!found) {
        throw new RpcException({
          message: `Strategy '${request.strategyId}' was not found`,
          code: GrpcStatusCode.NOT_FOUND,
          appCode: AppResponseCode.STRATEGY_NOT_FOUND,
        });
      }

      strategyModel = found;
    }

    const updated = await this.repository.assignStrategyToPortfolio(
      request.portfolioId,
      request.strategyId,
    );

    return {
      summary: this.mapSummary(updated),
      strategy: strategyModel ? this.mapStrategy(strategyModel) : undefined,
    };
  }

  private mapSummary(portfolio: PortfolioModel) {
    return {
      portfolioId: portfolio.id,
      name: portfolio.name,
      isActive: portfolio.isActive,
      exposureCapNotional: prismaDecimalToString(portfolio.exposureCapNotional),
      aggregateExposureNotional: '0',
      openPositionCount: 0,
      updatedAt: portfolio.updatedAt.toISOString(),
    };
  }

  private mapStrategy(strategy: StrategyModel) {
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
}
