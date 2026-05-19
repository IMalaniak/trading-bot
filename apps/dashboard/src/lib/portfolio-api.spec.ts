import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDashboardApi,
  DashboardApiError,
  normalizeApiBaseUrl,
} from './portfolio-api';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('portfolio API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes empty and trailing slash base URLs', () => {
    expect(normalizeApiBaseUrl('https://api.example/api/')).toBe(
      'https://api.example/api',
    );
    expect(normalizeApiBaseUrl('')).toBe('http://localhost:3000/api');
  });

  it('encodes portfolio IDs and uses the fixed recent order limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        summary: {},
        positions: [],
        configuredInstruments: [],
        recentOrders: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createDashboardApi('https://api.example/api/').getPortfolio(
      'portfolio alpha',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/portfolios/portfolio%20alpha?recentOrdersLimit=20',
      expect.any(Object),
    );
  });

  it('lists portfolios', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ portfolios: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await createDashboardApi('https://api.example/api').listPortfolios();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/portfolios',
      expect.any(Object),
    );
  });

  it('lists recent signals with the fixed signal limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ signals: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await createDashboardApi('https://api.example/api').listSignals();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/signals?limit=10',
      expect.any(Object),
    );
  });

  it('posts portfolio instrument payloads unchanged', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ portfolioId: 'portfolio-alpha' }));
    vi.stubGlobal('fetch', fetchMock);

    await createDashboardApi(
      'https://api.example/api',
    ).registerPortfolioInstrument('portfolio alpha', {
      symbol: 'AAPL',
      assetClass: 'stock',
      venue: 'NASDAQ',
      externalSymbol: 'AAPL',
      enabled: true,
      targetNotional: '100',
      maxTradeNotional: '25',
      maxPositionNotional: '400',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/portfolios/portfolio%20alpha/instrument',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          symbol: 'AAPL',
          assetClass: 'stock',
          venue: 'NASDAQ',
          externalSymbol: 'AAPL',
          enabled: true,
          targetNotional: '100',
          maxTradeNotional: '25',
          maxPositionNotional: '400',
        }),
      }),
    );
  });

  it('normalizes upstream JSON errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ message: 'Not found' }, 404)),
    );

    await expect(
      createDashboardApi('https://api.example/api').getPortfolio('missing'),
    ).rejects.toMatchObject({
      message: 'Not found',
      status: 404,
    });
  });

  it('normalizes network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(
      createDashboardApi('https://api.example/api').getPortfolio('alpha'),
    ).rejects.toMatchObject({
      message: 'Network error: connection refused',
    });
  });

  it('normalizes NestJS class-validator array message errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            message: ['symbol must be a string', 'venue must not be empty'],
            statusCode: 400,
            error: 'Bad Request',
          },
          400,
        ),
      ),
    );

    const error = await createDashboardApi('https://api.example/api')
      .registerPortfolioInstrument('portfolio-alpha', {
        symbol: '',
        assetClass: 'stock',
        venue: '',
        enabled: true,
        targetNotional: '',
        maxTradeNotional: '',
        maxPositionNotional: '',
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DashboardApiError);
    expect((error as DashboardApiError).message).toBe(
      'symbol must be a string, venue must not be empty',
    );
    expect((error as DashboardApiError).details).toEqual([
      'symbol must be a string',
      'venue must not be empty',
    ]);
    expect((error as DashboardApiError).status).toBe(400);
  });
});
