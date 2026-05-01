import { Injectable } from '@nestjs/common';

import { SignalReceiptStatus } from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaDbClient } from '../../prisma/prisma-db-client';
import { SignalReceiptRecord } from '../types/risk-types';

interface CreateSignalReceiptInput {
  sourceEventId: string;
  signalId: string;
  instrumentId: string;
  kafkaKey: string;
  receivedAt: Date;
  status: SignalReceiptStatus;
  eligiblePortfolioCount: number;
}

@Injectable()
export class SignalReceiptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySourceEventId(
    sourceEventId: string,
    client: PrismaDbClient = this.prisma,
  ): Promise<SignalReceiptRecord | null> {
    const receipt = await client.signalReceipt.findUnique({
      where: { sourceEventId },
      select: {
        id: true,
        sourceEventId: true,
        status: true,
        eligiblePortfolioCount: true,
      },
    });

    return receipt;
  }

  async create(
    input: CreateSignalReceiptInput,
    client: PrismaDbClient = this.prisma,
  ): Promise<SignalReceiptRecord> {
    const receipt = await client.signalReceipt.create({
      data: input,
      select: {
        id: true,
        sourceEventId: true,
        status: true,
        eligiblePortfolioCount: true,
      },
    });

    return receipt;
  }
}
