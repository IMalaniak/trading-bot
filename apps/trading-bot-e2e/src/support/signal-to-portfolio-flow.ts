import {
  buildEventMetadataHeaders,
  instrumentKey,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
  portfolioKey,
} from '@trading-bot/common';
import {
  MarketDataBar,
  OrderFill,
  Signal,
  SignalSide,
} from '@trading-bot/common/proto';
import { waitForCondition } from '@trading-bot/testing';
import { Kafka, logLevel, type Producer } from 'kafkajs';

import { ApiClient, type PortfolioReadResponseDto } from './api-client';
import { KAFKA_BROKERS, TIMEOUTS } from './e2e-env';

export const SEEDED_PORTFOLIO_ID = 'portfolio-alpha';
export const SEEDED_INSTRUMENT_ID = 'seed-instrument-btc-usdt';
export const SIGNAL_ID = 'e2e-signal-1';
export const SOURCE_EVENT_ID = 'e2e-source-event-1';
export const PREDICTION_E2E_SYMBOL = 'BTCUSDT';
export const PREDICTION_E2E_VENUE = 'BINANCE';
export const PREDICTION_E2E_INTERVAL = '1m';
export const PREDICTION_E2E_CORRELATION_ID = 'e2e-prediction-workflow-1';
export const PREDICTION_E2E_BASE_OPEN_TIME_MS = new Date(
  '2026-05-14T12:00:00.000Z',
).getTime();
export const PREDICTION_E2E_READY_INDEX = 34;

export const createKafka = (): Kafka =>
  new Kafka({
    brokers: KAFKA_BROKERS.split(','),
    clientId: 'trading-bot-e2e',
    logLevel: logLevel.NOTHING,
  });

export const publishPortfolioSignal = async (
  producer: Producer,
  sourceEventId = SOURCE_EVENT_ID,
): Promise<void> => {
  const signal = Signal.fromPartial({
    id: SIGNAL_ID,
    instrumentId: SEEDED_INSTRUMENT_ID,
    price: 100,
    side: SignalSide.BUY,
    timestamp: new Date('2026-03-25T12:00:00.000Z').getTime(),
  });

  await producer.send({
    messages: [
      {
        headers: buildEventMetadataHeaders({
          eventId: sourceEventId,
          eventType: KAFKA_TOPICS.TRADING_SIGNALS,
          occurredAt: new Date().toISOString(),
          producer: KAFKA_EVENT_PRODUCERS.PREDICTION_ENGINE,
          schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.TRADING_SIGNALS,
        }),
        key: instrumentKey('BINANCE', SEEDED_INSTRUMENT_ID),
        value: Buffer.from(Signal.encode(signal).finish()),
      },
    ],
    topic: KAFKA_TOPICS.TRADING_SIGNALS,
  });
};

export const publishPredictionPipelineBars = async (
  producer: Producer,
  count = PREDICTION_E2E_READY_INDEX + 1,
): Promise<void> => {
  await producer.send({
    topic: KAFKA_TOPICS.MARKET_RAW_DATA,
    messages: Array.from({ length: count }, (_, index) =>
      buildPredictionPipelineMarketDataMessage(index),
    ),
  });
};

export const publishDuplicateReadyPredictionBar = async (
  producer: Producer,
): Promise<void> => {
  await producer.send({
    topic: KAFKA_TOPICS.MARKET_RAW_DATA,
    messages: [
      buildPredictionPipelineMarketDataMessage(PREDICTION_E2E_READY_INDEX),
    ],
  });
};

export const publishFillReplay = async (
  producer: Producer,
  fill: OrderFill,
): Promise<void> => {
  await producer.send({
    messages: [
      {
        headers: buildEventMetadataHeaders({
          eventId: fill.fillId,
          eventType: KAFKA_TOPICS.ORDERS_FILLS,
          occurredAt: fill.filledAt,
          producer: KAFKA_EVENT_PRODUCERS.EXECUTION_ENGINE,
          schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.ORDERS_FILLS,
        }),
        key: portfolioKey(fill.portfolioId),
        value: Buffer.from(OrderFill.encode(fill).finish()),
      },
    ],
    topic: KAFKA_TOPICS.ORDERS_FILLS,
  });
};

export const waitForPortfolioReconciliationState = async (
  api = new ApiClient(),
): Promise<PortfolioReadResponseDto> => {
  let latest: PortfolioReadResponseDto | undefined;

  await waitForCondition(
    async () => {
      latest = await api.getPortfolio(SEEDED_PORTFOLIO_ID);
      const btcPosition = latest.positions.find(
        (position) => position.instrument.id === SEEDED_INSTRUMENT_ID,
      );
      const filledOrder = latest.recentOrders.find(
        (order) =>
          order.instrumentId === SEEDED_INSTRUMENT_ID &&
          order.status === 'FILLED' &&
          order.fills.length === 2,
      );

      return (
        decimalCloseTo(latest.summary.aggregateExposureNotional, 100) &&
        latest.summary.openPositionCount === 1 &&
        decimalCloseTo(btcPosition?.exposureNotional, 100) &&
        filledOrder !== undefined
      );
    },
    TIMEOUTS.systemFlowMs,
    'Timed out waiting for the signal-to-portfolio reconciliation state to reach the portfolio read API.',
    500,
  );

  if (!latest) {
    throw new Error('Portfolio state was not loaded.');
  }

  return latest;
};

const buildPredictionPipelineMarketDataMessage = (
  index: number,
): {
  key: string;
  value: Buffer;
  headers: Record<string, string>;
} => {
  const openTimeMs = PREDICTION_E2E_BASE_OPEN_TIME_MS + index * 60_000;
  const closeTimeMs = openTimeMs + 59_999;
  const close = 100 + index;
  const sourceEventId = `e2e-prediction-market-data-${index}`;

  const bar = MarketDataBar.fromPartial({
    instrumentId: SEEDED_INSTRUMENT_ID,
    symbol: PREDICTION_E2E_SYMBOL,
    venue: PREDICTION_E2E_VENUE,
    interval: PREDICTION_E2E_INTERVAL,
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
    key: instrumentKey(PREDICTION_E2E_VENUE, SEEDED_INSTRUMENT_ID),
    value: Buffer.from(MarketDataBar.encode(bar).finish()),
    headers: buildEventMetadataHeaders({
      eventId: sourceEventId,
      eventType: KAFKA_TOPICS.MARKET_RAW_DATA,
      occurredAt: new Date().toISOString(),
      producer: KAFKA_EVENT_PRODUCERS.EXTERNAL_API_FACADE,
      schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.MARKET_RAW_DATA,
      correlationId: PREDICTION_E2E_CORRELATION_ID,
    }),
  };
};

const decimalCloseTo = (
  value: string | undefined,
  expected: number,
  precision = 6,
): boolean => {
  if (value === undefined) {
    return false;
  }

  return Math.abs(Number.parseFloat(value) - expected) < 10 ** -precision;
};
