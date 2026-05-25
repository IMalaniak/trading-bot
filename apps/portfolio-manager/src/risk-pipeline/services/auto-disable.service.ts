import { Injectable } from '@nestjs/common';

import { RiskConfigAuditEntityType } from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { DecisionRepository } from '../repositories/decision.repository';

@Injectable()
export class AutoDisableService {
  constructor(
    private readonly decisionRepository: DecisionRepository,
    private readonly prisma: PrismaService,
  ) {}

  async handleRejection(
    portfolioId: string,
    instrumentId: string,
    maxConsecutiveRejections: number | null,
  ): Promise<void> {
    if (maxConsecutiveRejections === null) {
      return;
    }

    const consecutiveCount =
      await this.decisionRepository.countConsecutiveRejections(
        portfolioId,
        instrumentId,
      );

    if (consecutiveCount < maxConsecutiveRejections) {
      return;
    }

    const config = await this.prisma.portfolioInstrumentConfig.findUnique({
      where: {
        portfolioId_instrumentId: { portfolioId, instrumentId },
      },
      select: { id: true, enabled: true },
    });

    if (!config || !config.enabled) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.portfolioInstrumentConfig.update({
        where: { id: config.id },
        data: { enabled: false },
      });

      await tx.riskConfigAuditLog.create({
        data: {
          entityType: RiskConfigAuditEntityType.INSTRUMENT_CONFIG,
          portfolioId,
          portfolioInstrumentConfigId: config.id,
          field: 'enabled',
          oldValue: 'true',
          newValue: 'false',
          changedAt: new Date(),
        },
      });
    });
  }
}
