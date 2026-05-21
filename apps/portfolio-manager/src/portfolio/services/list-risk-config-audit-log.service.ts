import { Injectable } from '@nestjs/common';
import type {
  ListRiskConfigAuditLogRequest,
  ListRiskConfigAuditLogResponse,
} from '@trading-bot/common/proto';

import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';

@Injectable()
export class ListRiskConfigAuditLogService {
  constructor(private readonly repository: PortfolioWriteRepository) {}

  async listAuditLog(
    request: ListRiskConfigAuditLogRequest,
  ): Promise<ListRiskConfigAuditLogResponse> {
    const page = await this.repository.listRiskConfigAuditLog(
      request.portfolioId,
      request.limit,
      request.cursor,
    );

    return {
      entries: page.entries.map((e) => ({
        id: e.id,
        entityType: e.entityType,
        portfolioId: e.portfolioId,
        ...(e.portfolioInstrumentConfigId != null && {
          portfolioInstrumentConfigId: e.portfolioInstrumentConfigId,
        }),
        field: e.field,
        ...(e.oldValue != null && { oldValue: e.oldValue }),
        ...(e.newValue != null && { newValue: e.newValue }),
        changedAt: e.changedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
