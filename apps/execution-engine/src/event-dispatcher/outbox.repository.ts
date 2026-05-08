import { Injectable } from '@nestjs/common';
import type {
  MarkOutboxFailedInput,
  OutboxClaimBatchInput,
  OutboxDispatcherRepository,
  OutboxDispatchRecord,
  OutboxMessageInput,
} from '@trading-bot/common';
import { KAFKA_EVENT_HEADER_NAMES } from '@trading-bot/common';
import { randomUUID } from 'crypto';

import { OutboxEventStatus, Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';

export interface OutboxBacklogMetricRow {
  topic: string;
  status: string;
  count: number;
}

export interface OutboxBacklogMetrics {
  rows: OutboxBacklogMetricRow[];
  oldestPendingAt: Date | null;
}

type ClaimedExecutionOutboxEvent = Omit<
  OutboxDispatchRecord,
  'dispatchOrder'
> & {
  lifecycleSequence: number;
};

@Injectable()
export class OutboxRepository implements OutboxDispatcherRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    tx: Prisma.TransactionClient,
    topic: string,
    lifecycleSequence: number,
    message: OutboxMessageInput,
  ): Promise<string> {
    const eventId =
      message.eventId ??
      message.headers?.[KAFKA_EVENT_HEADER_NAMES.EVENT_ID] ??
      randomUUID();
    const headers = {
      ...(message.headers ?? {}),
      [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: eventId,
    };

    await tx.outboxEvent.create({
      data: {
        id: eventId,
        topic,
        key: message.key,
        value: Buffer.from(message.value),
        headers,
        lifecycleSequence,
        status: OutboxEventStatus.PENDING,
      },
    });

    return eventId;
  }

  async claimBatch({
    batchSize,
    staleInFlightTimeoutMs,
  }: OutboxClaimBatchInput): Promise<OutboxDispatchRecord[]> {
    const records = await this.prisma.$queryRaw<ClaimedExecutionOutboxEvent[]>(
      Prisma.sql`
        WITH cte AS (
          SELECT "id"
          FROM "execution_engine"."OutboxEvent"
          WHERE (
              "status" IN ('PENDING'::"execution_engine"."OutboxEventStatus", 'FAILED'::"execution_engine"."OutboxEventStatus")
              AND "nextAttemptAt" <= NOW()
            )
            OR (
              "status" = 'IN_FLIGHT'::"execution_engine"."OutboxEventStatus"
              AND "updatedAt" < NOW() - (${staleInFlightTimeoutMs} * INTERVAL '1 millisecond')
            )
          ORDER BY "createdAt" ASC, "lifecycleSequence" ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "execution_engine"."OutboxEvent"
        SET "status" = 'IN_FLIGHT'::"execution_engine"."OutboxEventStatus",
            "updatedAt" = NOW()
        WHERE "id" IN (SELECT "id" FROM cte)
        RETURNING "id", "topic", "key", "value", "headers", "lifecycleSequence", "attempts", "createdAt"
      `,
    );

    return records.map(({ lifecycleSequence, ...record }) => ({
      ...record,
      dispatchOrder: lifecycleSequence,
    }));
  }

  async markDispatched(id: string, dispatchedAt: Date): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.DISPATCHED,
        dispatchedAt,
        lastError: null,
      },
    });
  }

  async markFailed({
    id,
    attempts,
    nextAttemptAt,
    lastError,
  }: MarkOutboxFailedInput): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.FAILED,
        attempts,
        nextAttemptAt,
        lastError,
      },
    });
  }

  async getBacklogMetrics(): Promise<OutboxBacklogMetrics> {
    const statuses = [
      OutboxEventStatus.PENDING,
      OutboxEventStatus.IN_FLIGHT,
      OutboxEventStatus.FAILED,
    ];
    const [rows, oldestPending] = await Promise.all([
      this.prisma.outboxEvent.groupBy({
        by: ['topic', 'status'],
        where: {
          status: { in: statuses },
        },
        _count: { _all: true },
      }),
      this.prisma.outboxEvent.findFirst({
        where: {
          status: { in: statuses },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      rows: rows.map((row) => ({
        topic: row.topic,
        status: row.status,
        count: row._count._all,
      })),
      oldestPendingAt: oldestPending?.createdAt ?? null,
    };
  }
}
