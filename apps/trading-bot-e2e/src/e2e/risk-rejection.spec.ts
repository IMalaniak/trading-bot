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

const REJECTION_SYMBOL = 'REJTEST';

// maxTradeNotional is set to '1' which is less than the minimum trade size,
// so every signal will be rejected with TRADE_CAP_EXCEEDED.
const api = new ApiClient();
let registeredInstrumentId: string;

test.describe('Risk rejection flow', () => {
  test.beforeAll(async () => {
    try {
      const response = await api.registerPortfolioInstrument(
        SEEDED_PORTFOLIO_ID,
        {
          symbol: REJECTION_SYMBOL,
          assetClass: 'crypto',
          venue: 'BINANCE',
          externalSymbol: 'REJTESTUSDT',
          enabled: true,
          targetNotional: '100',
          maxTradeNotional: '1', // Tiny cap — ensures TRADE_CAP_EXCEEDED
          maxPositionNotional: '200',
        },
      );
      registeredInstrumentId = response.instrument.id;
    } catch (err) {
      // Only handle 409 Conflict (already registered) — rethrow anything else
      if (!(err instanceof Error) || !err.message.includes('409')) throw err;
      // Already registered — find the existing instrument ID
      const portfolio = await api.getPortfolio(SEEDED_PORTFOLIO_ID);
      const existing = portfolio.configuredInstruments.find(
        (c) => c.instrument.symbol === REJECTION_SYMBOL,
      );
      if (!existing)
        throw new Error('Could not find registered REJTEST instrument', {
          cause: err,
        });
      registeredInstrumentId = existing.instrument.id;
    }
  });

  test('BUY signal for capped instrument is rejected with TRADE_CAP_EXCEEDED', async () => {
    const kafka = createKafka();
    const producer = kafka.producer();
    await producer.connect();

    const signalId = `e2e-rejection-signal-${Date.now()}`;
    const sourceEventId = `e2e-rejection-source-${Date.now()}`;

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

      let rejectedDecision:
        | { reasonCodes: string[]; decision: string }
        | undefined;

      await waitForCondition(
        async () => {
          const result = await api.listRiskDecisions(SEEDED_PORTFOLIO_ID, {
            decision: 'REJECTED',
          });

          rejectedDecision = result.decisions.find(
            (d) => d.instrumentId === registeredInstrumentId,
          );

          return rejectedDecision !== undefined;
        },
        TIMEOUTS.systemFlowMs,
        'Expected REJECTED decision for capped instrument',
        500,
      );

      expect(rejectedDecision).toBeDefined();
      expect(rejectedDecision?.decision).toBe('REJECTED');
      expect(rejectedDecision?.reasonCodes).toContain('TRADE_CAP_EXCEEDED');
    } finally {
      await producer.disconnect();
    }
  });
});
