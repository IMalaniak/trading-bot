import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PortfolioInstrumentConfigDto } from '../lib/portfolio-api';
import { PortfolioInstrumentsView } from './portfolio-instruments-view';

const makeConfig = (
  overrides: Partial<PortfolioInstrumentConfigDto> = {},
): PortfolioInstrumentConfigDto => ({
  portfolioId: 'portfolio-alpha',
  instrument: {
    id: 'inst-1',
    symbol: 'BTC/USDT',
    assetClass: 'crypto',
    venue: 'BINANCE',
  },
  enabled: true,
  targetNotional: '100',
  maxTradeNotional: '150',
  maxPositionNotional: '400',
  updatedAt: '2026-05-21T10:00:00.000Z',
  ...overrides,
});

describe('PortfolioInstrumentsView', () => {
  it('renders empty state when no instruments provided', () => {
    render(
      <PortfolioInstrumentsView instruments={[]} onToggleEnabled={vi.fn()} />,
    );

    expect(screen.getByText('No portfolio instruments')).toBeInTheDocument();
  });

  it('renders toggle button in enabled state', () => {
    render(
      <PortfolioInstrumentsView
        instruments={[makeConfig({ enabled: true })]}
        onToggleEnabled={vi.fn()}
      />,
    );

    // Both mobile card and desktop table render a toggle button
    const buttons = screen.getAllByRole('button', {
      name: /disable BTC\/USDT/i,
    });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(buttons[0]).toBeInTheDocument();
  });

  it('renders toggle button in disabled state', () => {
    render(
      <PortfolioInstrumentsView
        instruments={[makeConfig({ enabled: false })]}
        onToggleEnabled={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button', {
      name: /enable BTC\/USDT/i,
    });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(buttons[0]).toBeInTheDocument();
  });

  it('calls onToggleEnabled with correct args when clicked', async () => {
    const onToggle = vi.fn();
    render(
      <PortfolioInstrumentsView
        instruments={[makeConfig({ enabled: true })]}
        onToggleEnabled={onToggle}
      />,
    );

    // Click the first disable button (mobile card view)
    await userEvent.click(
      screen.getAllByRole('button', { name: /disable BTC\/USDT/i })[0],
    );

    expect(onToggle).toHaveBeenCalledWith('portfolio-alpha', 'inst-1', false);
  });

  it('shows loading spinner while toggling the instrument', () => {
    render(
      <PortfolioInstrumentsView
        instruments={[makeConfig()]}
        onToggleEnabled={vi.fn()}
        togglingInstrumentId="inst-1"
      />,
    );

    const buttons = screen.getAllByRole('button', {
      name: /updating BTC\/USDT/i,
    });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(buttons[0]).toBeDisabled();
  });

  it('works without onToggleEnabled prop (read-only)', () => {
    render(<PortfolioInstrumentsView instruments={[makeConfig()]} />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
