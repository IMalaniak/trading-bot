import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PortfolioReadResponseDto } from '../lib/portfolio-api';
import App from './app';

const portfolioFixture: PortfolioReadResponseDto = {
  summary: {
    portfolioId: 'portfolio-alpha',
    name: 'Alpha Portfolio',
    isActive: true,
    exposureCapNotional: '1000',
    aggregateExposureNotional: '150',
    openPositionCount: 1,
    updatedAt: '2026-03-25T12:00:05.000Z',
  },
  positions: [
    {
      portfolioId: 'portfolio-alpha',
      instrument: {
        id: 'instrument-1',
        symbol: 'BTC/USDT',
        assetClass: 'crypto',
        venue: 'BINANCE',
        externalSymbol: 'BTCUSDT',
      },
      quantity: '0.5',
      averageEntryPrice: '30000',
      exposureNotional: '15000',
      lastFillId: 'ord_abc:fill:2',
      updatedAt: '2026-03-25T12:00:05.000Z',
    },
  ],
  recentOrders: [
    {
      orderId: 'ord_abc',
      approvalEventId: 'approval-event-1',
      candidateIdempotencyKey: 'source-event-1:portfolio-alpha',
      sourceEventId: 'source-event-1',
      portfolioId: 'portfolio-alpha',
      instrumentId: 'instrument-1',
      instrument: {
        id: 'instrument-1',
        symbol: 'BTC/USDT',
        assetClass: 'crypto',
        venue: 'BINANCE',
        externalSymbol: 'BTCUSDT',
      },
      signalId: 'signal-1',
      side: 'buy',
      requestedNotional: '100',
      requestedQuantity: '1',
      referencePrice: '100',
      status: 'filled',
      approvedAt: '2026-03-25T12:00:02.000Z',
      placedAt: '2026-03-25T12:00:03.000Z',
      lastActivityAt: '2026-03-25T12:00:05.000Z',
      fills: [
        {
          fillId: 'ord_abc:fill:2',
          orderId: 'ord_abc',
          portfolioId: 'portfolio-alpha',
          instrumentId: 'instrument-1',
          sequence: 2,
          fillNotional: '50',
          fillQuantity: '0.5',
          fillPrice: '100',
          cumulativeFilledNotional: '100',
          cumulativeFilledQuantity: '1',
          orderStatus: 'filled',
          filledAt: '2026-03-25T12:00:05.000Z',
        },
      ],
    },
  ],
};

const emptyPortfolioFixture: PortfolioReadResponseDto = {
  ...portfolioFixture,
  positions: [],
  recentOrders: [],
  summary: {
    ...portfolioFixture.summary,
    aggregateExposureNotional: '0',
    openPositionCount: 0,
  },
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const installMatchMedia = (matches = false) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const renderApp = () =>
  render(
    <BrowserRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <App />
    </BrowserRouter>,
  );

describe('App', () => {
  beforeEach(() => {
    localStorage.removeItem('trading-bot-dashboard-theme');
    installMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads portfolio-alpha by default and renders portfolio state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(portfolioFixture));
    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    expect(await screen.findByText('Alpha Portfolio')).toBeInTheDocument();
    expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0);
    expect(screen.getByText('ord_abc')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/portfolio/portfolio-alpha?recentOrdersLimit=20',
      expect.any(Object),
    );
  });

  it('renders empty positions and orders states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(emptyPortfolioFixture)),
    );

    renderApp();

    expect(await screen.findByText('No open positions')).toBeInTheDocument();
    expect(screen.getByText('No recent orders')).toBeInTheDocument();
  });

  it('keeps the last data visible while refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(portfolioFixture))
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Execution service unavailable' }, 502),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    expect(await screen.findByText('Alpha Portfolio')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));

    expect(
      await screen.findByText('Execution service unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByText('Alpha Portfolio')).toBeInTheDocument();
  });

  it('validates and submits instrument registration', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse({
              id: 'instrument-sol-usdt',
              symbol: 'SOL/USDT',
              assetClass: 'crypto',
              venue: 'BINANCE',
              externalSymbol: 'SOLUSDT',
            }),
          );
        }

        return Promise.resolve(jsonResponse(portfolioFixture));
      });
    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    await screen.findByText('Alpha Portfolio');
    const submitButton = screen.getByRole('button', { name: /^register$/i });
    expect(submitButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^symbol$/i), 'SOL/USDT');
    await userEvent.type(
      screen.getByLabelText(/^external symbol$/i),
      'SOLUSDT',
    );
    await userEvent.click(submitButton);

    expect(await screen.findByText(/Registered SOL\/USDT/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/portfolio/register-instrument',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          symbol: 'SOL/USDT',
          assetClass: 'crypto',
          venue: 'BINANCE',
          externalSymbol: 'SOLUSDT',
        }),
      }),
    );
  });

  it('uses system theme by default and allows dark theme override', async () => {
    installMatchMedia(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(portfolioFixture)),
    );

    renderApp();

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));

    await userEvent.click(screen.getByTitle('Light theme'));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('trading-bot-dashboard-theme')).toBe('light');
  });
});
