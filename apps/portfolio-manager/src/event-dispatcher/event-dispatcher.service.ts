import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { lastValueFrom } from 'rxjs';

import { OutboxEventStatus, Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { PORTFOLIO_MANAGER_KAFKA_CLIENT } from './const';

const OUTBOX_DISPATCH_INTERVAL_MS = 1000;
const OUTBOX_BATCH_SIZE = 50;
const OUTBOX_EMIT_ATTEMPTS = 3;
const OUTBOX_RETRY_BASE_MS = 200;
const OUTBOX_RETRY_MAX_MS = 30_000;
// Cap exponential backoff exponent to prevent integer overflow and ensure
// predictable backoff behavior (2^10 * 200ms = 204.8s, already capped by MAX_MS).
const OUTBOX_RETRY_EXPONENT_CAP = 10;
// Base delay for immediate in-process emit retries (linear backoff: 50ms, 100ms, 150ms).
const EMIT_RETRY_BASE_MS = 50;
// Timeout for stale IN_FLIGHT events (reclaim if stuck for >30s due to crash/exception).
const OUTBOX_IN_FLIGHT_TIMEOUT_MS = 30_000;

@Injectable()
export class EventDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventDispatcherService.name);
  private outboxDispatchInterval?: NodeJS.Timeout;
  private outboxDispatchRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PORTFOLIO_MANAGER_KAFKA_CLIENT)
    private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
    this.startOutboxDispatcher();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.outboxDispatchInterval) {
      clearInterval(this.outboxDispatchInterval);
      this.outboxDispatchInterval = undefined;
    }
    await this.kafkaClient.close();
  }

  async enqueueEvent(
    tx: Prisma.TransactionClient,
    topic: string,
    message: {
      key: string;
      value: Uint8Array;
      headers?: Record<string, string>;
    },
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        id: randomUUID(),
        topic,
        key: message.key,
        value: Buffer.from(message.value),
        headers: message.headers ?? undefined,
        status: OutboxEventStatus.PENDING,
      },
    });
  }

  private startOutboxDispatcher(): void {
    if (this.outboxDispatchInterval) {
      return;
    }
    this.outboxDispatchInterval = setInterval(() => {
      void this.dispatchOutboxBatch();
    }, OUTBOX_DISPATCH_INTERVAL_MS);
    this.outboxDispatchInterval.unref();
  }

  async dispatchOutboxBatch(): Promise<void> {
    if (this.outboxDispatchRunning) {
      return;
    }
    this.outboxDispatchRunning = true;
    try {
      // Raw SQL atomically claims events with SKIP LOCKED and marks them IN_FLIGHT for concurrent dispatchers.
      // Includes stale IN_FLIGHT rows (stuck due to crashes/exceptions) older than timeout threshold.
      const claimedEvents = await this.prisma.$queryRaw<
        Array<{
          id: string;
          topic: string;
          key: string;
          value: Buffer;
          headers: Record<string, string> | null;
          attempts: number;
        }>
      >(Prisma.sql`
        WITH cte AS (
          SELECT "id"
          FROM "OutboxEvent"
          WHERE (
              "status" IN ('PENDING'::"OutboxEventStatus", 'FAILED'::"OutboxEventStatus")
              AND "nextAttemptAt" <= NOW()
            )
            OR (
              "status" = 'IN_FLIGHT'::"OutboxEventStatus"
              AND "updatedAt" < NOW() - INTERVAL '${Prisma.raw(`${OUTBOX_IN_FLIGHT_TIMEOUT_MS} milliseconds`)}'
            )
          ORDER BY "createdAt" ASC
          LIMIT ${OUTBOX_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "OutboxEvent"
        SET "status" = 'IN_FLIGHT'::"OutboxEventStatus",
            "updatedAt" = NOW()
        WHERE "id" IN (SELECT "id" FROM cte)
        RETURNING "id", "topic", "key", "value", "headers", "attempts"
      `);

      for (const event of claimedEvents) {
        this.logger.debug(
          `Dispatching outbox event ${event.id} to topic '${event.topic}'`,
        );
        const error = await this.emitEvent(
          event.topic,
          {
            key: event.key,
            value: event.value,
            headers: event.headers ?? undefined,
          },
          OUTBOX_EMIT_ATTEMPTS,
        );

        if (!error) {
          this.logger.debug(`Outbox event ${event.id} dispatched successfully`);
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: OutboxEventStatus.DISPATCHED,
              dispatchedAt: new Date(),
              lastError: null,
            },
          });
        } else {
          this.logger.warn(
            `Outbox event ${event.id} failed to dispatch: ${error}`,
          );
          const attempts = event.attempts + 1;
          const backoffMs = Math.min(
            OUTBOX_RETRY_MAX_MS,
            OUTBOX_RETRY_BASE_MS *
              2 ** Math.min(attempts, OUTBOX_RETRY_EXPONENT_CAP),
          );
          const nextAttemptAt = new Date(Date.now() + backoffMs);
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: OutboxEventStatus.FAILED,
              attempts,
              nextAttemptAt,
              lastError: error,
            },
          });
        }
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `Outbox dispatch failed: ${error?.message ?? String(err)}`,
        error?.stack ?? String(err),
      );
    } finally {
      this.outboxDispatchRunning = false;
    }
  }

  private async emitEvent(
    topic: string,
    message: {
      key: string;
      value: Uint8Array;
      headers?: Record<string, string>;
    },
    attempts = 3,
  ): Promise<string | null> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await lastValueFrom(this.kafkaClient.emit(topic, message));
        return null;
      } catch (err: unknown) {
        lastError = err;
        this.logger.warn(
          `Failed to emit Kafka event '${topic}' (attempt ${attempt}/${attempts})`,
          (err as Error)?.message ?? err,
        );
        if (attempt < attempts) {
          await new Promise((res) =>
            setTimeout(res, EMIT_RETRY_BASE_MS * attempt),
          );
        }
      }
    }

    if (lastError) {
      this.logger.error(
        `Giving up emitting Kafka event '${topic}' after ${attempts} attempts`,
        lastError as Error,
      );
      return (lastError as Error)?.message ?? JSON.stringify(lastError);
    }

    return 'unknown error';
  }
}
