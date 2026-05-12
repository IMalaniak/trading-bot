import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ClientKafka } from '@nestjs/microservices';
import { Counter, Gauge } from 'prom-client';

import { externalApiFacadeRuntimeConfig } from '../config/runtime.config';
import { BinanceWebSocketClient } from './binance-ws-client';
import { EXTERNAL_API_FACADE_KAFKA_CLIENT } from './const';
import { KafkaMarketDataPublisher } from './kafka-market-data-publisher';
import { SubscriptionManager } from './subscription-manager';

@Injectable()
export class FacadeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FacadeService.name);

  private readonly subscriptionManager: SubscriptionManager;
  private readonly wsClients = new Map<string, BinanceWebSocketClient>();

  // Prometheus metrics
  private readonly activeSubscriptionsGauge: Gauge;
  private readonly messagesPublishedCounter: Counter;
  private readonly reconnectCounter: Counter;

  constructor(
    @Inject(EXTERNAL_API_FACADE_KAFKA_CLIENT)
    private readonly kafkaClient: ClientKafka,
    @Inject(externalApiFacadeRuntimeConfig.KEY)
    private readonly runtimeConfig: ConfigType<
      typeof externalApiFacadeRuntimeConfig
    >,
  ) {
    this.activeSubscriptionsGauge = new Gauge({
      name: 'external_api_facade_active_subscriptions',
      help: 'Number of currently active Binance kline stream subscriptions',
    });
    this.messagesPublishedCounter = new Counter({
      name: 'external_api_facade_messages_published_total',
      help: 'Total number of market data bars published to Kafka',
      labelNames: ['symbol', 'interval'],
    });
    this.reconnectCounter = new Counter({
      name: 'external_api_facade_ws_reconnects_total',
      help: 'Total number of WebSocket reconnect attempts',
      labelNames: ['symbol'],
    });

    this.subscriptionManager = new SubscriptionManager(
      (instrumentId, symbol, venue, intervals): Promise<void> => {
        for (const interval of intervals) {
          this.openStream(instrumentId, symbol, venue, interval);
        }
        return Promise.resolve();
      },
      (instrumentId): Promise<void> => {
        this.closeStream(instrumentId);
        return Promise.resolve();
      },
    );
  }

  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
  }

  async onModuleDestroy(): Promise<void> {
    for (const instrumentId of this.subscriptionManager.activeSubscriptions()) {
      await this.subscriptionManager.unsubscribe(instrumentId);
    }
    await this.kafkaClient.close();
  }

  async startSubscription(
    instrumentId: string,
    symbol: string,
    venue: string,
    intervals: string[],
  ): Promise<boolean> {
    const resolvedIntervals =
      intervals.length > 0
        ? intervals
        : this.runtimeConfig.binanceDefaultIntervals;

    if (this.subscriptionManager.isSubscribed(instrumentId)) {
      return false;
    }

    await this.subscriptionManager.subscribe(
      instrumentId,
      symbol,
      venue,
      resolvedIntervals,
    );

    this.activeSubscriptionsGauge.set(
      this.subscriptionManager.activeSubscriptions().length,
    );
    this.logger.log(
      `Started subscription: instrumentId=${instrumentId} symbol=${symbol} intervals=${resolvedIntervals.join(',')}`,
    );
    return true;
  }

  async stopSubscription(instrumentId: string): Promise<boolean> {
    if (!this.subscriptionManager.isSubscribed(instrumentId)) {
      return false;
    }
    await this.subscriptionManager.unsubscribe(instrumentId);
    this.activeSubscriptionsGauge.set(
      this.subscriptionManager.activeSubscriptions().length,
    );
    this.logger.log(`Stopped subscription: instrumentId=${instrumentId}`);
    return true;
  }

  private openStream(
    instrumentId: string,
    symbol: string,
    venue: string,
    interval: string,
  ): void {
    const wsClient = new BinanceWebSocketClient({
      testnet: this.runtimeConfig.binanceTestnet,
    });

    const publisher = new KafkaMarketDataPublisher(
      this.kafkaClient,
      instrumentId,
    );

    wsClient.connect(
      symbol,
      interval,
      (bar) => {
        publisher.publish(bar);
        this.messagesPublishedCounter
          .labels({ symbol: bar.symbol, interval: bar.interval })
          .inc();
      },
      venue,
    );

    this.wsClients.set(`${instrumentId}:${interval}`, wsClient);
  }

  private closeStream(instrumentId: string): void {
    const keysToRemove = [...this.wsClients.keys()].filter((k) =>
      k.startsWith(`${instrumentId}:`),
    );
    for (const key of keysToRemove) {
      this.wsClients.get(key)?.disconnect();
      this.wsClients.delete(key);
    }
  }
}
