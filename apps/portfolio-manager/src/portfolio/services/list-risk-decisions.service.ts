import { Injectable } from '@nestjs/common';
import type {
  ListRiskDecisionsRequest,
  ListRiskDecisionsResponse,
} from '@trading-bot/common/proto';

import { prismaDecimalToString } from '../../prisma/prisma-decimal';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';

@Injectable()
export class ListRiskDecisionsService {
  constructor(private readonly repository: PortfolioWriteRepository) {}

  async listDecisions(
    request: ListRiskDecisionsRequest,
  ): Promise<ListRiskDecisionsResponse> {
    const page = await this.repository.listRiskDecisions(
      request.portfolioId,
      request.decisionFilter,
      request.limit,
      request.cursor,
    );

    return {
      decisions: page.decisions.map((d) => ({
        id: d.id,
        portfolioId: d.portfolioId,
        instrumentId: d.instrumentId,
        decision: d.decision,
        reasonCodes: d.reasonCodes,
        requestedNotional: prismaDecimalToString(d.requestedNotional),
        referencePrice: prismaDecimalToString(d.referencePrice),
        decidedAt: d.decidedAt.toISOString(),
        sourceEventId: d.sourceEventId,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
