import { DeadLetterEvent } from '../../proto';
import {
  buildEventMetadataHeaders,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  type KafkaEventContext,
  resolveKafkaEventContext,
} from './event-metadata';
import { kafkaHeadersToStringRecord, nextKafkaOffset } from './kafka-header';
import {
  type DeadLetterSourceTopic,
  type DeadLetterTopic,
  KAFKA_TOPICS,
} from './kafka-topics';

type KafkaMessageHeaderValue =
  | Buffer
  | string
  | readonly (Buffer | string)[]
  | undefined;

export interface ReliableKafkaConsumerMessage {
  key?: Buffer | null;
  value?: Buffer | null;
  headers?: Record<string, KafkaMessageHeaderValue>;
  offset: string;
}

export interface ReliableKafkaEachMessagePayload {
  topic: string;
  partition: number;
  message: ReliableKafkaConsumerMessage;
}

export interface ReliableKafkaDlqProducer {
  send(input: {
    topic: string;
    messages: Array<{
      key?: Buffer | string | null;
      value: Buffer;
      headers?: Record<string, string>;
    }>;
  }): Promise<unknown>;
}

export interface ReliableKafkaConsumerCommitOffsetInput {
  topic: string;
  partition: number;
  offset: string;
}

export interface ReliableKafkaConsumerLogger {
  debug(message: string): void;
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
}

export interface ReliableKafkaConsumerMetrics {
  recordConsumerMessage(
    labels: { topic: string; consumerGroup: string },
    outcome: 'success' | 'dlq' | 'failure',
    durationSeconds: number,
  ): void;
  recordConsumerRetry(labels: { topic: string; consumerGroup: string }): void;
  recordDeadLetter(labels: {
    topic: string;
    consumerGroup: string;
    dlqTopic: string;
  }): void;
}

export interface ReliableKafkaConsumerRetryPolicy {
  maxAttempts?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

export interface ReliableKafkaMessageHandlerInput<TPayload> {
  payload: TPayload;
  eventId: string;
  kafkaKey: string;
  headers: Record<string, string | undefined>;
  eventContext: KafkaEventContext;
  receivedAt: Date;
  raw: {
    topic: string;
    partition: number;
    offset: string;
  };
}

export interface ReliableKafkaConsumerInput<TPayload> {
  service:
    | typeof KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER
    | typeof KAFKA_EVENT_PRODUCERS.EXECUTION_ENGINE;
  consumerGroup: string;
  sourceTopic: DeadLetterSourceTopic;
  dlqTopic: DeadLetterTopic;
  decode: (value: Buffer) => TPayload;
  handle: (input: ReliableKafkaMessageHandlerInput<TPayload>) => Promise<void>;
  commitOffset: (
    input: ReliableKafkaConsumerCommitOffsetInput,
  ) => Promise<void>;
  dlqProducer: ReliableKafkaDlqProducer;
  logger: ReliableKafkaConsumerLogger;
  metrics?: ReliableKafkaConsumerMetrics;
  retryPolicy?: ReliableKafkaConsumerRetryPolicy;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_RETRY_MAX_MS = 5_000;

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

  try {
    const serialized = JSON.stringify(error);

    return serialized || toFallbackErrorMessage(error);
  } catch {
    return toFallbackErrorMessage(error);
  }
};

const toFallbackErrorMessage = (error: unknown): string => {
  try {
    return String(error);
  } catch {
    return '[unserializable error]';
  }
};

const toFailureClass = (error: unknown): string => {
  if (error instanceof Error && error.constructor.name) {
    return error.constructor.name;
  }

  return typeof error;
};

const dlqSchemaVersion = (topic: DeadLetterTopic): string => {
  switch (topic) {
    case KAFKA_TOPICS.TRADING_SIGNALS_DLQ:
      return KAFKA_EVENT_SCHEMA_VERSIONS.TRADING_SIGNALS_DLQ;
    case KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO_DLQ:
      return KAFKA_EVENT_SCHEMA_VERSIONS.TRADING_SIGNALS_PORTFOLIO_DLQ;
    case KAFKA_TOPICS.TRADES_APPROVED_DLQ:
      return KAFKA_EVENT_SCHEMA_VERSIONS.TRADES_APPROVED_DLQ;
    case KAFKA_TOPICS.ORDERS_FILLS_DLQ:
      return KAFKA_EVENT_SCHEMA_VERSIONS.ORDERS_FILLS_DLQ;
  }
};

const durationSecondsSince = (startedAt: number): number =>
  (Date.now() - startedAt) / 1000;

export class ReliableKafkaConsumer<TPayload> {
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly input: ReliableKafkaConsumerInput<TPayload>) {
    this.maxAttempts = input.retryPolicy?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBaseMs = input.retryPolicy?.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.retryMaxMs = input.retryPolicy?.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;
    this.now = input.now ?? (() => new Date());
    this.sleep = input.sleep ?? defaultSleep;
  }

  async handleMessage({
    topic,
    partition,
    message,
  }: ReliableKafkaEachMessagePayload): Promise<void> {
    const startedAt = Date.now();
    const kafkaKey = message.key?.toString('utf8') ?? '';
    const headers = kafkaHeadersToStringRecord(message.headers);
    const fallbackEventId = `${topic}:${partition}:${message.offset}`;
    const eventContext = resolveKafkaEventContext(headers, fallbackEventId);
    const eventId = eventContext.eventId ?? fallbackEventId;
    let firstFailedAt: Date | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const payload = this.input.decode(
          Buffer.from(message.value ?? new Uint8Array()),
        );

        await this.input.handle({
          payload,
          eventId,
          kafkaKey,
          headers,
          eventContext,
          receivedAt: this.now(),
          raw: {
            topic,
            partition,
            offset: message.offset,
          },
        });

        await this.commit(topic, partition, message.offset);
        this.input.metrics?.recordConsumerMessage(
          this.metricLabels(),
          'success',
          durationSecondsSince(startedAt),
        );
        this.log('debug', 'Kafka consumer message processed', {
          eventId,
          correlationId: eventContext.correlationId,
          causationId: eventContext.causationId,
          topic,
          key: kafkaKey,
          partition,
          offset: message.offset,
          attempt,
          outcome: 'success',
        });
        return;
      } catch (error) {
        lastError = error;
        firstFailedAt ??= this.now();
        this.input.metrics?.recordConsumerRetry(this.metricLabels());
        this.log('warn', 'Kafka consumer message processing failed', {
          eventId,
          correlationId: eventContext.correlationId,
          causationId: eventContext.causationId,
          topic,
          key: kafkaKey,
          partition,
          offset: message.offset,
          attempt,
          outcome: 'retry',
          error: toErrorMessage(error),
        });

        if (attempt < this.maxAttempts) {
          await this.sleep(this.backoffMs(attempt));
        }
      }
    }

    await this.publishDeadLetter({
      topic,
      partition,
      message,
      kafkaKey,
      headers,
      eventId,
      eventContext,
      attempts: this.maxAttempts,
      firstFailedAt: firstFailedAt ?? this.now(),
      error: lastError,
    });
    await this.commit(topic, partition, message.offset);
    this.input.metrics?.recordDeadLetter({
      ...this.metricLabels(),
      dlqTopic: this.input.dlqTopic,
    });
    this.input.metrics?.recordConsumerMessage(
      this.metricLabels(),
      'dlq',
      durationSecondsSince(startedAt),
    );
  }

  private async publishDeadLetter({
    topic,
    partition,
    message,
    kafkaKey,
    headers,
    eventId,
    eventContext,
    attempts,
    firstFailedAt,
    error,
  }: {
    topic: string;
    partition: number;
    message: ReliableKafkaConsumerMessage;
    kafkaKey: string;
    headers: Record<string, string | undefined>;
    eventId: string;
    eventContext: KafkaEventContext;
    attempts: number;
    firstFailedAt: Date;
    error: unknown;
  }): Promise<void> {
    const deadLetteredAt = this.now();
    const deadLetterEventId = `${eventId}:dlq`;
    const deadLetter = DeadLetterEvent.fromPartial({
      originalTopic: topic,
      originalPartition: partition,
      originalOffset: message.offset,
      originalKey: kafkaKey,
      originalValue: Buffer.from(message.value ?? new Uint8Array()),
      originalHeaders: Object.entries(headers).map(([name, value]) => ({
        name,
        value: value ?? '',
      })),
      service: this.input.service,
      consumerGroup: this.input.consumerGroup,
      attempts,
      failureClass: toFailureClass(error),
      errorMessage: toErrorMessage(error),
      firstFailedAt: firstFailedAt.toISOString(),
      deadLetteredAt: deadLetteredAt.toISOString(),
      correlationId: eventContext.correlationId ?? eventId,
      causationId: eventContext.causationId ?? eventContext.eventId ?? eventId,
    });

    await this.input.dlqProducer.send({
      topic: this.input.dlqTopic,
      messages: [
        {
          key: message.key ?? kafkaKey,
          value: Buffer.from(DeadLetterEvent.encode(deadLetter).finish()),
          headers: buildEventMetadataHeaders({
            eventId: deadLetterEventId,
            eventType: this.input.dlqTopic,
            schemaVersion: dlqSchemaVersion(this.input.dlqTopic),
            occurredAt: deadLetteredAt.toISOString(),
            producer: this.input.service,
            correlationId: eventContext.correlationId ?? eventId,
            causationId: eventContext.eventId ?? eventId,
            traceparent: eventContext.traceparent,
          }),
        },
      ],
    });

    this.log('error', 'Kafka consumer message dead-lettered', {
      eventId,
      correlationId: eventContext.correlationId,
      causationId: eventContext.causationId,
      topic,
      key: kafkaKey,
      partition,
      offset: message.offset,
      attempt: attempts,
      outcome: 'dlq',
      dlqTopic: this.input.dlqTopic,
      error: toErrorMessage(error),
    });
  }

  private async commit(
    topic: string,
    partition: number,
    offset: string,
  ): Promise<void> {
    await this.input.commitOffset({
      topic,
      partition,
      offset: nextKafkaOffset(offset),
    });
  }

  private backoffMs(attempt: number): number {
    return Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** (attempt - 1));
  }

  private metricLabels(): { topic: string; consumerGroup: string } {
    return {
      topic: this.input.sourceTopic,
      consumerGroup: this.input.consumerGroup,
    };
  }

  private log(
    level: 'debug' | 'warn' | 'error',
    message: string,
    fields: Record<string, unknown>,
  ): void {
    const payload = JSON.stringify({
      service: this.input.service,
      consumerGroup: this.input.consumerGroup,
      message,
      ...fields,
    });

    if (level === 'debug') {
      this.input.logger.debug(payload);
      return;
    }

    if (level === 'warn') {
      this.input.logger.warn(payload);
      return;
    }

    this.input.logger.error(payload);
  }
}
