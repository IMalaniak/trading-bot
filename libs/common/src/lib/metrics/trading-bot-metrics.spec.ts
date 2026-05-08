import { Registry } from 'prom-client';

import { createTradingBotMetrics } from './trading-bot-metrics';

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
});
