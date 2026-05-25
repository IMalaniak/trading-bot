import { Injectable } from '@nestjs/common';

import {
  RiskConfigAuditEntityType,
  RiskDecisionStatus,
} from '../../prisma/generated/enums';
import {
  InstrumentModel,
  PortfolioInstrumentConfigModel,
  PortfolioModel,
  RiskConfigAuditLogModel,
  RiskDecisionModel,
  StrategyModel,
} from '../../prisma/generated/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaDecimal } from '../../prisma/prisma-decimal';

export interface PortfolioInstrumentConfigWithInstrument extends PortfolioInstrumentConfigModel {
  instrument: InstrumentModel;
}

export interface CreateAuditEntryInput {
  entityType: RiskConfigAuditEntityType;
  portfolioId: string;
  portfolioInstrumentConfigId?: string;
  field: string;
  oldValue?: string;
  newValue?: string;
}

export interface UpdateInstrumentConfigData {
  enabled?: boolean;
  targetNotional?: PrismaDecimal;
  maxTradeNotional?: PrismaDecimal;
  maxPositionNotional?: PrismaDecimal;
  maxOpenTrades?: number;
  maxDailyTurnoverNotional?: PrismaDecimal;
  cooldownSeconds?: number;
  maxConsecutiveRejections?: number;
}

export interface UpdatePortfolioData {
  exposureCapNotional?: PrismaDecimal;
  isActive?: boolean;
}

export interface RiskDecisionPage {
  decisions: RiskDecisionModel[];
  nextCursor?: string;
}

export interface RiskConfigAuditLogPage {
  entries: RiskConfigAuditLogModel[];
  nextCursor?: string;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

@Injectable()
export class PortfolioWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findInstrumentConfigWithInstrument(
    portfolioId: string,
    instrumentId: string,
  ): Promise<PortfolioInstrumentConfigWithInstrument | null> {
    return this.prisma.portfolioInstrumentConfig.findFirst({
      where: { portfolioId, instrumentId },
      include: { instrument: true },
    });
  }

  async updateInstrumentConfig(
    configId: string,
    data: UpdateInstrumentConfigData,
    auditEntries: CreateAuditEntryInput[],
  ): Promise<PortfolioInstrumentConfigWithInstrument> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.portfolioInstrumentConfig.update({
        where: { id: configId },
        data,
        include: { instrument: true },
      });

      if (auditEntries.length > 0) {
        await tx.riskConfigAuditLog.createMany({
          data: auditEntries.map((entry) => ({
            ...entry,
            changedAt: new Date(),
          })),
        });
      }

      return updated;
    });
  }

  async findPortfolioById(portfolioId: string): Promise<PortfolioModel | null> {
    return this.prisma.portfolio.findUnique({ where: { id: portfolioId } });
  }

  async updatePortfolio(
    portfolioId: string,
    data: UpdatePortfolioData,
    auditEntries: CreateAuditEntryInput[],
  ): Promise<PortfolioModel> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.portfolio.update({
        where: { id: portfolioId },
        data,
      });

      if (auditEntries.length > 0) {
        await tx.riskConfigAuditLog.createMany({
          data: auditEntries.map((entry) => ({
            ...entry,
            changedAt: new Date(),
          })),
        });
      }

      return updated;
    });
  }

  async listRiskDecisions(
    portfolioId: string,
    decisionFilter?: string,
    limit: number = DEFAULT_PAGE_SIZE,
    cursor?: string,
  ): Promise<RiskDecisionPage> {
    const pageSize = Math.min(
      limit > 0 ? limit : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    const decisions = await this.prisma.riskDecision.findMany({
      where: {
        portfolioId,
        ...(decisionFilter &&
        Object.values(RiskDecisionStatus).includes(
          decisionFilter as RiskDecisionStatus,
        )
          ? { decision: decisionFilter as RiskDecisionStatus }
          : {}),
        ...(cursor ? { decidedAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { decidedAt: 'desc' },
      take: pageSize + 1,
    });

    const hasMore = decisions.length > pageSize;
    const page = hasMore ? decisions.slice(0, pageSize) : decisions;
    const nextCursor = hasMore
      ? page[page.length - 1].decidedAt.toISOString()
      : undefined;

    return { decisions: page, nextCursor };
  }

  async listRiskConfigAuditLog(
    portfolioId: string,
    limit: number = DEFAULT_PAGE_SIZE,
    cursor?: string,
  ): Promise<RiskConfigAuditLogPage> {
    const pageSize = Math.min(
      limit > 0 ? limit : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    const entries = await this.prisma.riskConfigAuditLog.findMany({
      where: {
        portfolioId,
        ...(cursor ? { changedAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { changedAt: 'desc' },
      take: pageSize + 1,
    });

    const hasMore = entries.length > pageSize;
    const page = hasMore ? entries.slice(0, pageSize) : entries;
    const nextCursor = hasMore
      ? page[page.length - 1].changedAt.toISOString()
      : undefined;

    return { entries: page, nextCursor };
  }

  async createStrategy(data: {
    name: string;
    description?: string;
    allowedSides: number[];
    minIntervalSecs?: number;
    activeTimeStart?: string;
    activeTimeEnd?: string;
  }): Promise<StrategyModel> {
    return this.prisma.strategy.create({ data });
  }

  async findStrategyById(id: string): Promise<StrategyModel | null> {
    return this.prisma.strategy.findUnique({ where: { id } });
  }

  async findStrategyByName(name: string): Promise<StrategyModel | null> {
    return this.prisma.strategy.findUnique({ where: { name } });
  }

  async updateStrategy(
    id: string,
    data: {
      name?: string;
      description?: string;
      allowedSides?: number[];
      minIntervalSecs?: number | null;
      activeTimeStart?: string | null;
      activeTimeEnd?: string | null;
    },
  ): Promise<StrategyModel> {
    return this.prisma.strategy.update({ where: { id }, data });
  }

  async listStrategies(): Promise<StrategyModel[]> {
    return this.prisma.strategy.findMany({ orderBy: { name: 'asc' } });
  }

  async assignStrategyToPortfolio(
    portfolioId: string,
    strategyId?: string,
  ): Promise<PortfolioModel> {
    return this.prisma.portfolio.update({
      where: { id: portfolioId },
      data: { strategyId: strategyId ?? null },
    });
  }
}
