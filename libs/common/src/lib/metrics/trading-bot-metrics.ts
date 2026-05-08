import {
  DynamicModule,
  Global,
  Inject,
  Module,
  Provider,
} from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  register as defaultRegistry,
  Registry,
} from 'prom-client';

export const TRADING_BOT_METRICS = Symbol('TRADING_BOT_METRICS');

export interface KafkaConsumerMetricLabels {
  topic: string;
  consumerGroup: string;
}

export interface OutboxMetricLabels {
  topic: string;
}

export interface OutboxBacklogMetricLabels {
  topic: string;
  status: string;
}

export interface TradingBotMetricsOptions {
  service: string;
  registry?: Registry;
  collectDefaultMetrics?: boolean;
}

export class TradingBotMetrics {
  readonly contentType: string;

  private readonly consumerMessages: Counter<string>;
  private readonly consumerRetries: Counter<string>;
  private readonly consumerProcessingSeconds: Histogram<string>;
  private readonly dlqMessages: Counter<string>;
  private readonly outboxDispatches: Counter<string>;
  private readonly outboxBacklog: Gauge<string>;
  private readonly oldestOutboxAgeSeconds: Gauge<string>;

  constructor(private readonly options: Required<TradingBotMetricsOptions>) {
    this.contentType = options.registry.contentType;

    if (options.collectDefaultMetrics) {
      collectDefaultMetrics({
        prefix: 'trading_bot_',
        register: options.registry,
        labels: { service: options.service },
      });
    }

    this.consumerMessages = getOrCreateMetric(
      options.registry,
      'trading_bot_kafka_consumer_messages_total',
      () =>
        new Counter({
          name: 'trading_bot_kafka_consumer_messages_total',
          help: 'Kafka consumer messages processed by outcome.',
          labelNames: ['service', 'topic', 'consumer_group', 'outcome'],
          registers: [options.registry],
        }),
    );
    this.consumerRetries = getOrCreateMetric(
      options.registry,
      'trading_bot_kafka_consumer_retries_total',
      () =>
        new Counter({
          name: 'trading_bot_kafka_consumer_retries_total',
          help: 'Kafka consumer retry attempts after processing failures.',
          labelNames: ['service', 'topic', 'consumer_group'],
          registers: [options.registry],
        }),
    );
    this.consumerProcessingSeconds = getOrCreateMetric(
      options.registry,
      'trading_bot_kafka_consumer_processing_seconds',
      () =>
        new Histogram({
          name: 'trading_bot_kafka_consumer_processing_seconds',
          help: 'Kafka consumer message processing duration in seconds.',
          labelNames: ['service', 'topic', 'consumer_group', 'outcome'],
          buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
          registers: [options.registry],
        }),
    );
    this.dlqMessages = getOrCreateMetric(
      options.registry,
      'trading_bot_kafka_consumer_dlq_messages_total',
      () =>
        new Counter({
          name: 'trading_bot_kafka_consumer_dlq_messages_total',
          help: 'Kafka consumer messages sent to dead-letter topics.',
          labelNames: ['service', 'topic', 'consumer_group', 'dlq_topic'],
          registers: [options.registry],
        }),
    );
    this.outboxDispatches = getOrCreateMetric(
      options.registry,
      'trading_bot_outbox_dispatch_total',
      () =>
        new Counter({
          name: 'trading_bot_outbox_dispatch_total',
          help: 'Outbox dispatch attempts by outcome.',
          labelNames: ['service', 'topic', 'outcome'],
          registers: [options.registry],
        }),
    );
    this.outboxBacklog = getOrCreateMetric(
      options.registry,
      'trading_bot_outbox_backlog',
      () =>
        new Gauge({
          name: 'trading_bot_outbox_backlog',
          help: 'Outbox backlog rows by topic and status.',
          labelNames: ['service', 'topic', 'status'],
          registers: [options.registry],
        }),
    );
    this.oldestOutboxAgeSeconds = getOrCreateMetric(
      options.registry,
      'trading_bot_outbox_oldest_pending_age_seconds',
      () =>
        new Gauge({
          name: 'trading_bot_outbox_oldest_pending_age_seconds',
          help: 'Age of the oldest non-dispatched outbox row in seconds.',
          labelNames: ['service'],
          registers: [options.registry],
        }),
    );
  }

  recordConsumerMessage(
    labels: KafkaConsumerMetricLabels,
    outcome: 'success' | 'dlq' | 'failure',
    durationSeconds: number,
  ): void {
    const metricLabels = this.consumerLabels(labels, outcome);
    this.consumerMessages.inc(metricLabels);
    this.consumerProcessingSeconds.observe(metricLabels, durationSeconds);
  }

  recordConsumerRetry(labels: KafkaConsumerMetricLabels): void {
    this.consumerRetries.inc(this.consumerLabels(labels));
  }

  recordDeadLetter(
    labels: KafkaConsumerMetricLabels & { dlqTopic: string },
  ): void {
    this.dlqMessages.inc({
      service: this.options.service,
      topic: labels.topic,
      consumer_group: labels.consumerGroup,
      dlq_topic: labels.dlqTopic,
    });
  }

  recordOutboxDispatch(
    labels: OutboxMetricLabels,
    outcome: 'success' | 'failure',
  ): void {
    this.outboxDispatches.inc({
      service: this.options.service,
      topic: labels.topic,
      outcome,
    });
  }

  setOutboxBacklog(labels: OutboxBacklogMetricLabels, value: number): void {
    this.outboxBacklog.set(
      {
        service: this.options.service,
        topic: labels.topic,
        status: labels.status,
      },
      value,
    );
  }

  setOldestOutboxAgeSeconds(value: number): void {
    this.oldestOutboxAgeSeconds.set({ service: this.options.service }, value);
  }

  async metrics(): Promise<string> {
    return this.options.registry.metrics();
  }

  private consumerLabels(
    labels: KafkaConsumerMetricLabels,
    outcome?: 'success' | 'dlq' | 'failure',
  ): Record<string, string> {
    return {
      service: this.options.service,
      topic: labels.topic,
      consumer_group: labels.consumerGroup,
      ...(outcome ? { outcome } : {}),
    };
  }
}

export const createTradingBotMetrics = (
  options: TradingBotMetricsOptions,
): TradingBotMetrics =>
  new TradingBotMetrics({
    registry: options.registry ?? new Registry(),
    collectDefaultMetrics: options.collectDefaultMetrics ?? true,
    service: options.service,
  });

export const createTradingBotMetricsProvider = (service: string): Provider => ({
  provide: TRADING_BOT_METRICS,
  useFactory: () =>
    createTradingBotMetrics({
      service,
      registry: defaultRegistry,
      collectDefaultMetrics: false,
    }),
});

export const InjectTradingBotMetrics = () => Inject(TRADING_BOT_METRICS);

@Global()
@Module({})
export class TradingBotMetricsModule {
  static forRoot(service: string): DynamicModule {
    const provider = createTradingBotMetricsProvider(service);

    return {
      module: TradingBotMetricsModule,
      imports: [
        PrometheusModule.register({
          path: '/metrics',
          defaultMetrics: {
            enabled: false,
          },
        }),
      ],
      providers: [provider],
      exports: [TRADING_BOT_METRICS],
    };
  }
}

const getOrCreateMetric = <T>(
  registry: Registry,
  name: string,
  factory: () => T,
): T => {
  const existing = registry.getSingleMetric(name);

  return existing ? (existing as T) : factory();
};
