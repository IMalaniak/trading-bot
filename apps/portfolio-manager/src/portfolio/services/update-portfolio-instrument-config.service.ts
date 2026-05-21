import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AppResponseCode, GrpcStatusCode } from '@trading-bot/common';
import type {
  UpdatePortfolioInstrumentConfigRequest,
  UpdatePortfolioInstrumentConfigResponse,
} from '@trading-bot/common/proto';

import { RiskConfigAuditEntityType } from '../../prisma/generated/enums';
import {
  prismaDecimalToString,
  toPrismaDecimal,
} from '../../prisma/prisma-decimal';
import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import {
  CreateAuditEntryInput,
  PortfolioWriteRepository,
  UpdateInstrumentConfigData,
} from '../repositories/portfolio-write.repository';

@Injectable()
export class UpdatePortfolioInstrumentConfigService {
  constructor(
    private readonly repository: PortfolioWriteRepository,
    private readonly mapper: PortfolioReadMapper,
  ) {}

  async updateConfig(
    request: UpdatePortfolioInstrumentConfigRequest,
  ): Promise<UpdatePortfolioInstrumentConfigResponse> {
    const existing = await this.repository.findInstrumentConfigWithInstrument(
      request.portfolioId,
      request.instrumentId,
    );

    if (!existing) {
      throw new RpcException({
        message: `Instrument config for portfolio '${request.portfolioId}' instrument '${request.instrumentId}' was not found`,
        code: GrpcStatusCode.NOT_FOUND,
        appCode: AppResponseCode.INSTRUMENT_CONFIG_NOT_FOUND,
      });
    }

    const updateData: UpdateInstrumentConfigData = {};
    const auditEntries: CreateAuditEntryInput[] = [];

    const addAudit = (
      field: string,
      oldValue: string | undefined,
      newValue: string,
    ) => {
      auditEntries.push({
        entityType: RiskConfigAuditEntityType.INSTRUMENT_CONFIG,
        portfolioId: request.portfolioId,
        portfolioInstrumentConfigId: existing.id,
        field,
        oldValue,
        newValue,
      });
    };

    if (request.enabled !== undefined && request.enabled !== existing.enabled) {
      updateData.enabled = request.enabled;
      addAudit('enabled', String(existing.enabled), String(request.enabled));
    }

    if (request.targetNotional !== undefined) {
      const oldStr = prismaDecimalToString(existing.targetNotional);
      if (request.targetNotional !== oldStr) {
        updateData.targetNotional = toPrismaDecimal(request.targetNotional);
        addAudit('targetNotional', oldStr, request.targetNotional);
      }
    }

    if (request.maxTradeNotional !== undefined) {
      const oldStr = prismaDecimalToString(existing.maxTradeNotional);
      if (request.maxTradeNotional !== oldStr) {
        updateData.maxTradeNotional = toPrismaDecimal(request.maxTradeNotional);
        addAudit('maxTradeNotional', oldStr, request.maxTradeNotional);
      }
    }

    if (request.maxPositionNotional !== undefined) {
      const oldStr = prismaDecimalToString(existing.maxPositionNotional);
      if (request.maxPositionNotional !== oldStr) {
        updateData.maxPositionNotional = toPrismaDecimal(
          request.maxPositionNotional,
        );
        addAudit('maxPositionNotional', oldStr, request.maxPositionNotional);
      }
    }

    if (request.maxOpenTrades !== undefined) {
      const oldVal = existing.maxOpenTrades;
      if (request.maxOpenTrades !== (oldVal ?? undefined)) {
        updateData.maxOpenTrades = request.maxOpenTrades;
        addAudit(
          'maxOpenTrades',
          oldVal != null ? String(oldVal) : undefined,
          String(request.maxOpenTrades),
        );
      }
    }

    if (request.maxDailyTurnoverNotional !== undefined) {
      const oldStr =
        existing.maxDailyTurnoverNotional != null
          ? prismaDecimalToString(existing.maxDailyTurnoverNotional)
          : undefined;
      if (request.maxDailyTurnoverNotional !== (oldStr ?? undefined)) {
        updateData.maxDailyTurnoverNotional = toPrismaDecimal(
          request.maxDailyTurnoverNotional,
        );
        addAudit(
          'maxDailyTurnoverNotional',
          oldStr,
          request.maxDailyTurnoverNotional,
        );
      }
    }

    if (request.cooldownSeconds !== undefined) {
      const oldVal = existing.cooldownSeconds;
      if (request.cooldownSeconds !== (oldVal ?? undefined)) {
        updateData.cooldownSeconds = request.cooldownSeconds;
        addAudit(
          'cooldownSeconds',
          oldVal != null ? String(oldVal) : undefined,
          String(request.cooldownSeconds),
        );
      }
    }

    if (request.maxConsecutiveRejections !== undefined) {
      const oldVal = existing.maxConsecutiveRejections;
      if (request.maxConsecutiveRejections !== (oldVal ?? undefined)) {
        updateData.maxConsecutiveRejections = request.maxConsecutiveRejections;
        addAudit(
          'maxConsecutiveRejections',
          oldVal != null ? String(oldVal) : undefined,
          String(request.maxConsecutiveRejections),
        );
      }
    }

    if (Object.keys(updateData).length === 0) {
      return {
        configuredInstrument: this.mapper.mapConfiguredInstrument(existing),
      };
    }

    const updated = await this.repository.updateInstrumentConfig(
      existing.id,
      updateData,
      auditEntries,
    );

    return {
      configuredInstrument: this.mapper.mapConfiguredInstrument(updated),
    };
  }
}
