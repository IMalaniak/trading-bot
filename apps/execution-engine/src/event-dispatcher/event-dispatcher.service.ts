import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ClientKafka } from '@nestjs/microservices';
import type { OutboxMessageInput } from '@trading-bot/common';
import {
  InjectTradingBotMetrics,
  KafkaOutboxDispatcher,
  TradingBotMetrics,
} from '@trading-bot/common';

import { executionEngineRuntimeConfig } from '../config/runtime.config';
import { Prisma } from '../prisma/generated/client';
import { EXECUTION_ENGINE_KAFKA_CLIENT } from './const';
import { OutboxRepository } from './outbox.repository';

const OUTBOX_DISPATCH_INTERVAL_MS = 1000;

@Injectable()
export class EventDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventDispatcherService.name);
  private readonly dispatcher: KafkaOutboxDispatcher;
  private outboxDispatchInterval?: NodeJS.Timeout;

  constructor(
    private readonly outboxRepository: OutboxRepository,
    @Inject(EXECUTION_ENGINE_KAFKA_CLIENT)
    private readonly kafkaClient: ClientKafka,
    @Inject(executionEngineRuntimeConfig.KEY)
    private readonly runtimeConfig: ConfigType<
      typeof executionEngineRuntimeConfig
    >,
    @InjectTradingBotMetrics()
    private readonly metrics: TradingBotMetrics,
  ) {
    this.dispatcher = new KafkaOutboxDispatcher({
      repository: outboxRepository,
      kafkaEmitter: kafkaClient,
      logger: this.logger,
      metrics: this.metrics,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
    this.startOutboxDispatcher();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.outboxDispatchInterval) {
      clearInterval(this.outboxDispatchInterval);
      this.outboxDispatchInterval = undefined;
    }
    await this.kafkaClient.close();
  }

  async enqueueEvent(
    tx: Prisma.TransactionClient,
    topic: string,
    lifecycleSequence: number,
    message: OutboxMessageInput,
  ): Promise<string> {
    return this.outboxRepository.enqueue(tx, topic, lifecycleSequence, message);
  }

  private startOutboxDispatcher(): void {
    if (
      this.outboxDispatchInterval ||
      !this.runtimeConfig.enableOutboxInterval
    ) {
      return;
    }
    this.outboxDispatchInterval = setInterval(() => {
      void this.dispatchOutboxBatch();
    }, OUTBOX_DISPATCH_INTERVAL_MS);
    this.outboxDispatchInterval.unref();
  }

  async dispatchOutboxBatch(): Promise<void> {
    await this.dispatcher.dispatchBatch();
    await this.refreshOutboxMetrics();
  }

  private async refreshOutboxMetrics(): Promise<void> {
    const backlog = await this.outboxRepository.getBacklogMetrics();

    for (const row of backlog.rows) {
      this.metrics.setOutboxBacklog(
        {
          topic: row.topic,
          status: row.status,
        },
        row.count,
      );
    }

    this.metrics.setOldestOutboxAgeSeconds(
      backlog.oldestPendingAt
        ? Math.max(0, (Date.now() - backlog.oldestPendingAt.getTime()) / 1000)
        : 0,
    );
  }
}
