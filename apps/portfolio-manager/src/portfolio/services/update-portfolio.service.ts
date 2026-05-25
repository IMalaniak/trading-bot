import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AppResponseCode, GrpcStatusCode } from '@trading-bot/common';
import type {
  UpdatePortfolioRequest,
  UpdatePortfolioResponse,
} from '@trading-bot/common/proto';

import { RiskConfigAuditEntityType } from '../../prisma/generated/enums';
import {
  prismaDecimalToString,
  toPrismaDecimal,
} from '../../prisma/prisma-decimal';
import {
  PortfolioQueryRepository,
  PortfolioSummaryReadModel,
} from '../repositories/portfolio-query.repository';
import {
  CreateAuditEntryInput,
  PortfolioWriteRepository,
  UpdatePortfolioData,
} from '../repositories/portfolio-write.repository';

@Injectable()
export class UpdatePortfolioService {
  constructor(
    private readonly repository: PortfolioWriteRepository,
    private readonly queryRepository: PortfolioQueryRepository,
  ) {}

  async updatePortfolio(
    request: UpdatePortfolioRequest,
  ): Promise<UpdatePortfolioResponse> {
    const existing = await this.repository.findPortfolioById(
      request.portfolioId,
    );

    if (!existing) {
      throw new RpcException({
        message: `Portfolio '${request.portfolioId}' was not found`,
        code: GrpcStatusCode.NOT_FOUND,
        appCode: AppResponseCode.PORTFOLIO_NOT_FOUND,
      });
    }

    const updateData: UpdatePortfolioData = {};
    const auditEntries: CreateAuditEntryInput[] = [];

    const addAudit = (field: string, oldValue: string, newValue: string) => {
      auditEntries.push({
        entityType: RiskConfigAuditEntityType.PORTFOLIO,
        portfolioId: request.portfolioId,
        field,
        oldValue,
        newValue,
      });
    };

    if (request.exposureCapNotional !== undefined) {
      const oldStr = prismaDecimalToString(existing.exposureCapNotional);
      if (request.exposureCapNotional !== oldStr) {
        updateData.exposureCapNotional = toPrismaDecimal(
          request.exposureCapNotional,
        );
        addAudit('exposureCapNotional', oldStr, request.exposureCapNotional);
      }
    }

    if (
      request.isActive !== undefined &&
      request.isActive !== existing.isActive
    ) {
      updateData.isActive = request.isActive;
      addAudit('isActive', String(existing.isActive), String(request.isActive));
    }

    if (Object.keys(updateData).length === 0) {
      return {
        summary: await this.fetchSummary(existing.id),
      };
    }

    await this.repository.updatePortfolio(
      request.portfolioId,
      updateData,
      auditEntries,
    );

    return { summary: await this.fetchSummary(request.portfolioId) };
  }

  private async fetchSummary(portfolioId: string) {
    const state =
      await this.queryRepository.findPortfolioSummaryById(portfolioId);
    if (!state) return undefined;
    return this.mapSummary(state);
  }

  private mapSummary(state: PortfolioSummaryReadModel) {
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
