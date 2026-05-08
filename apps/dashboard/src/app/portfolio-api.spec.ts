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
        recentOrders: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createDashboardApi('https://api.example/api/').getPortfolio(
      'portfolio alpha',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/portfolio/portfolio%20alpha?recentOrdersLimit=20',
      expect.any(Object),
    );
  });

  it('posts registration payloads unchanged', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'instrument-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await createDashboardApi('https://api.example/api').registerInstrument({
      symbol: 'BTC/USDT',
      assetClass: 'crypto',
      venue: 'BINANCE',
      externalSymbol: 'BTCUSDT',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/portfolio/register-instrument',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          symbol: 'BTC/USDT',
          assetClass: 'crypto',
          venue: 'BINANCE',
          externalSymbol: 'BTCUSDT',
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
    ).rejects.toMatchObject<Partial<DashboardApiError>>({
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
    ).rejects.toMatchObject<Partial<DashboardApiError>>({
      message: 'Network error: connection refused',
    });
  });
});
