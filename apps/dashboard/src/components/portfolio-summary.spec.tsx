import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type {
  PortfolioReadResponseDto,
  StrategyDto,
} from '../lib/portfolio-api';
import { PortfolioSummary } from './portfolio-summary';

const strategy: StrategyDto = {
  id: 'strategy-1',
  name: 'SELL Only',
  allowedSides: [2],
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
};

const baseData: PortfolioReadResponseDto = {
  summary: {
    portfolioId: 'portfolio-1',
    name: 'Test Portfolio',
    isActive: true,
    exposureCapNotional: '100000',
    aggregateExposureNotional: '50000',
    openPositionCount: 2,
    updatedAt: '2026-05-20T10:00:00.000Z',
  },
  positions: [],
  configuredInstruments: [],
  recentOrders: [],
};

describe('PortfolioSummary', () => {
  it('shows strategy badge when strategy is assigned', () => {
    const data: PortfolioReadResponseDto = {
      ...baseData,
      summary: { ...baseData.summary, strategy },
    };

    render(<PortfolioSummary data={data} />);

    expect(screen.getByText('SELL Only')).toBeInTheDocument();
    expect(screen.getByText(/strategy/i)).toBeInTheDocument();
  });

  it('shows no strategy badge when no strategy is assigned', () => {
    render(<PortfolioSummary data={baseData} />);

    expect(screen.queryByText(/sell only/i)).not.toBeInTheDocument();
  });
});
