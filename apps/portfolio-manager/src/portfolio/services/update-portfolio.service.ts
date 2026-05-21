import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AppResponseCode, GrpcStatusCode } from '@trading-bot/common';
import type {
  UpdatePortfolioRequest,
  UpdatePortfolioResponse,
} from '@trading-bot/common/proto';

import { RiskConfigAuditEntityType } from '../../prisma/generated/enums';
import type { PortfolioModel } from '../../prisma/generated/models';
import {
  prismaDecimalToString,
  toPrismaDecimal,
} from '../../prisma/prisma-decimal';
import {
  CreateAuditEntryInput,
  PortfolioWriteRepository,
  UpdatePortfolioData,
} from '../repositories/portfolio-write.repository';

@Injectable()
export class UpdatePortfolioService {
  constructor(private readonly repository: PortfolioWriteRepository) {}

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
      return { summary: this.mapSummary(existing) };
    }

    const updated = await this.repository.updatePortfolio(
      request.portfolioId,
      updateData,
      auditEntries,
    );

    return { summary: this.mapSummary(updated) };
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
}
