import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RiskDecisionDto } from '../lib/portfolio-api';
import { RiskDecisionHistoryView } from './risk-decision-history-view';

const approved: RiskDecisionDto = {
  id: 'dec-1',
  portfolioId: 'portfolio-alpha',
  instrumentId: 'inst-1',
  decision: 'APPROVED',
  reasonCodes: [],
  requestedNotional: '500',
  referencePrice: '10000',
  decidedAt: '2026-05-21T10:00:00.000Z',
  sourceEventId: 'evt-1',
};

const rejected: RiskDecisionDto = {
  id: 'dec-2',
  portfolioId: 'portfolio-alpha',
  instrumentId: 'inst-2',
  decision: 'REJECTED',
  reasonCodes: ['TRADE_CAP_EXCEEDED', 'COOLDOWN_ACTIVE'],
  requestedNotional: '1500',
  referencePrice: '20000',
  decidedAt: '2026-05-21T11:00:00.000Z',
  sourceEventId: 'evt-2',
};

describe('RiskDecisionHistoryView', () => {
  it('shows empty state when no decisions', () => {
    render(<RiskDecisionHistoryView decisions={[]} />);

    expect(
      screen.getByRole('heading', { name: /no risk decisions/i }),
    ).toBeInTheDocument();
  });

  it('renders APPROVED decisions with green badge', () => {
    render(<RiskDecisionHistoryView decisions={[approved]} />);

    // Both mobile card and desktop table render the badge — use getAllBy
    const badges = screen.getAllByText('APPROVED');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(badges[0]).toBeInTheDocument();
    const instruments = screen.getAllByText('inst-1');
    expect(instruments[0]).toBeInTheDocument();
    const notionals = screen.getAllByText('500');
    expect(notionals[0]).toBeInTheDocument();
  });

  it('renders REJECTED decisions with reason codes', () => {
    render(<RiskDecisionHistoryView decisions={[rejected]} />);

    const badges = screen.getAllByText('REJECTED');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(badges[0]).toBeInTheDocument();
    // reason codes appear twice (mobile + desktop)
    const caps = screen.getAllByText('TRADE_CAP_EXCEEDED');
    expect(caps.length).toBeGreaterThanOrEqual(1);
    const cooldown = screen.getAllByText('COOLDOWN_ACTIVE');
    expect(cooldown.length).toBeGreaterThanOrEqual(1);
  });

  it('renders multiple decisions', () => {
    render(<RiskDecisionHistoryView decisions={[approved, rejected]} />);

    expect(screen.getAllByText('APPROVED').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('REJECTED').length).toBeGreaterThanOrEqual(1);
  });
});
