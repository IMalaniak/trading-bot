import { Injectable } from '@nestjs/common';
import { Signal } from '@trading-bot/common/proto';

import { PortfolioSignalCandidateStatus } from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaDbClient } from '../../prisma/prisma-db-client';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { CandidateRecord } from '../types/risk-types';

interface CreateCandidateInput {
  signalReceiptId: string;
  sourceEventId: string;
  portfolioId: string;
  targetNotionalSnapshot: CandidateRecord['targetNotionalSnapshot'];
  signal: Signal;
  receivedAt: Date;
}

@Injectable()
export class CandidateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateCandidateInput,
    client: PrismaDbClient = this.prisma,
  ): Promise<CandidateRecord> {
    const candidate = await client.portfolioSignalCandidateRecord.create({
      data: {
        candidateIdempotencyKey: `${input.sourceEventId}:${input.portfolioId}`,
        signalReceiptId: input.signalReceiptId,
        sourceEventId: input.sourceEventId,
        portfolioId: input.portfolioId,
        instrumentId: input.signal.instrumentId,
        signalId: input.signal.id,
        side: input.signal.side,
        referencePrice: input.signal.price.toString(),
        targetNotionalSnapshot: input.targetNotionalSnapshot,
        signalTimestamp: new Date(input.signal.timestamp),
        receivedAt: input.receivedAt,
        status: PortfolioSignalCandidateStatus.PENDING,
      },
      select: {
        id: true,
        candidateIdempotencyKey: true,
        sourceEventId: true,
        portfolioId: true,
        instrumentId: true,
        signalId: true,
        side: true,
        referencePrice: true,
        targetNotionalSnapshot: true,
        signalTimestamp: true,
        receivedAt: true,
      },
    });

    return {
      ...candidate,
      side: candidate.side,
      referencePrice: toPrismaDecimal(candidate.referencePrice),
      targetNotionalSnapshot: toPrismaDecimal(candidate.targetNotionalSnapshot),
    };
  }

  async findByIdempotencyKey(
    candidateIdempotencyKey: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<CandidateRecord | null> {
    const candidate = await client.portfolioSignalCandidateRecord.findUnique({
      where: {
        candidateIdempotencyKey,
      },
      select: {
        id: true,
        candidateIdempotencyKey: true,
        sourceEventId: true,
        portfolioId: true,
        instrumentId: true,
        signalId: true,
        side: true,
        referencePrice: true,
        targetNotionalSnapshot: true,
        signalTimestamp: true,
        receivedAt: true,
      },
    });

    if (!candidate) {
      return null;
    }

    return {
      ...candidate,
      side: candidate.side,
      referencePrice: toPrismaDecimal(candidate.referencePrice),
      targetNotionalSnapshot: toPrismaDecimal(candidate.targetNotionalSnapshot),
    };
  }

  async markDecided(
    candidateId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<void> {
    await client.portfolioSignalCandidateRecord.update({
      where: { id: candidateId },
      data: {
        status: PortfolioSignalCandidateStatus.DECIDED,
      },
    });
  }
}
