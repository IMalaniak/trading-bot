import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import {
  deadLetterTopicFor,
  InjectTradingBotMetrics,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_TOPICS,
  ReliableKafkaConsumer,
  TradingBotMetrics,
} from '@trading-bot/common';
import { TradeDecision } from '@trading-bot/common/proto';
import { Consumer, Kafka, logLevel, Producer } from 'kafkajs';

import { executionEngineRuntimeConfig } from '../config/runtime.config';
import { KAFKA_CONSUMER_GROUPS } from './const/kafka-consumer-groups';
import { ExecutionOrderService } from './services/execution-order.service';

@Injectable()
export class ApprovedTradesConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApprovedTradesConsumer.name);
  private consumer?: Consumer;
  private dlqProducer?: Producer;
  private runner?: ReliableKafkaConsumer<TradeDecision>;

  constructor(
    private readonly configService: ConfigService,
    private readonly executionOrderService: ExecutionOrderService,
    @Inject(executionEngineRuntimeConfig.KEY)
    private readonly runtimeConfig: ConfigType<
      typeof executionEngineRuntimeConfig
    >,
    @InjectTradingBotMetrics()
    private readonly metrics: TradingBotMetrics,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.runtimeConfig.enableApprovedTradesConsumer) {
      return;
    }

    const kafka = new Kafka({
      clientId: 'execution-engine-approved-trades-consumer',
      brokers: this.configService
        .getOrThrow<string>('KAFKA_BROKERS')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
      logLevel: logLevel.NOTHING,
    });

    this.consumer = kafka.consumer({
      groupId: KAFKA_CONSUMER_GROUPS.APPROVED_TRADES,
    });
    this.dlqProducer = kafka.producer();
    this.runner = new ReliableKafkaConsumer({
      service: KAFKA_EVENT_PRODUCERS.EXECUTION_ENGINE,
      consumerGroup: KAFKA_CONSUMER_GROUPS.APPROVED_TRADES,
      sourceTopic: KAFKA_TOPICS.TRADES_APPROVED,
      dlqTopic: deadLetterTopicFor(KAFKA_TOPICS.TRADES_APPROVED),
      decode: (value) => TradeDecision.decode(value),
      handle: async ({ eventId, payload, eventContext }) => {
        await this.executionOrderService.handleApprovedTrade(
          eventId,
          payload,
          eventContext,
        );
      },
      commitOffset: async (offset) => {
        await this.consumer?.commitOffsets([offset]);
      },
      dlqProducer: this.dlqProducer,
      logger: this.logger,
      metrics: this.metrics,
      retryPolicy: this.retryPolicy(),
    });

    await this.consumer.connect();
    await this.dlqProducer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.TRADES_APPROVED,
      fromBeginning: false,
    });

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async (payload) => {
        await this.runner?.handleMessage(payload);
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer) {
      await this.consumer.stop().catch((error: Error) => {
        this.logger.warn(
          `Failed to stop approved trades consumer: ${error.message}`,
        );
      });
      await this.consumer.disconnect().catch((error: Error) => {
        this.logger.warn(
          `Failed to disconnect approved trades consumer: ${error.message}`,
        );
      });
      this.consumer = undefined;
    }
    if (this.dlqProducer) {
      await this.dlqProducer.disconnect().catch((error: Error) => {
        this.logger.warn(
          `Failed to disconnect approved trades DLQ producer: ${error.message}`,
        );
      });
      this.dlqProducer = undefined;
    }
    this.runner = undefined;
  }

  private retryPolicy() {
    return {
      maxAttempts: this.configService.get<number>(
        'KAFKA_CONSUMER_RETRY_MAX_ATTEMPTS',
        5,
      ),
      retryBaseMs: this.configService.get<number>(
        'KAFKA_CONSUMER_RETRY_BASE_MS',
        250,
      ),
      retryMaxMs: this.configService.get<number>(
        'KAFKA_CONSUMER_RETRY_MAX_MS',
        5000,
      ),
    };
  }
}
