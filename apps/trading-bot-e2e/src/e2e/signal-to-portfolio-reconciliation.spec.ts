import { test } from '@playwright/test';

import { ApiClient } from '../support/api-client';
import {
  expectDashboardPortfolioState,
  openSeededPortfolio,
  refreshDashboard,
} from '../support/dashboard-page';
import { buildOrderFillReplay } from '../support/fill-replay';
import {
  expectPortfolioStable,
  expectReconciledPortfolioState,
  expectSeededPortfolioListed,
  findSignalOrder,
  summarizePortfolio,
} from '../support/portfolio-assertions';
import {
  createKafka,
  publishFillReplay,
  publishPortfolioSignal,
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
      await expectSeededPortfolioListed(api);
      await openSeededPortfolio(page);
    });

    await test.step('synthetic signal drives risk, execution, and reconciliation', async () => {
      await publishPortfolioSignal(producer);
    });

    const portfolio = await waitForPortfolioReconciliationState(api);
    const order = findSignalOrder(portfolio);
    const [firstFill, finalFill] = order.fills.sort(
      (left, right) => left.sequence - right.sequence,
    );

    expectReconciledPortfolioState(portfolio, order, firstFill, finalFill);

    await test.step('dashboard renders the updated read model', async () => {
      await refreshDashboard(page);
      await expectDashboardPortfolioState(page, order.orderId, [
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
      await expectDashboardPortfolioState(page, order.orderId, [
        firstFill?.fillId ?? '',
        finalFill.fillId,
      ]);
    });
  } finally {
    await producer.disconnect();
  }
});
