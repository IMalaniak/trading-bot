import { expect, type Page } from '@playwright/test';

export const openSeededPortfolio = async (page: Page): Promise<void> => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Select Portfolio' }),
  ).toBeVisible();
  await expect(page.getByText('Alpha Portfolio')).toBeVisible();
  await page.getByRole('link', { name: /Alpha Portfolio/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Alpha Portfolio' }),
  ).toBeVisible();
};

export const refreshDashboard = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /refresh/i }).click();
  await expect(page.getByRole('button', { name: /refresh/i })).toBeEnabled({
    timeout: 10_000,
  });
};

export const expectDashboardPortfolioState = async (
  page: Page,
  orderId: string,
  fillIds: readonly string[],
  quantity: string,
): Promise<void> => {
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
  await expect(positionRow).toContainText(quantity);

  const orders = page.locator('section[aria-labelledby="orders-heading"]');
  await expect(
    orders.getByRole('heading', { exact: true, name: orderId }),
  ).toBeVisible();
  await expect(orders.getByText('Filled').first()).toBeVisible();

  for (const fillId of fillIds) {
    await expect(orders.getByText(fillId, { exact: true })).toBeVisible();
  }
};
