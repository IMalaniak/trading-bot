import type { MockedFunction } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExternalApiFacadeController } from './external-api-facade.controller';
import type { FacadeService } from './facade.service';

describe('ExternalApiFacadeController', () => {
  let controller: ExternalApiFacadeController;
  let facadeService: {
    startSubscription: MockedFunction<FacadeService['startSubscription']>;
    stopSubscription: MockedFunction<FacadeService['stopSubscription']>;
  };

  beforeEach(() => {
    facadeService = {
      startSubscription: vi.fn(),
      stopSubscription: vi.fn(),
    };
    controller = new ExternalApiFacadeController(
      facadeService as unknown as FacadeService,
    );
  });

  describe('startMarketDataSubscription', () => {
    it('should delegate to facadeService and return started=true when a new subscription is created', async () => {
      facadeService.startSubscription.mockResolvedValue(true);

      const result = await controller.startMarketDataSubscription({
        instrumentId: 'inst-1',
        symbol: 'BTCUSDT',
        venue: 'BINANCE',
        intervals: ['1m'],
      });

      expect(facadeService.startSubscription).toHaveBeenCalledWith(
        'inst-1',
        'BTCUSDT',
        'BINANCE',
        ['1m'],
      );
      expect(result).toEqual({ started: true });
    });

    it('should return started=false when the subscription already exists', async () => {
      facadeService.startSubscription.mockResolvedValue(false);

      const result = await controller.startMarketDataSubscription({
        instrumentId: 'inst-1',
        symbol: 'BTCUSDT',
        venue: 'BINANCE',
        intervals: [],
      });

      expect(result).toEqual({ started: false });
    });
  });

  describe('stopMarketDataSubscription', () => {
    it('should delegate to facadeService and return stopped=true when an active subscription is removed', async () => {
      facadeService.stopSubscription.mockResolvedValue(true);

      const result = await controller.stopMarketDataSubscription({
        instrumentId: 'inst-1',
      });

      expect(facadeService.stopSubscription).toHaveBeenCalledWith('inst-1');
      expect(result).toEqual({ stopped: true });
    });

    it('should return stopped=false when no subscription is active', async () => {
      facadeService.stopSubscription.mockResolvedValue(false);

      const result = await controller.stopMarketDataSubscription({
        instrumentId: 'inst-unknown',
      });

      expect(result).toEqual({ stopped: false });
    });
  });
});
