import { Test } from '@nestjs/testing';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { register, Registry } from 'prom-client';

import {
  createTradingBotMetrics,
  TRADING_BOT_METRICS,
  TradingBotMetrics,
  TradingBotMetricsModule,
} from './trading-bot-metrics';

describe('TradingBotMetrics', () => {
  it('records consumer and outbox metrics in an isolated registry', async () => {
    const metrics = createTradingBotMetrics({
      service: 'portfolio-manager',
      registry: new Registry(),
      collectDefaultMetrics: false,
    });

    metrics.recordConsumerRetry({
      topic: 'orders.fills',
      consumerGroup: 'portfolio-manager-order-fills',
    });
    metrics.recordDeadLetter({
      topic: 'orders.fills',
      consumerGroup: 'portfolio-manager-order-fills',
      dlqTopic: 'orders.fills.dlq',
    });
    metrics.recordConsumerMessage(
      {
        topic: 'orders.fills',
        consumerGroup: 'portfolio-manager-order-fills',
      },
      'dlq',
      1.25,
    );
    metrics.recordOutboxDispatch({ topic: 'portfolio.updated' }, 'failure');
    metrics.setOutboxBacklog(
      { topic: 'portfolio.updated', status: 'FAILED' },
      2,
    );
    metrics.setOldestOutboxAgeSeconds(30);

    await expect(metrics.metrics()).resolves.toContain(
      'trading_bot_kafka_consumer_retries_total{service="portfolio-manager",topic="orders.fills",consumer_group="portfolio-manager-order-fills"} 1',
    );
    await expect(metrics.metrics()).resolves.toContain(
      'trading_bot_kafka_consumer_dlq_messages_total{service="portfolio-manager",topic="orders.fills",consumer_group="portfolio-manager-order-fills",dlq_topic="orders.fills.dlq"} 1',
    );
    await expect(metrics.metrics()).resolves.toContain(
      'trading_bot_outbox_backlog{service="portfolio-manager",topic="portfolio.updated",status="FAILED"} 2',
    );
    await expect(metrics.metrics()).resolves.toContain(
      'trading_bot_outbox_oldest_pending_age_seconds{service="portfolio-manager"} 30',
    );
  });

  it('registers application metrics in the Nest Prometheus registry', async () => {
    register.clear();

    const moduleRef = await Test.createTestingModule({
      imports: [TradingBotMetricsModule.forRoot('portfolio-manager')],
    }).compile();

    try {
      const metrics = moduleRef.get<TradingBotMetrics>(TRADING_BOT_METRICS);

      metrics.recordConsumerRetry({
        topic: 'orders.fills',
        consumerGroup: 'portfolio-manager-order-fills',
      });

      const controller = moduleRef.get(PrometheusController, {
        strict: false,
      });
      const response = { header: jest.fn() };

      await expect(controller.index(response)).resolves.toContain(
        'trading_bot_kafka_consumer_retries_total{service="portfolio-manager",topic="orders.fills",consumer_group="portfolio-manager-order-fills"} 1',
      );
      expect(response.header).toHaveBeenCalledWith(
        'Content-Type',
        register.contentType,
      );
    } finally {
      await moduleRef.close();
      register.clear();
    }
  });
});
