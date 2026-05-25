import { expect, test } from '@playwright/test';
import { SignalSide } from '@trading-bot/common/proto';

import { ApiClient } from '../support/api-client';
import { openSeededPortfolio } from '../support/dashboard-page';
import { SEEDED_PORTFOLIO_ID } from '../support/signal-to-portfolio-flow';

test.describe.configure({ mode: 'serial' });

const api = new ApiClient();
let createdStrategyId: string;

test.describe('Strategy assignment (full UI → backend cycle)', () => {
  test.beforeAll(async () => {
    // Ensure no strategy is assigned before the suite runs
    await api.assignStrategy(SEEDED_PORTFOLIO_ID, { strategyId: null });

    const strategy = await api.createStrategy({
      name: 'e2e-ui-sell-only',
      allowedSides: [SignalSide.SELL],
    });
    createdStrategyId = strategy.id;
  });

  test.afterAll(async () => {
    // Restore portfolio to no-strategy state
    try {
      await api.assignStrategy(SEEDED_PORTFOLIO_ID, { strategyId: null });
    } catch {
      // ignore cleanup errors
    }
  });

  test('strategy badge is absent before assignment', async ({ page }) => {
    await openSeededPortfolio(page);

    const summary = page.locator(
      'section[aria-labelledby="portfolio-summary"]',
    );
    await expect(summary.getByText(/strategy/i)).not.toBeVisible();
  });

  test('assigning a strategy via the UI dropdown shows the strategy badge', async ({
    page,
  }) => {
    await openSeededPortfolio(page);

    // Select the strategy in the assignment control
    const select = page.getByRole('combobox', { name: /assigned strategy/i });
    await expect(select).toBeVisible();
    await select.selectOption(createdStrategyId);

    // Wait for the badge to appear in the portfolio summary section
    const summary = page.locator(
      'section[aria-labelledby="portfolio-summary"]',
    );
    await expect(summary.getByText('e2e-ui-sell-only')).toBeVisible({
      timeout: 10_000,
    });
    await expect(summary.getByText(/strategy/i)).toBeVisible();
  });

  test('strategy badge persists after page reload', async ({ page }) => {
    await openSeededPortfolio(page);

    const summary = page.locator(
      'section[aria-labelledby="portfolio-summary"]',
    );
    await expect(summary.getByText('e2e-ui-sell-only')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('removing the strategy via the UI hides the strategy badge', async ({
    page,
  }) => {
    await openSeededPortfolio(page);

    const select = page.getByRole('combobox', { name: /assigned strategy/i });
    await expect(select).toBeVisible();
    // Select the empty option to unassign
    await select.selectOption('');

    const summary = page.locator(
      'section[aria-labelledby="portfolio-summary"]',
    );
    await expect(summary.getByText('e2e-ui-sell-only')).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test('API confirms strategy was removed', async () => {
    const portfolio = await api.getPortfolio(SEEDED_PORTFOLIO_ID);
    expect(portfolio.strategy).toBeUndefined();
  });
});
