import { expect, test } from '@playwright/test';
import {
  AssetClassName,
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

const ENABLE_DISABLE_SYMBOL = 'ENABLETEST';
const api = new ApiClient();
let registeredInstrumentId: string;

const publishBuySignal = async (
  instrumentId: string,
  signalSuffix: string,
): Promise<void> => {
  const kafka = createKafka();
  const producer = kafka.producer();
  await producer.connect();

  try {
    const signal = Signal.fromPartial({
      id: `e2e-enable-disable-signal-${signalSuffix}`,
      instrumentId,
      price: 100,
      side: SignalSide.BUY,
      timestamp: new Date().getTime(),
    });

    await producer.send({
      topic: KAFKA_TOPICS.TRADING_SIGNALS,
      messages: [
        {
          headers: buildEventMetadataHeaders({
            eventId: `e2e-enable-disable-source-${signalSuffix}`,
            eventType: KAFKA_TOPICS.TRADING_SIGNALS,
            occurredAt: new Date().toISOString(),
            producer: KAFKA_EVENT_PRODUCERS.PREDICTION_ENGINE,
            schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.TRADING_SIGNALS,
          }),
          key: instrumentKey('BINANCE', instrumentId),
          value: Buffer.from(Signal.encode(signal).finish()),
        },
      ],
    });
  } finally {
    await producer.disconnect();
  }
};

test.describe('Instrument enable / disable flow', () => {
  test.beforeAll(async () => {
    try {
      const response = await api.registerPortfolioInstrument(
        SEEDED_PORTFOLIO_ID,
        {
          symbol: ENABLE_DISABLE_SYMBOL,
          assetClass: AssetClassName.CRYPTO,
          venue: 'BINANCE',
          externalSymbol: 'ENABLETESTUSDT',
          enabled: true,
          targetNotional: '100',
          maxTradeNotional: '1',
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
        (c) => c.instrument.symbol === ENABLE_DISABLE_SYMBOL,
      );
      if (!existing)
        throw new Error('Could not find registered ENABLETEST instrument', {
          cause: err,
        });
      registeredInstrumentId = existing.instrument.id;
    }

    // Ensure consistent baseline: enabled, low maxTradeNotional to prevent
    // approved orders from polluting portfolio-alpha's open position count
    await api.updatePortfolioInstrumentConfig(
      SEEDED_PORTFOLIO_ID,
      registeredInstrumentId,
      { enabled: true, maxTradeNotional: '1' },
    );
  });

  test('disabling an instrument causes BUY signal to be rejected with SUBSCRIPTION_DISABLED', async () => {
    await test.step('disable instrument', async () => {
      await api.updatePortfolioInstrumentConfig(
        SEEDED_PORTFOLIO_ID,
        registeredInstrumentId,
        { enabled: false },
      );
    });

    const suffix = `disabled-${Date.now()}`;
    await publishBuySignal(registeredInstrumentId, suffix);

    let rejectedDecision:
      | { reasonCodes: string[]; decision: string }
      | undefined;

    await test.step('wait for SUBSCRIPTION_DISABLED rejection', async () => {
      await waitForCondition(
        async () => {
          const result = await api.listRiskDecisions(SEEDED_PORTFOLIO_ID, {
            decision: 'REJECTED',
          });

          rejectedDecision = result.decisions.find(
            (d) =>
              d.instrumentId === registeredInstrumentId &&
              d.reasonCodes.includes('SUBSCRIPTION_DISABLED'),
          );

          return rejectedDecision !== undefined;
        },
        TIMEOUTS.systemFlowMs,
        'Expected SUBSCRIPTION_DISABLED rejection for disabled instrument',
        500,
      );
    });

    expect(rejectedDecision).toBeDefined();
    expect(rejectedDecision?.reasonCodes).toContain('SUBSCRIPTION_DISABLED');
  });

  test('re-enabling an instrument allows subsequent BUY signals to be processed', async () => {
    await test.step('re-enable instrument', async () => {
      await api.updatePortfolioInstrumentConfig(
        SEEDED_PORTFOLIO_ID,
        registeredInstrumentId,
        { enabled: true },
      );
    });

    const suffix = `reenabled-${Date.now()}`;
    await publishBuySignal(registeredInstrumentId, suffix);

    await test.step('wait for a non-SUBSCRIPTION_DISABLED decision', async () => {
      await waitForCondition(
        async () => {
          const result = await api.listRiskDecisions(SEEDED_PORTFOLIO_ID);

          const decision = result.decisions.find(
            (d) =>
              d.instrumentId === registeredInstrumentId &&
              !d.reasonCodes.includes('SUBSCRIPTION_DISABLED'),
          );

          return decision !== undefined;
        },
        TIMEOUTS.systemFlowMs,
        'Expected non-SUBSCRIPTION_DISABLED decision after re-enable',
        500,
      );
    });
  });

  test('audit log contains enable and disable entries', async () => {
    const auditLog = await api.listRiskConfigAuditLog(SEEDED_PORTFOLIO_ID);

    const disabledEntry = auditLog.entries.find(
      (e) => e.field === 'enabled' && e.newValue === 'false',
    );
    const enabledEntry = auditLog.entries.find(
      (e) => e.field === 'enabled' && e.newValue === 'true',
    );

    expect(disabledEntry).toBeDefined();
    expect(enabledEntry).toBeDefined();
  });
});
