import { expect, type Page, test } from '@playwright/test';

import { ApiClient } from '../support/api-client';
import { buildOrderFillReplay } from '../support/fill-replay';
import {
  createKafka,
  findSignalOrder,
  publishFillReplay,
  publishPortfolioSignal,
  SEEDED_INSTRUMENT_ID,
  SEEDED_PORTFOLIO_ID,
  sleep,
  summarizePortfolio,
  waitForPortfolioReconciliationState,
} from '../support/signal-to-portfolio-flow';

test.describe.configure({ mode: 'serial' });

test('reconciles a Kafka signal into portfolio read and dashboard state with idempotent replay', async ({
  page,
}) => {
  const api = new ApiClient();
  const kafka = createKafka();
  const producer = kafka.producer();

  await producer.connect();

  try {
    await test.step('seeded portfolios render in the dashboard', async () => {
      const portfolios = await api.listPortfolios();
      expect(
        portfolios.portfolios.map((portfolio) => portfolio.portfolioId),
      ).toContain(SEEDED_PORTFOLIO_ID);

      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'Select Portfolio' }),
      ).toBeVisible();
      await expect(page.getByText('Alpha Portfolio')).toBeVisible();
      await page.getByRole('link', { name: /Alpha Portfolio/ }).click();
      await expect(
        page.getByRole('heading', { name: 'Alpha Portfolio' }),
      ).toBeVisible();
    });

    await test.step('synthetic signal drives risk, execution, and reconciliation', async () => {
      await publishPortfolioSignal(producer);
    });

    const portfolio = await waitForPortfolioReconciliationState(api);
    const order = findSignalOrder(portfolio);
    const [firstFill, finalFill] = order.fills.sort(
      (left, right) => left.sequence - right.sequence,
    );

    expect(portfolio.summary.aggregateExposureNotional).toBe('100');
    expect(portfolio.summary.openPositionCount).toBe(1);
    expect(
      portfolio.positions.find(
        (position) => position.instrument.id === SEEDED_INSTRUMENT_ID,
      ),
    ).toEqual(
      expect.objectContaining({
        exposureNotional: '100',
        quantity: '1',
      }),
    );
    expect(order.status).toBe('FILLED');
    expect(order.fills).toHaveLength(2);
    expect(firstFill?.sequence).toBe(1);
    expect(finalFill?.sequence).toBe(2);

    await test.step('dashboard renders the updated read model', async () => {
      await refreshDashboard(page);
      await assertDashboardState(page, order.orderId, [
        firstFill?.fillId ?? '',
        finalFill?.fillId ?? '',
      ]);
    });

    const stableSnapshot = summarizePortfolio(portfolio);

    await test.step('duplicate source signal does not create another order', async () => {
      await publishPortfolioSignal(producer);
      await expectPortfolioStable(api, stableSnapshot);
    });

    await test.step('duplicate final fill does not mutate portfolio state', async () => {
      if (!finalFill) {
        throw new Error('Expected the final fill to be present.');
      }

      await publishFillReplay(producer, buildOrderFillReplay(order, finalFill));
      await expectPortfolioStable(api, stableSnapshot);
      await refreshDashboard(page);
      await assertDashboardState(page, order.orderId, [
        firstFill?.fillId ?? '',
        finalFill.fillId,
      ]);
    });
  } finally {
    await producer.disconnect();
  }
});

const refreshDashboard = async (page: Page) => {
  await page.getByRole('button', { name: /refresh/i }).click();
  await expect(page.getByRole('button', { name: /refresh/i })).toBeEnabled({
    timeout: 10_000,
  });
};

const assertDashboardState = async (
  page: Page,
  orderId: string,
  fillIds: readonly string[],
) => {
  const summary = page.locator('section[aria-labelledby="portfolio-summary"]');
  await expect(
    summary.locator('article').filter({ hasText: 'Aggregate exposure' }),
  ).toContainText('100');
  await expect(
    summary.locator('article').filter({ hasText: 'Open positions' }),
  ).toContainText('1');

  const positions = page.locator(
    'section[aria-labelledby="positions-heading"]',
  );
  const positionRow = positions.locator('tr').filter({ hasText: 'BTC/USDT' });
  await expect(positionRow).toBeVisible();
  await expect(positionRow).toContainText('1');

  const orders = page.locator('section[aria-labelledby="orders-heading"]');
  await expect(
    orders.getByRole('heading', { exact: true, name: orderId }),
  ).toBeVisible();
  await expect(orders.getByText('Filled').first()).toBeVisible();

  for (const fillId of fillIds) {
    await expect(orders.getByText(fillId, { exact: true })).toBeVisible();
  }
};

const expectPortfolioStable = async (
  api: ApiClient,
  expected: ReturnType<typeof summarizePortfolio>,
): Promise<void> => {
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    expect(
      summarizePortfolio(await api.getPortfolio(SEEDED_PORTFOLIO_ID)),
    ).toEqual(expected);
    await sleep(500);
  }
};
