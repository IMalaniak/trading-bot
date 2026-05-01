import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { KAFKA_TOPICS } from '@trading-bot/common';
import { PortfolioSignalCandidate } from '@trading-bot/common/proto';
import { Consumer, Kafka, logLevel } from 'kafkajs';

import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { KAFKA_CONSUMER_GROUPS } from './const/kafka-consumer-groups';
import { PortfolioStageService } from './services/portfolio-stage.service';
import { nextKafkaOffset } from './utils/kafka-header';

@Injectable()
export class PortfolioTopicConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PortfolioTopicConsumer.name);
  private consumer?: Consumer;

  constructor(
    private readonly configService: ConfigService,
    private readonly portfolioStageService: PortfolioStageService,
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
      clientId: 'portfolio-manager-portfolio-topic-consumer',
      brokers: this.configService
        .getOrThrow<string>('KAFKA_BROKERS')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
      logLevel: logLevel.NOTHING,
    });

    this.consumer = kafka.consumer({
      groupId: KAFKA_CONSUMER_GROUPS.PORTFOLIO_STAGE,
    });

    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO,
      fromBeginning: false,
    });

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        const candidate = PortfolioSignalCandidate.decode(
          message.value ?? new Uint8Array(),
        );

        await this.portfolioStageService.handleCandidate(candidate);

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
          `Failed to stop portfolio candidate consumer: ${error.message}`,
        );
      });
      await this.consumer.disconnect().catch((error: Error) => {
        this.logger.warn(
          `Failed to disconnect portfolio candidate consumer: ${error.message}`,
        );
      });
      this.consumer = undefined;
    }
  }
}
