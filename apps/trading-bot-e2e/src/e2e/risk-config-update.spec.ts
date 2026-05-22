import { expect, test } from '@playwright/test';
import { AssetClassName } from '@trading-bot/common';

import { ApiClient } from '../support/api-client';
import { SEEDED_PORTFOLIO_ID } from '../support/signal-to-portfolio-flow';

test.describe.configure({ mode: 'serial' });

const RISK_E2E_SYMBOL = 'RISK-E2E';
const api = new ApiClient();
let registeredInstrumentId: string;

test.describe('Risk config PATCH and audit log', () => {
  test.beforeAll(async () => {
    try {
      const response = await api.registerPortfolioInstrument(
        SEEDED_PORTFOLIO_ID,
        {
          symbol: RISK_E2E_SYMBOL,
          assetClass: AssetClassName.CRYPTO,
          venue: 'BINANCE',
          externalSymbol: 'RISKTESTUSDT',
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
        (c) => c.instrument.symbol === RISK_E2E_SYMBOL,
      );
      if (!existing)
        throw new Error('Could not find registered RISK-E2E instrument', {
          cause: err,
        });
      registeredInstrumentId = existing.instrument.id;
    }

    // Reset to a known baseline so test 1 always produces an audit entry
    await api.updatePortfolioInstrumentConfig(
      SEEDED_PORTFOLIO_ID,
      registeredInstrumentId,
      { maxTradeNotional: '500' },
    );
  });

  test('PATCH instrument config updates maxTradeNotional, reflected in audit log', async () => {
    await test.step('update maxTradeNotional to 250', async () => {
      const result = await api.updatePortfolioInstrumentConfig(
        SEEDED_PORTFOLIO_ID,
        registeredInstrumentId,
        { maxTradeNotional: '250' },
      );

      expect(result.instrument).toBeTruthy();
      expect(result.maxTradeNotional).toBe('250');
    });

    await test.step('audit log contains the update', async () => {
      const auditLog = await api.listRiskConfigAuditLog(SEEDED_PORTFOLIO_ID);

      const entry = auditLog.entries.find(
        (e) => e.field === 'maxTradeNotional' && e.newValue === '250',
      );

      expect(entry).toBeDefined();
      expect(entry?.oldValue).toBeDefined();
    });
  });

  test('PATCH portfolio updates exposureCapNotional, reflected in audit log', async () => {
    const originalPortfolio = await api.listPortfolios();
    const portfolio = originalPortfolio.portfolios.find(
      (p) => p.portfolioId === SEEDED_PORTFOLIO_ID,
    );
    const originalCap = portfolio?.exposureCapNotional ?? '10000';

    const newCap = String(Number(originalCap) + 1000);

    await test.step(`update exposureCapNotional to ${newCap}`, async () => {
      const updated = await api.updatePortfolio(SEEDED_PORTFOLIO_ID, {
        exposureCapNotional: newCap,
      });

      expect(updated.exposureCapNotional).toBe(newCap);
    });

    await test.step('audit log contains the portfolio update', async () => {
      const auditLog = await api.listRiskConfigAuditLog(SEEDED_PORTFOLIO_ID);

      const entry = auditLog.entries.find(
        (e) =>
          e.field === 'exposureCapNotional' &&
          e.newValue === newCap &&
          e.entityType === 'PORTFOLIO',
      );

      expect(entry).toBeDefined();
    });

    // Restore original value to avoid side effects on other tests
    await api.updatePortfolio(SEEDED_PORTFOLIO_ID, {
      exposureCapNotional: originalCap,
    });
  });
});
