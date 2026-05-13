import { expect, test } from '@playwright/test';

import { ApiClient } from '../support/api-client';
import {
  E2E_FROM_MS,
  E2E_INSTRUMENT_ID,
  E2E_INTERVAL,
  E2E_OPEN_TIME_MS,
  E2E_SOURCE_EVENT_ID,
  E2E_SYMBOL,
  E2E_TO_MS,
  E2E_VENUE,
  publishInstrumentRegistered,
  publishMarketDataBar,
  waitForBarViaApiGateway,
} from '../support/market-data-flow';
import { createKafka } from '../support/signal-to-portfolio-flow';

test.describe.configure({ mode: 'serial' });

test('market data bar flows from Kafka into TimescaleDB and is queryable via API Gateway', async () => {
  const api = new ApiClient();
  const kafka = createKafka();
  const producer = kafka.producer();

  await producer.connect();

  try {
    await test.step('publish instrument.registered event to trigger subscription', async () => {
      await publishInstrumentRegistered(producer);
    });

    await test.step('publish synthetic MarketDataBar to market.raw.data', async () => {
      await publishMarketDataBar(producer);
    });

    const bar =
      await test.step('bar is returned by GET /api/market-data/bars', async () => {
        return await waitForBarViaApiGateway(api);
      });

    await test.step('bar fields match the published MarketDataBar', () => {
      expect(bar.instrumentId).toBe(E2E_INSTRUMENT_ID);
      expect(bar.symbol).toBe(E2E_SYMBOL);
      expect(bar.venue).toBe(E2E_VENUE);
      expect(bar.interval).toBe(E2E_INTERVAL);
      expect(bar.openTimeMs).toBe(E2E_OPEN_TIME_MS);
      expect(Number(bar.open)).toBeCloseTo(60000, 0);
      expect(Number(bar.high)).toBeCloseTo(60500, 0);
      expect(Number(bar.low)).toBeCloseTo(59800, 0);
      expect(Number(bar.close)).toBeCloseTo(60250, 0);
      expect(Number(bar.volume)).toBeCloseTo(10.5, 2);
    });

    await test.step('duplicate market.raw.data event does not create a second bar', async () => {
      await publishMarketDataBar(producer, E2E_SOURCE_EVENT_ID);
      // Allow time for a second write to propagate if idempotency were broken
      await new Promise((resolve) => setTimeout(resolve, 2_000));

      const response = await api.getMarketDataBars({
        instrumentId: E2E_INSTRUMENT_ID,
        interval: E2E_INTERVAL,
        from: String(E2E_FROM_MS),
        to: String(E2E_TO_MS),
        limit: 50,
      });
      const matchingBars = response.bars.filter(
        (b) => b.openTimeMs === E2E_OPEN_TIME_MS,
      );
      expect(matchingBars).toHaveLength(1);
    });

    await test.step('bar is accessible via time-range query GET /api/market-data/bars with explicit from/to', async () => {
      const response = await api.getMarketDataBars({
        instrumentId: E2E_INSTRUMENT_ID,
        interval: E2E_INTERVAL,
        from: String(E2E_FROM_MS),
        to: String(E2E_TO_MS),
        limit: 10,
      });
      const found = response.bars.find(
        (b) => b.openTimeMs === E2E_OPEN_TIME_MS,
      );
      expect(found).toBeDefined();
    });
  } finally {
    await producer.disconnect();
  }
});
