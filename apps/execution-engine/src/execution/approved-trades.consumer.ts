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
  KAFKA_EVENT_HEADER_NAMES,
  KAFKA_TOPICS,
  nextKafkaOffset,
  readRequiredKafkaHeader,
} from '@trading-bot/common';
import { TradeDecision } from '@trading-bot/common/proto';
import { Consumer, Kafka, logLevel } from 'kafkajs';

import { executionEngineRuntimeConfig } from '../config/runtime.config';
import { KAFKA_CONSUMER_GROUPS } from './const/kafka-consumer-groups';
import { ExecutionOrderService } from './services/execution-order.service';

@Injectable()
export class ApprovedTradesConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApprovedTradesConsumer.name);
  private consumer?: Consumer;

  constructor(
    private readonly configService: ConfigService,
    private readonly executionOrderService: ExecutionOrderService,
    @Inject(executionEngineRuntimeConfig.KEY)
    private readonly runtimeConfig: ConfigType<
      typeof executionEngineRuntimeConfig
    >,
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

    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.TRADES_APPROVED,
      fromBeginning: false,
    });

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        const approvalEventId = readRequiredKafkaHeader(
          message.headers,
          KAFKA_EVENT_HEADER_NAMES.EVENT_ID,
        );
        const decision = TradeDecision.decode(
          message.value ?? new Uint8Array(),
        );

        await this.executionOrderService.handleApprovedTrade(
          approvalEventId,
          decision,
        );

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
  }
}
