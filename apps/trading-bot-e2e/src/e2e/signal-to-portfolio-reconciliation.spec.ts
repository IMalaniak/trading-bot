import { expect, test } from '@playwright/test';

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
  findSeededInstrumentSignal,
  findSignalOrder,
  quantityDashboardPrefix,
  summarizePortfolio,
} from '../support/portfolio-assertions';
import {
  createKafka,
  publishDuplicateReadyPredictionBar,
  publishFillReplay,
  publishPredictionPipelineBars,
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

    await test.step('market data drives feature engineering, prediction, execution, and reconciliation', async () => {
      await publishPredictionPipelineBars(producer);
    });

    const portfolio = await waitForPortfolioReconciliationState(api);
    const latestSignals = await api.getLatestSignals();
    const signal = findSeededInstrumentSignal(latestSignals.signals);
    const order = findSignalOrder(portfolio, signal.id);
    const [firstFill, finalFill] = order.fills.sort(
      (left, right) => left.sequence - right.sequence,
    );

    expectReconciledPortfolioState(portfolio, order, firstFill, finalFill);
    expect(signal.id).toBe(order.signalId);

    await test.step('dashboard renders the updated read model', async () => {
      await refreshDashboard(page);
      await expectDashboardPortfolioState(
        page,
        order.orderId,
        [firstFill?.fillId ?? '', finalFill?.fillId ?? ''],
        quantityDashboardPrefix(finalFill?.cumulativeFilledQuantity ?? ''),
      );
    });

    const stableSnapshot = summarizePortfolio(portfolio);

    await test.step('duplicate ready raw bar does not create another order', async () => {
      await publishDuplicateReadyPredictionBar(producer);
      await expectPortfolioStable(api, stableSnapshot);
    });

    await test.step('duplicate final fill does not mutate portfolio state', async () => {
      if (!finalFill) {
        throw new Error('Expected the final fill to be present.');
      }

      await publishFillReplay(producer, buildOrderFillReplay(order, finalFill));
      await expectPortfolioStable(api, stableSnapshot);
      await refreshDashboard(page);
      await expectDashboardPortfolioState(
        page,
        order.orderId,
        [firstFill?.fillId ?? '', finalFill.fillId],
        quantityDashboardPrefix(finalFill.cumulativeFilledQuantity),
      );
    });
  } finally {
    await producer.disconnect();
  }
});
