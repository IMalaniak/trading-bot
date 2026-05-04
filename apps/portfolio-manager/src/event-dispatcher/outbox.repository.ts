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

@Injectable()
export class OutboxRepository implements OutboxDispatcherRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    tx: Prisma.TransactionClient,
    topic: string,
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
        status: OutboxEventStatus.PENDING,
      },
    });

    return eventId;
  }

  async claimBatch({
    batchSize,
    staleInFlightTimeoutMs,
  }: OutboxClaimBatchInput): Promise<OutboxDispatchRecord[]> {
    return this.prisma.$queryRaw<OutboxDispatchRecord[]>(Prisma.sql`
      WITH cte AS (
        SELECT "id"
        FROM "OutboxEvent"
        WHERE (
            "status" IN ('PENDING'::"OutboxEventStatus", 'FAILED'::"OutboxEventStatus")
            AND "nextAttemptAt" <= NOW()
          )
          OR (
            "status" = 'IN_FLIGHT'::"OutboxEventStatus"
            AND "updatedAt" < NOW() - (${staleInFlightTimeoutMs} * INTERVAL '1 millisecond')
          )
        ORDER BY "createdAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "OutboxEvent"
      SET "status" = 'IN_FLIGHT'::"OutboxEventStatus",
          "updatedAt" = NOW()
      WHERE "id" IN (SELECT "id" FROM cte)
      RETURNING "id", "topic", "key", "value", "headers", "attempts", "createdAt"
    `);
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
}
