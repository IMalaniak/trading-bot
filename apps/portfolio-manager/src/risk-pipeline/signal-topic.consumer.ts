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
import { Signal } from '@trading-bot/common/proto';
import { Consumer, Kafka, logLevel, Producer } from 'kafkajs';

import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { KAFKA_CONSUMER_GROUPS } from './const/kafka-consumer-groups';
import { InstrumentStageService } from './services/instrument-stage.service';

@Injectable()
export class SignalTopicConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SignalTopicConsumer.name);
  private consumer?: Consumer;
  private dlqProducer?: Producer;
  private runner?: ReliableKafkaConsumer<Signal>;

  constructor(
    private readonly configService: ConfigService,
    private readonly instrumentStageService: InstrumentStageService,
    @Inject(portfolioManagerRuntimeConfig.KEY)
    private readonly runtimeConfig: ConfigType<
      typeof portfolioManagerRuntimeConfig
    >,
    @InjectTradingBotMetrics()
    private readonly metrics: TradingBotMetrics,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.runtimeConfig.enableRiskPipelineConsumers) {
      return;
    }

    const kafka = new Kafka({
      clientId: 'portfolio-manager-signal-topic-consumer',
      brokers: this.configService
        .getOrThrow<string>('KAFKA_BROKERS')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
      logLevel: logLevel.NOTHING,
    });

    this.consumer = kafka.consumer({
      groupId: KAFKA_CONSUMER_GROUPS.INSTRUMENT_STAGE,
    });
    this.dlqProducer = kafka.producer();
    this.runner = new ReliableKafkaConsumer({
      service: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
      consumerGroup: KAFKA_CONSUMER_GROUPS.INSTRUMENT_STAGE,
      sourceTopic: KAFKA_TOPICS.TRADING_SIGNALS,
      dlqTopic: deadLetterTopicFor(KAFKA_TOPICS.TRADING_SIGNALS),
      decode: (value) => Signal.decode(value),
      handle: async ({
        eventId,
        kafkaKey,
        receivedAt,
        payload,
        eventContext,
      }) => {
        await this.instrumentStageService.handleSignal({
          sourceEventId: eventId,
          kafkaKey,
          receivedAt,
          signal: payload,
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
      topic: KAFKA_TOPICS.TRADING_SIGNALS,
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
        this.logger.warn(`Failed to stop signal consumer: ${error.message}`);
      });
      await this.consumer.disconnect().catch((error: Error) => {
        this.logger.warn(
          `Failed to disconnect signal consumer: ${error.message}`,
        );
      });
      this.consumer = undefined;
    }
    if (this.dlqProducer) {
      await this.dlqProducer.disconnect().catch((error: Error) => {
        this.logger.warn(
          `Failed to disconnect signal DLQ producer: ${error.message}`,
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
