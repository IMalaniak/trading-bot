import {
  buildEventMetadataHeaders,
  instrumentKey,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
  portfolioKey,
} from '@trading-bot/common';
import { OrderFill, Signal, SignalSide } from '@trading-bot/common/proto';
import { waitForCondition } from '@trading-bot/testing';
import { Kafka, logLevel, type Producer } from 'kafkajs';

import {
  ApiClient,
  type ExecutionOrderDto,
  type PortfolioReadResponseDto,
} from './api-client';
import { KAFKA_BROKERS, TIMEOUTS } from './e2e-env';

export const SEEDED_PORTFOLIO_ID = 'portfolio-alpha';
export const SEEDED_INSTRUMENT_ID = 'seed-instrument-btc-usdt';
export const SIGNAL_ID = 'e2e-signal-1';
export const SOURCE_EVENT_ID = 'e2e-source-event-1';

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
        latest.summary.aggregateExposureNotional === '100' &&
        latest.summary.openPositionCount === 1 &&
        btcPosition?.quantity === '1' &&
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

export interface PortfolioSnapshot {
  aggregateExposureNotional: string;
  openPositionCount: number;
  positions: Array<{
    exposureNotional: string;
    instrumentId: string;
    lastFillId: string;
    quantity: string;
  }>;
  recentOrders: Array<{
    fillIds: string[];
    orderId: string;
    status: string;
  }>;
}

export const summarizePortfolio = (
  portfolio: PortfolioReadResponseDto,
): PortfolioSnapshot => ({
  aggregateExposureNotional: portfolio.summary.aggregateExposureNotional,
  openPositionCount: portfolio.summary.openPositionCount,
  positions: portfolio.positions
    .map((position) => ({
      exposureNotional: position.exposureNotional,
      instrumentId: position.instrument.id,
      lastFillId: position.lastFillId,
      quantity: position.quantity,
    }))
    .sort((left, right) => left.instrumentId.localeCompare(right.instrumentId)),
  recentOrders: portfolio.recentOrders
    .map((order) => ({
      fillIds: order.fills.map((fill) => fill.fillId).sort(),
      orderId: order.orderId,
      status: order.status,
    }))
    .sort((left, right) => left.orderId.localeCompare(right.orderId)),
});

export const findSignalOrder = (
  portfolio: PortfolioReadResponseDto,
): ExecutionOrderDto => {
  const order = portfolio.recentOrders.find(
    (candidate) =>
      candidate.instrumentId === SEEDED_INSTRUMENT_ID &&
      candidate.signalId === SIGNAL_ID,
  );

  if (!order) {
    throw new Error('Expected a recent execution order for the e2e signal.');
  }

  return order;
};

export const sleep = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
};
