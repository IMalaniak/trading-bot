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
import { OrderFill } from '@trading-bot/common/proto';
import { Consumer, Kafka, logLevel } from 'kafkajs';

import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { FILL_RECONCILIATION_KAFKA_CONSUMER_GROUPS } from './const/kafka-consumer-groups';
import { FillReconciliationService } from './services/fill-reconciliation.service';

@Injectable()
export class OrderFillsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderFillsConsumer.name);
  private consumer?: Consumer;

  constructor(
    private readonly configService: ConfigService,
    private readonly fillReconciliationService: FillReconciliationService,
    @Inject(portfolioManagerRuntimeConfig.KEY)
    private readonly runtimeConfig: ConfigType<
      typeof portfolioManagerRuntimeConfig
    >,
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

    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.ORDERS_FILLS,
      fromBeginning: false,
    });

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        const kafkaEventId = readRequiredKafkaHeader(
          message.headers,
          KAFKA_EVENT_HEADER_NAMES.EVENT_ID,
        );
        const kafkaKey = message.key?.toString('utf8') ?? '';
        const fill = OrderFill.decode(message.value ?? new Uint8Array());

        await this.fillReconciliationService.handleFill({
          kafkaEventId,
          kafkaKey,
          receivedAt: new Date(),
          fill,
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
  }
}
