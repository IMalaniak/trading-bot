import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from './api-client';

const BASE_URL = 'http://localhost:13000/api';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('ApiClient — new methods', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('updatePortfolio', () => {
    it('sends PATCH to /portfolios/:id and returns updated summary', async () => {
      const summary = {
        portfolioId: 'portfolio-alpha',
        name: 'Alpha',
        isActive: true,
        exposureCapNotional: '5000',
        aggregateExposureNotional: '0',
        openPositionCount: 0,
        updatedAt: '2026-05-22T10:00:00.000Z',
      };
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(summary));

      const client = new ApiClient(BASE_URL);
      const result = await client.updatePortfolio('portfolio-alpha', {
        exposureCapNotional: '5000',
      });

      expect(result).toEqual(summary);
      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/portfolios/portfolio-alpha`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ exposureCapNotional: '5000' }),
        }),
      );
    });
  });

  describe('updatePortfolioInstrumentConfig', () => {
    it('sends PATCH to /portfolios/:id/instrument/:iid and returns updated config', async () => {
      const config = {
        portfolioId: 'portfolio-alpha',
        instrument: {
          id: 'inst-1',
          symbol: 'BTC',
          assetClass: 'crypto',
          venue: 'BINANCE',
          externalSymbol: 'BTCUSDT',
        },
        enabled: false,
        targetNotional: '100',
        maxTradeNotional: '10',
        maxPositionNotional: '200',
        updatedAt: '2026-05-22T10:00:00.000Z',
      };
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(config));

      const client = new ApiClient(BASE_URL);
      const result = await client.updatePortfolioInstrumentConfig(
        'portfolio-alpha',
        'inst-1',
        { enabled: false },
      );

      expect(result).toEqual(config);
      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/portfolios/portfolio-alpha/instrument/inst-1`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ enabled: false }),
        }),
      );
    });
  });

  describe('listRiskDecisions', () => {
    it('fetches /portfolios/:id/decisions without params', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ decisions: [], nextCursor: undefined }),
      );

      const client = new ApiClient(BASE_URL);
      const result = await client.listRiskDecisions('portfolio-alpha');

      expect(result.decisions).toEqual([]);
      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/portfolios/portfolio-alpha/decisions`,
        expect.any(Object),
      );
    });

    it('appends decision and limit query params', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ decisions: [] }));

      const client = new ApiClient(BASE_URL);
      await client.listRiskDecisions('portfolio-alpha', {
        decision: 'REJECTED',
        limit: 5,
      });

      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/portfolios/portfolio-alpha/decisions?decisionFilter=REJECTED&limit=5`,
        expect.any(Object),
      );
    });
  });

  describe('listRiskConfigAuditLog', () => {
    it('fetches /portfolios/:id/audit', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ entries: [] }));

      const client = new ApiClient(BASE_URL);
      const result = await client.listRiskConfigAuditLog('portfolio-alpha');

      expect(result.entries).toEqual([]);
      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/portfolios/portfolio-alpha/audit`,
        expect.any(Object),
      );
    });
  });

  describe('createStrategy', () => {
    it('sends POST to /strategies and returns created strategy', async () => {
      const strategy = {
        id: 'strategy-1',
        name: 'SELL Only',
        allowedSides: [2],
        createdAt: '2026-05-22T10:00:00.000Z',
        updatedAt: '2026-05-22T10:00:00.000Z',
      };
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(strategy));

      const client = new ApiClient(BASE_URL);
      const result = await client.createStrategy({
        name: 'SELL Only',
        allowedSides: [2],
      });

      expect(result).toEqual(strategy);
      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/strategies`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'SELL Only', allowedSides: [2] }),
        }),
      );
    });
  });

  describe('assignStrategy', () => {
    it('sends POST to /portfolios/:id/strategy with strategyId', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ message: 'ok' }));

      const client = new ApiClient(BASE_URL);
      await client.assignStrategy('portfolio-alpha', {
        strategyId: 'strategy-1',
      });

      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/portfolios/portfolio-alpha/strategy`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ strategyId: 'strategy-1' }),
        }),
      );
    });

    it('sends POST with strategyId: null to clear assignment', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ message: 'ok' }));

      const client = new ApiClient(BASE_URL);
      await client.assignStrategy('portfolio-alpha', { strategyId: null });

      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/portfolios/portfolio-alpha/strategy`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ strategyId: null }),
        }),
      );
    });
  });
});
