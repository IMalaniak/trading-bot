import { createTradingBotMetrics } from '@trading-bot/common';
import { Registry } from 'prom-client';

import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  it('returns Prometheus text metrics', async () => {
    const metrics = createTradingBotMetrics({
      service: 'api-gateway',
      registry: new Registry(),
      collectDefaultMetrics: false,
    });
    const controller = new MetricsController(metrics);

    await expect(controller.getMetrics()).resolves.toContain(
      'trading_bot_kafka_consumer_messages_total',
    );
  });
});
