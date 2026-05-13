import {
  buildEventMetadataHeaders,
  instrumentKey,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
} from '@trading-bot/common';
import { InstrumentRegistered, MarketDataBar } from '@trading-bot/common/proto';
import { waitForCondition } from '@trading-bot/testing';
import { type Producer } from 'kafkajs';

import { ApiClient, type MarketDataBarDto } from './api-client';
import { TIMEOUTS } from './e2e-env';

export const E2E_FROM_MS = new Date('2026-05-13T09:59:00.000Z').getTime();
export const E2E_TO_MS = new Date('2026-05-13T10:01:00.000Z').getTime();

export const E2E_INSTRUMENT_ID = 'e2e-instrument-market-data-btc';
export const E2E_SYMBOL = 'BTCUSDT';
export const E2E_VENUE = 'BINANCE';
export const E2E_INTERVAL = '1m';
export const E2E_SOURCE_EVENT_ID = 'e2e-market-data-bar-1';

export const E2E_OPEN_TIME_MS = new Date('2026-05-13T10:00:00.000Z').getTime();
export const E2E_CLOSE_TIME_MS = new Date('2026-05-13T10:00:59.999Z').getTime();

export const publishInstrumentRegistered = async (
  producer: Producer,
  sourceEventId = 'e2e-instrument-registered-market-data-1',
): Promise<void> => {
  const event = InstrumentRegistered.fromPartial({
    instrument: {
      id: E2E_INSTRUMENT_ID,
      assetClass: 1, // CRYPTO
      symbol: E2E_SYMBOL,
      venue: E2E_VENUE,
      externalSymbol: E2E_SYMBOL,
    },
    registeredAt: new Date().toISOString(),
  });

  await producer.send({
    topic: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
    messages: [
      {
        key: instrumentKey(E2E_VENUE, E2E_INSTRUMENT_ID),
        value: Buffer.from(InstrumentRegistered.encode(event).finish()),
        headers: buildEventMetadataHeaders({
          eventId: sourceEventId,
          eventType: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
          occurredAt: new Date().toISOString(),
          producer: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
          schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.INSTRUMENT_REGISTERED,
        }),
      },
    ],
  });
};

export const publishMarketDataBar = async (
  producer: Producer,
  sourceEventId = E2E_SOURCE_EVENT_ID,
): Promise<void> => {
  const bar = MarketDataBar.fromPartial({
    instrumentId: E2E_INSTRUMENT_ID,
    symbol: E2E_SYMBOL,
    venue: E2E_VENUE,
    interval: E2E_INTERVAL,
    openTimeMs: E2E_OPEN_TIME_MS,
    closeTimeMs: E2E_CLOSE_TIME_MS,
    open: '60000.00',
    high: '60500.00',
    low: '59800.00',
    close: '60250.00',
    volume: '10.50',
    quoteVolume: '630000.00',
    tradeCount: 120,
    isFinal: true,
  });

  await producer.send({
    topic: KAFKA_TOPICS.MARKET_RAW_DATA,
    messages: [
      {
        key: `${E2E_VENUE}:${E2E_SYMBOL}`,
        value: Buffer.from(MarketDataBar.encode(bar).finish()),
        headers: buildEventMetadataHeaders({
          eventId: sourceEventId,
          eventType: KAFKA_TOPICS.MARKET_RAW_DATA,
          occurredAt: new Date().toISOString(),
          producer: KAFKA_EVENT_PRODUCERS.EXTERNAL_API_FACADE,
          schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.MARKET_RAW_DATA,
        }),
      },
    ],
  });
};

export const waitForBarViaApiGateway = async (
  api = new ApiClient(),
): Promise<MarketDataBarDto> => {
  let latest: MarketDataBarDto | undefined;

  await waitForCondition(
    async () => {
      const response = await api.getMarketDataBars({
        instrumentId: E2E_INSTRUMENT_ID,
        interval: E2E_INTERVAL,
        from: String(E2E_FROM_MS),
        to: String(E2E_TO_MS),
        limit: 10,
      });
      latest = response.bars.find((bar) => bar.openTimeMs === E2E_OPEN_TIME_MS);
      return latest !== undefined;
    },
    TIMEOUTS.systemFlowMs,
    `Timed out waiting for market data bar at openTimeMs=${E2E_OPEN_TIME_MS} to appear via API Gateway.`,
    500,
  );

  return latest as MarketDataBarDto;
};
