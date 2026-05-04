import type { Observable } from 'rxjs';
import { lastValueFrom } from 'rxjs';

import type { OutboxMessageInput } from './outbox-message';

export interface OutboxClaimBatchInput {
  batchSize: number;
  staleInFlightTimeoutMs: number;
}

export interface OutboxDispatchRecord {
  id: string;
  topic: string;
  key: string;
  value: Uint8Array;
  headers?: Record<string, string> | null;
  attempts: number;
  createdAt?: Date;
  dispatchOrder?: number;
}

export interface MarkOutboxFailedInput {
  id: string;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string;
}

export interface OutboxDispatcherRepository {
  claimBatch(input: OutboxClaimBatchInput): Promise<OutboxDispatchRecord[]>;
  markDispatched(id: string, dispatchedAt: Date): Promise<void>;
  markFailed(input: MarkOutboxFailedInput): Promise<void>;
}

export interface OutboxKafkaEmitter {
  emit(
    topic: string,
    message: OutboxMessageInput,
  ): Observable<unknown> | Promise<unknown>;
}

export interface OutboxDispatcherLogger {
  debug(message: string): void;
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
}

export interface OutboxDispatcherOptions {
  batchSize?: number;
  emitAttempts?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  retryExponentCap?: number;
  emitRetryBaseMs?: number;
  staleInFlightTimeoutMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface OutboxDispatcherInput {
  repository: OutboxDispatcherRepository;
  kafkaEmitter: OutboxKafkaEmitter;
  logger: OutboxDispatcherLogger;
  options?: OutboxDispatcherOptions;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_EMIT_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 200;
const DEFAULT_RETRY_MAX_MS = 30_000;
const DEFAULT_RETRY_EXPONENT_CAP = 10;
const DEFAULT_EMIT_RETRY_BASE_MS = 50;
const DEFAULT_STALE_IN_FLIGHT_TIMEOUT_MS = 30_000;

const defaultSleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return JSON.stringify(error) ?? String(error);
};

const isObservable = (value: unknown): value is Observable<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  'subscribe' in value &&
  typeof (value as { subscribe?: unknown }).subscribe === 'function';

const compareDispatchRecords = (
  left: OutboxDispatchRecord,
  right: OutboxDispatchRecord,
): number => {
  const createdAtDelta =
    (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0);

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return (left.dispatchOrder ?? 0) - (right.dispatchOrder ?? 0);
};

export class KafkaOutboxDispatcher {
  private readonly options: Required<OutboxDispatcherOptions>;
  private dispatchRunning = false;

  constructor(private readonly input: OutboxDispatcherInput) {
    this.options = {
      batchSize: DEFAULT_BATCH_SIZE,
      emitAttempts: DEFAULT_EMIT_ATTEMPTS,
      retryBaseMs: DEFAULT_RETRY_BASE_MS,
      retryMaxMs: DEFAULT_RETRY_MAX_MS,
      retryExponentCap: DEFAULT_RETRY_EXPONENT_CAP,
      emitRetryBaseMs: DEFAULT_EMIT_RETRY_BASE_MS,
      staleInFlightTimeoutMs: DEFAULT_STALE_IN_FLIGHT_TIMEOUT_MS,
      now: () => new Date(),
      sleep: defaultSleep,
      ...(input.options ?? {}),
    };
  }

  async dispatchBatch(): Promise<void> {
    if (this.dispatchRunning) {
      return;
    }

    this.dispatchRunning = true;
    try {
      const claimedEvents = await this.input.repository.claimBatch({
        batchSize: this.options.batchSize,
        staleInFlightTimeoutMs: this.options.staleInFlightTimeoutMs,
      });

      claimedEvents.sort(compareDispatchRecords);

      for (const event of claimedEvents) {
        await this.dispatchEvent(event);
      }
    } catch (error) {
      this.input.logger.error(
        `Outbox dispatch failed: ${toErrorMessage(error)}`,
        error,
      );
    } finally {
      this.dispatchRunning = false;
    }
  }

  private async dispatchEvent(event: OutboxDispatchRecord): Promise<void> {
    this.input.logger.debug(
      `Dispatching outbox event ${event.id} to topic '${event.topic}'`,
    );

    const error = await this.emitEvent(event);

    if (!error) {
      this.input.logger.debug(
        `Outbox event ${event.id} dispatched successfully`,
      );
      await this.input.repository.markDispatched(event.id, this.options.now());
      return;
    }

    this.input.logger.warn(
      `Outbox event ${event.id} failed to dispatch: ${error}`,
    );
    const attempts = event.attempts + 1;
    const backoffMs = Math.min(
      this.options.retryMaxMs,
      this.options.retryBaseMs *
        2 ** Math.min(attempts, this.options.retryExponentCap),
    );
    const nextAttemptAt = new Date(this.options.now().getTime() + backoffMs);

    await this.input.repository.markFailed({
      id: event.id,
      attempts,
      nextAttemptAt,
      lastError: error,
    });
  }

  private async emitEvent(event: OutboxDispatchRecord): Promise<string | null> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.options.emitAttempts; attempt++) {
      try {
        const emitted = this.input.kafkaEmitter.emit(event.topic, {
          key: event.key,
          value: Buffer.from(event.value),
          headers: event.headers ?? undefined,
        });

        if (isObservable(emitted)) {
          await lastValueFrom(emitted);
        } else {
          await emitted;
        }

        return null;
      } catch (error: unknown) {
        lastError = error;
        this.input.logger.warn(
          `Failed to emit Kafka event '${event.topic}' (attempt ${attempt}/${this.options.emitAttempts})`,
          error,
        );

        if (attempt < this.options.emitAttempts) {
          await this.options.sleep(this.options.emitRetryBaseMs * attempt);
        }
      }
    }

    if (lastError) {
      this.input.logger.error(
        `Giving up emitting Kafka event '${event.topic}' after ${this.options.emitAttempts} attempts`,
        lastError,
      );
      return toErrorMessage(lastError);
    }

    return 'unknown error';
  }
}
