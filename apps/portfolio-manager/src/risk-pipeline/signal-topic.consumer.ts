import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { KAFKA_EVENT_HEADER_NAMES, KAFKA_TOPICS } from '@trading-bot/common';
import { Signal } from '@trading-bot/common/proto';
import { Consumer, Kafka, logLevel } from 'kafkajs';

import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { KAFKA_CONSUMER_GROUPS } from './const/kafka-consumer-groups';
import { InstrumentStageService } from './services/instrument-stage.service';
import { nextKafkaOffset, readRequiredKafkaHeader } from './utils/kafka-header';

@Injectable()
export class SignalTopicConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SignalTopicConsumer.name);
  private consumer?: Consumer;

  constructor(
    private readonly configService: ConfigService,
    private readonly instrumentStageService: InstrumentStageService,
    @Inject(portfolioManagerRuntimeConfig.KEY)
    private readonly runtimeConfig: ConfigType<
      typeof portfolioManagerRuntimeConfig
    >,
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

    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.TRADING_SIGNALS,
      fromBeginning: false,
    });

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        const sourceEventId = readRequiredKafkaHeader(
          message.headers,
          KAFKA_EVENT_HEADER_NAMES.EVENT_ID,
        );
        const kafkaKey = message.key?.toString('utf8') ?? '';
        const signal = Signal.decode(message.value ?? new Uint8Array());

        await this.instrumentStageService.handleSignal({
          sourceEventId,
          kafkaKey,
          receivedAt: new Date(),
          signal,
        });

        await this.consumer?.commitOffsets([
          {
            topic,
            partition,
            offset: nextKafkaOffset(message.offset),
          },
        ]);
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
  }
}
