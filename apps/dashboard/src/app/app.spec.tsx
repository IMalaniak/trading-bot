import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ListPortfoliosResponseDto,
  PortfolioReadResponseDto,
} from '../lib/portfolio-api';
import App from './app';

const portfolioListFixture: ListPortfoliosResponseDto = {
  portfolios: [
    {
      portfolioId: 'portfolio-alpha',
      name: 'Alpha Portfolio',
      isActive: true,
      exposureCapNotional: '1000',
      aggregateExposureNotional: '150',
      openPositionCount: 1,
      updatedAt: '2026-03-25T12:00:05.000Z',
    },
  ],
};

const portfolioFixture: PortfolioReadResponseDto = {
  summary: portfolioListFixture.portfolios[0],
  configuredInstruments: [
    {
      portfolioId: 'portfolio-alpha',
      instrument: {
        id: 'instrument-aapl',
        symbol: 'AAPL',
        assetClass: 'stock',
        venue: 'NASDAQ',
        externalSymbol: 'AAPL',
      },
      enabled: true,
      targetNotional: '100',
      maxTradeNotional: '25',
      maxPositionNotional: '400',
      updatedAt: '2026-03-25T12:00:05.000Z',
    },
  ],
  positions: [],
  recentOrders: [],
};

const emptyPortfolioFixture: PortfolioReadResponseDto = {
  ...portfolioFixture,
  configuredInstruments: [],
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

const renderApp = (initialEntries = ['/']) =>
  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={initialEntries}
    >
      <App />
    </MemoryRouter>,
  );

const makeLocalStorageMock = () => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  };
};

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock());
    installMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists portfolios initially without loading a hardcoded portfolio', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(portfolioListFixture));
    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    expect(await screen.findByText('Alpha Portfolio')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/portfolios',
      expect.any(Object),
    );
  });

  it('navigates from portfolio list to selected portfolio details', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'http://localhost:3000/api/portfolios') {
        return Promise.resolve(jsonResponse(portfolioListFixture));
      }

      return Promise.resolve(jsonResponse(portfolioFixture));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    await userEvent.click(await screen.findByText('Alpha Portfolio'));

    expect(
      await screen.findByText('Portfolio Instruments'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/portfolios/portfolio-alpha?recentOrdersLimit=20',
      expect.any(Object),
    );
  });

  it('renders empty configured instruments, positions, and orders states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(emptyPortfolioFixture)),
    );

    renderApp(['/portfolios/portfolio-alpha']);

    expect(
      await screen.findByText('No portfolio instruments'),
    ).toBeInTheDocument();
    expect(screen.getByText('No open positions')).toBeInTheDocument();
    expect(screen.getByText('No recent orders')).toBeInTheDocument();
  });

  it('validates and submits portfolio-scoped instrument registration', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse({
              portfolioId: 'portfolio-alpha',
              instrument: {
                id: 'instrument-msft',
                symbol: 'MSFT',
                assetClass: 'stock',
                venue: 'NASDAQ',
                externalSymbol: 'MSFT',
              },
              enabled: true,
              targetNotional: '200',
              maxTradeNotional: '50',
              maxPositionNotional: '500',
              updatedAt: '2026-03-25T12:00:05.000Z',
            }),
          );
        }

        return Promise.resolve(jsonResponse(emptyPortfolioFixture));
      });
    vi.stubGlobal('fetch', fetchMock);

    renderApp(['/portfolios/portfolio-alpha']);

    await screen.findByText('Alpha Portfolio');
    const submitButton = screen.getByRole('button', {
      name: /^add to portfolio$/i,
    });
    expect(submitButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^symbol$/i), 'MSFT');
    await userEvent.selectOptions(screen.getByLabelText(/^asset class$/i), [
      'stock',
    ]);
    await userEvent.type(screen.getByLabelText(/^venue$/i), 'NASDAQ');
    await userEvent.type(screen.getByLabelText(/^external symbol$/i), 'MSFT');
    await userEvent.type(screen.getByLabelText(/^target notional$/i), '200');
    await userEvent.type(screen.getByLabelText(/^max trade$/i), '50');
    await userEvent.type(screen.getByLabelText(/^max position$/i), '500');
    await userEvent.click(submitButton);

    expect(await screen.findByText(/Added MSFT/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/portfolios/portfolio-alpha/instrument',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          symbol: 'MSFT',
          assetClass: 'stock',
          venue: 'NASDAQ',
          externalSymbol: 'MSFT',
          enabled: true,
          targetNotional: '200',
          maxTradeNotional: '50',
          maxPositionNotional: '500',
        }),
      }),
    );
  });

  it('renders duplicate instrument errors from application response codes', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse(
              {
                message: 'Instrument already attached to portfolio',
                code: 'INSTRUMENT_ALREADY_ATTACHED',
              },
              409,
            ),
          );
        }

        return Promise.resolve(jsonResponse(emptyPortfolioFixture));
      });
    vi.stubGlobal('fetch', fetchMock);

    renderApp(['/portfolios/portfolio-alpha']);

    await screen.findByText('Alpha Portfolio');
    await userEvent.type(screen.getByLabelText(/^symbol$/i), 'MSFT');
    await userEvent.selectOptions(screen.getByLabelText(/^asset class$/i), [
      'stock',
    ]);
    await userEvent.type(screen.getByLabelText(/^venue$/i), 'NASDAQ');
    await userEvent.type(screen.getByLabelText(/^target notional$/i), '200');
    await userEvent.type(screen.getByLabelText(/^max trade$/i), '50');
    await userEvent.type(screen.getByLabelText(/^max position$/i), '500');
    await userEvent.click(
      screen.getByRole('button', { name: /^add to portfolio$/i }),
    );

    expect(
      await screen.findByText(
        'This instrument is already configured for the selected portfolio.',
      ),
    ).toBeInTheDocument();
  });

  it('uses system theme by default and exposes a compact theme menu', async () => {
    installMatchMedia(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(portfolioListFixture)),
    );

    renderApp();

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));

    await userEvent.click(
      screen.getByRole('button', { name: /theme settings: system/i }),
    );
    await userEvent.click(
      screen.getByRole('menuitemradio', { name: /light/i }),
    );
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('trading-bot-dashboard-theme')).toBe('light');

    await userEvent.click(
      screen.getByRole('button', { name: /theme settings: light/i }),
    );
    await userEvent.click(screen.getByRole('menuitemradio', { name: /dark/i }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('trading-bot-dashboard-theme')).toBe('dark');
  });
});
