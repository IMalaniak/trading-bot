import {
  buildEventMetadataHeaders,
  instrumentKey,
  KAFKA_EVENT_HEADER_NAMES,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
} from '@trading-bot/common';
import {
  IndicatorFeatureVector,
  MarketDataBar,
} from '@trading-bot/common/proto';
import { waitForCondition } from '@trading-bot/testing';
import type { Consumer, EachMessagePayload, Producer } from 'kafkajs';

import { TIMEOUTS } from './e2e-env';

export const FEATURE_E2E_INSTRUMENT_ID = 'e2e-feature-engineering-btc';
export const FEATURE_E2E_SYMBOL = 'BTCUSDT';
export const FEATURE_E2E_VENUE = 'BINANCE';
export const FEATURE_E2E_INTERVAL = '1m';
export const FEATURE_E2E_CORRELATION_ID = 'e2e-feature-workflow-1';
export const FEATURE_E2E_BASE_OPEN_TIME_MS = new Date(
  '2026-05-14T10:00:00.000Z',
).getTime();

export const FEATURE_E2E_READY_INDEX = 34;
export const FEATURE_E2E_READY_OPEN_TIME_MS =
  FEATURE_E2E_BASE_OPEN_TIME_MS + FEATURE_E2E_READY_INDEX * 60_000;
export const FEATURE_E2E_READY_SOURCE_EVENT_ID = `e2e-feature-market-data-${FEATURE_E2E_READY_INDEX}`;
export const FEATURE_E2E_EXPECTED_VECTOR_ID = `feat:${FEATURE_E2E_INSTRUMENT_ID}:${FEATURE_E2E_INTERVAL}:${FEATURE_E2E_READY_OPEN_TIME_MS}:core-v1`;

export interface ReceivedFeatureVector {
  vector: IndicatorFeatureVector;
  headers: Record<string, string>;
  key?: string;
}

export const publishFeatureEngineeringBars = async (
  producer: Producer,
  count = FEATURE_E2E_READY_INDEX + 1,
): Promise<void> => {
  await producer.send({
    topic: KAFKA_TOPICS.MARKET_RAW_DATA,
    messages: Array.from({ length: count }, (_, index) =>
      buildFeatureEngineeringMarketDataMessage(index),
    ),
  });
};

export const publishDuplicateReadyFeatureBar = async (
  producer: Producer,
): Promise<void> => {
  await producer.send({
    topic: KAFKA_TOPICS.MARKET_RAW_DATA,
    messages: [
      buildFeatureEngineeringMarketDataMessage(FEATURE_E2E_READY_INDEX),
    ],
  });
};

export const collectFeatureVectors = async (
  consumer: Consumer,
  received: ReceivedFeatureVector[],
): Promise<void> => {
  await consumer.subscribe({
    topic: KAFKA_TOPICS.FEATURES_INDICATORS,
    fromBeginning: true,
  });

  await consumer.run({
    eachMessage: ({ message }: EachMessagePayload) => {
      if (!message.value) {
        return Promise.resolve();
      }

      const vector = IndicatorFeatureVector.decode(message.value);
      if (
        vector.instrumentId !== FEATURE_E2E_INSTRUMENT_ID ||
        vector.id !== FEATURE_E2E_EXPECTED_VECTOR_ID
      ) {
        return Promise.resolve();
      }

      received.push({
        vector,
        headers: normalizeKafkaHeaders(message.headers),
        key: message.key?.toString(),
      });

      return Promise.resolve();
    },
  });
};

export const waitForFeatureVectorCount = async (
  received: ReceivedFeatureVector[],
  count: number,
): Promise<ReceivedFeatureVector[]> => {
  await waitForCondition(
    () => received.length >= count,
    TIMEOUTS.systemFlowMs,
    `Timed out waiting for ${count} ${KAFKA_TOPICS.FEATURES_INDICATORS} event(s) with id=${FEATURE_E2E_EXPECTED_VECTOR_ID}.`,
    500,
  );

  return received.slice(0, count);
};

export const expectedCoreFeatureNames = (): string[] => [
  'sma.close.20',
  'ema.close.12',
  'ema.close.26',
  'rsi.close.14',
  'macd.close.12_26_9',
  'macd_signal.close.12_26_9',
  'macd_histogram.close.12_26_9',
  'return.close.1',
  'volatility.log_return.20',
];

const buildFeatureEngineeringMarketDataMessage = (
  index: number,
): {
  key: string;
  value: Buffer;
  headers: Record<string, string>;
} => {
  const openTimeMs = FEATURE_E2E_BASE_OPEN_TIME_MS + index * 60_000;
  const closeTimeMs = openTimeMs + 59_999;
  const close = 100 + index;
  const sourceEventId = `e2e-feature-market-data-${index}`;

  const bar = MarketDataBar.fromPartial({
    instrumentId: FEATURE_E2E_INSTRUMENT_ID,
    symbol: FEATURE_E2E_SYMBOL,
    venue: FEATURE_E2E_VENUE,
    interval: FEATURE_E2E_INTERVAL,
    openTimeMs,
    closeTimeMs,
    open: String(close - 0.5),
    high: String(close + 1),
    low: String(close - 1),
    close: String(close),
    volume: '1',
    quoteVolume: String(close),
    tradeCount: 1,
    isFinal: true,
  });

  return {
    key: instrumentKey(FEATURE_E2E_VENUE, FEATURE_E2E_INSTRUMENT_ID),
    value: Buffer.from(MarketDataBar.encode(bar).finish()),
    headers: buildEventMetadataHeaders({
      eventId: sourceEventId,
      eventType: KAFKA_TOPICS.MARKET_RAW_DATA,
      occurredAt: new Date().toISOString(),
      producer: KAFKA_EVENT_PRODUCERS.EXTERNAL_API_FACADE,
      schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.MARKET_RAW_DATA,
      correlationId: FEATURE_E2E_CORRELATION_ID,
    }),
  };
};

const normalizeKafkaHeaders = (
  headers: EachMessagePayload['message']['headers'],
): Record<string, string> => {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value === undefined) {
      continue;
    }

    normalized[key] = Buffer.isBuffer(value)
      ? value.toString()
      : Array.isArray(value)
        ? value.map((entry) => entry.toString()).join(',')
        : value.toString();
  }

  return normalized;
};

export const featureHeader = (
  message: ReceivedFeatureVector,
  name: (typeof KAFKA_EVENT_HEADER_NAMES)[keyof typeof KAFKA_EVENT_HEADER_NAMES],
): string | undefined => message.headers[name];
