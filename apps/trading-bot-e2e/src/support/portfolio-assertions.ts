import { expect } from '@playwright/test';

import {
  ApiClient,
  type ExecutionFillDto,
  type ExecutionOrderDto,
  type PortfolioReadResponseDto,
} from './api-client';
import {
  SEEDED_INSTRUMENT_ID,
  SEEDED_PORTFOLIO_ID,
  SIGNAL_ID,
} from './signal-to-portfolio-flow';

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

export const expectSeededPortfolioListed = async (
  api: ApiClient,
): Promise<void> => {
  const portfolios = await api.listPortfolios();
  expect(
    portfolios.portfolios.map((portfolio) => portfolio.portfolioId),
  ).toContain(SEEDED_PORTFOLIO_ID);
};

export const expectReconciledPortfolioState = (
  portfolio: PortfolioReadResponseDto,
  order: ExecutionOrderDto,
  firstFill: ExecutionFillDto | undefined,
  finalFill: ExecutionFillDto | undefined,
): void => {
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
};

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

export const expectPortfolioStable = async (
  api: ApiClient,
  expected: PortfolioSnapshot,
): Promise<void> => {
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    expect(
      summarizePortfolio(await api.getPortfolio(SEEDED_PORTFOLIO_ID)),
    ).toEqual(expected);
    await sleep(500);
  }
};

const sleep = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
};
