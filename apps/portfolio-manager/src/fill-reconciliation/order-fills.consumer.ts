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
import { OrderFill } from '@trading-bot/common/proto';
import { Consumer, Kafka, logLevel, Producer } from 'kafkajs';

import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { FILL_RECONCILIATION_KAFKA_CONSUMER_GROUPS } from './const/kafka-consumer-groups';
import { FillReconciliationService } from './services/fill-reconciliation.service';

@Injectable()
export class OrderFillsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderFillsConsumer.name);
  private consumer?: Consumer;
  private dlqProducer?: Producer;
  private runner?: ReliableKafkaConsumer<OrderFill>;

  constructor(
    private readonly configService: ConfigService,
    private readonly fillReconciliationService: FillReconciliationService,
    @Inject(portfolioManagerRuntimeConfig.KEY)
    private readonly runtimeConfig: ConfigType<
      typeof portfolioManagerRuntimeConfig
    >,
    @InjectTradingBotMetrics()
    private readonly metrics: TradingBotMetrics,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.runtimeConfig.enableFillReconciliationConsumer === false) {
      return;
    }

    const kafka = new Kafka({
      clientId: 'portfolio-manager-order-fills-consumer',
      brokers: this.configService
        .getOrThrow<string>('KAFKA_BROKERS')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
      logLevel: logLevel.NOTHING,
    });

    this.consumer = kafka.consumer({
      groupId: FILL_RECONCILIATION_KAFKA_CONSUMER_GROUPS.ORDER_FILLS,
    });
    this.dlqProducer = kafka.producer();
    this.runner = new ReliableKafkaConsumer({
      service: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
      consumerGroup: FILL_RECONCILIATION_KAFKA_CONSUMER_GROUPS.ORDER_FILLS,
      sourceTopic: KAFKA_TOPICS.ORDERS_FILLS,
      dlqTopic: deadLetterTopicFor(KAFKA_TOPICS.ORDERS_FILLS),
      decode: (value) => OrderFill.decode(value),
      handle: async ({
        eventId,
        kafkaKey,
        receivedAt,
        payload,
        eventContext,
      }) => {
        await this.fillReconciliationService.handleFill({
          kafkaEventId: eventId,
          kafkaKey,
          receivedAt,
          fill: payload,
          eventContext,
        });
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
      topic: KAFKA_TOPICS.ORDERS_FILLS,
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
          `Failed to stop order fills consumer: ${error.message}`,
        );
      });
      await this.consumer.disconnect().catch((error: Error) => {
        this.logger.warn(
          `Failed to disconnect order fills consumer: ${error.message}`,
        );
      });
      this.consumer = undefined;
    }
    if (this.dlqProducer) {
      await this.dlqProducer.disconnect().catch((error: Error) => {
        this.logger.warn(
          `Failed to disconnect order fills DLQ producer: ${error.message}`,
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
