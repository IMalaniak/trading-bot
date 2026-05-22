import { expect, test } from '@playwright/test';
import {
  buildEventMetadataHeaders,
  instrumentKey,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
} from '@trading-bot/common';
import { Signal, SignalSide } from '@trading-bot/common/proto';
import { waitForCondition } from '@trading-bot/testing';

import { ApiClient } from '../support/api-client';
import { TIMEOUTS } from '../support/e2e-env';
import {
  createKafka,
  SEEDED_PORTFOLIO_ID,
} from '../support/signal-to-portfolio-flow';

test.describe.configure({ mode: 'serial' });

const STRATEGY_FILTER_SYMBOL = 'STRATTEST';
const api = new ApiClient();
let registeredInstrumentId: string;

test.describe('Strategy signal filter (SELL-only strategy rejects BUY)', () => {
  let createdStrategyId: string;

  test.beforeAll(async () => {
    // Register a dedicated instrument
    try {
      const response = await api.registerPortfolioInstrument(
        SEEDED_PORTFOLIO_ID,
        {
          symbol: STRATEGY_FILTER_SYMBOL,
          assetClass: 'crypto',
          venue: 'BINANCE',
          externalSymbol: 'STRATTESTUSDT',
          enabled: true,
          targetNotional: '100',
          maxTradeNotional: '500',
          maxPositionNotional: '2000',
        },
      );
      registeredInstrumentId = response.instrument.id;
    } catch (err) {
      // Only handle 409 Conflict (already registered) — rethrow anything else
      if (!(err instanceof Error) || !err.message.includes('409')) throw err;
      // Already registered — find the existing instrument ID
      const portfolio = await api.getPortfolio(SEEDED_PORTFOLIO_ID);
      const existing = portfolio.configuredInstruments.find(
        (c) => c.instrument.symbol === STRATEGY_FILTER_SYMBOL,
      );
      if (!existing)
        throw new Error('Could not find registered STRATTEST instrument', {
          cause: err,
        });
      registeredInstrumentId = existing.instrument.id;
    }

    // Create a SELL-only strategy
    const strategy = await api.createStrategy({
      name: 'e2e-sell-only-strategy',
      allowedSides: [SignalSide.SELL], // 2 = SELL
    });
    createdStrategyId = strategy.id;

    // Assign strategy to portfolio
    await api.assignStrategy(SEEDED_PORTFOLIO_ID, {
      strategyId: createdStrategyId,
    });
  });

  test.afterAll(async () => {
    // Unassign strategy to restore portfolio to default state
    try {
      await api.assignStrategy(SEEDED_PORTFOLIO_ID, { strategyId: null });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('BUY signal is rejected with STRATEGY_SIDE_FILTER when portfolio has SELL-only strategy', async () => {
    const kafka = createKafka();
    const producer = kafka.producer();
    await producer.connect();

    const signalId = `e2e-strategy-filter-signal-${Date.now()}`;
    const sourceEventId = `e2e-strategy-filter-source-${Date.now()}`;

    try {
      const signal = Signal.fromPartial({
        id: signalId,
        instrumentId: registeredInstrumentId,
        price: 100,
        side: SignalSide.BUY,
        timestamp: new Date().getTime(),
      });

      await producer.send({
        topic: KAFKA_TOPICS.TRADING_SIGNALS,
        messages: [
          {
            headers: buildEventMetadataHeaders({
              eventId: sourceEventId,
              eventType: KAFKA_TOPICS.TRADING_SIGNALS,
              occurredAt: new Date().toISOString(),
              producer: KAFKA_EVENT_PRODUCERS.PREDICTION_ENGINE,
              schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.TRADING_SIGNALS,
            }),
            key: instrumentKey('BINANCE', registeredInstrumentId),
            value: Buffer.from(Signal.encode(signal).finish()),
          },
        ],
      });

      let filteredDecision:
        | { reasonCodes: string[]; decision: string }
        | undefined;

      await waitForCondition(
        async () => {
          const result = await api.listRiskDecisions(SEEDED_PORTFOLIO_ID, {
            decision: 'REJECTED',
          });

          filteredDecision = result.decisions.find(
            (d) =>
              d.instrumentId === registeredInstrumentId &&
              d.reasonCodes.includes('STRATEGY_SIDE_FILTER'),
          );

          return filteredDecision !== undefined;
        },
        TIMEOUTS.systemFlowMs,
        'Expected STRATEGY_SIDE_FILTER rejection for BUY signal with SELL-only strategy',
        500,
      );

      expect(filteredDecision).toBeDefined();
      expect(filteredDecision?.decision).toBe('REJECTED');
      expect(filteredDecision?.reasonCodes).toContain('STRATEGY_SIDE_FILTER');
    } finally {
      await producer.disconnect();
    }
  });
});
