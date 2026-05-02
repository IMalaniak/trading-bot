import { Injectable } from '@nestjs/common';
import { type KafkaTopic } from '@trading-bot/common';

import {
  RiskDecisionReasonCode,
  RiskDecisionStatus,
} from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaDbClient } from '../../prisma/prisma-db-client';
import { PrismaDecimal, toPrismaDecimal } from '../../prisma/prisma-decimal';

export interface RiskDecisionRecord {
  id: string;
  candidateIdempotencyKey: string;
  sourceEventId: string;
  portfolioId: string;
  instrumentId: string;
  decision: RiskDecisionStatus;
  reasonCodes: RiskDecisionReasonCode[];
  requestedNotional: PrismaDecimal;
  requestedQuantity: PrismaDecimal;
  referencePrice: PrismaDecimal;
  emittedTopic: KafkaTopic;
  decidedAt: Date;
}

interface CreateRiskDecisionInput {
  candidateRecordId: string;
  candidateIdempotencyKey: string;
  sourceEventId: string;
  portfolioId: string;
  instrumentId: string;
  decision: RiskDecisionStatus;
  reasonCodes: RiskDecisionReasonCode[];
  requestedNotional: PrismaDecimal;
  requestedQuantity: PrismaDecimal;
  referencePrice: PrismaDecimal;
  emittedTopic: KafkaTopic;
  decidedAt: Date;
}

const mapRiskDecisionRecord = (
  decision: Awaited<ReturnType<PrismaService['riskDecision']['findUnique']>>,
): RiskDecisionRecord | null => {
  if (!decision) {
    return null;
  }

  return {
    id: decision.id,
    candidateIdempotencyKey: decision.candidateIdempotencyKey,
    sourceEventId: decision.sourceEventId,
    portfolioId: decision.portfolioId,
    instrumentId: decision.instrumentId,
    decision: decision.decision,
    reasonCodes: decision.reasonCodes,
    requestedNotional: toPrismaDecimal(decision.requestedNotional),
    requestedQuantity: toPrismaDecimal(decision.requestedQuantity),
    referencePrice: toPrismaDecimal(decision.referencePrice),
    emittedTopic: decision.emittedTopic as KafkaTopic,
    decidedAt: decision.decidedAt,
  };
};

@Injectable()
export class DecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCandidateIdempotencyKey(
    candidateIdempotencyKey: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<RiskDecisionRecord | null> {
    const decision = await client.riskDecision.findUnique({
      where: { candidateIdempotencyKey },
    });

    return mapRiskDecisionRecord(decision);
  }

  async create(
    input: CreateRiskDecisionInput,
    client: PrismaDbClient = this.prisma,
  ): Promise<RiskDecisionRecord> {
    const decision = await client.riskDecision.create({
      data: input,
    });

    const decisionRecord = mapRiskDecisionRecord(decision);

    if (!decisionRecord) {
      throw new Error('Expected risk decision record to be created');
    }

    return decisionRecord;
  }
}
