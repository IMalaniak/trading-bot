import { PATH_METADATA } from '@nestjs/common/constants';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import type { Mocked } from 'vitest';

import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

describe('MarketDataController', () => {
  let controller: MarketDataController;
  let service: Mocked<MarketDataService>;
  let getMarketDataBarsMock: ReturnType<typeof vi.fn>;

  const mockBarsResponse = {
    bars: [
      {
        instrumentId: 'BTC-USDT',
        symbol: 'BTCUSDT',
        venue: 'BINANCE',
        interval: '1m',
        openTimeMs: 1_000_000,
        closeTimeMs: 1_060_000,
        open: '30000.00',
        high: '30100.00',
        low: '29900.00',
        close: '30050.00',
        volume: '100.5',
        quoteVolume: '3017525.00',
        tradeCount: 500,
      },
    ],
  };

  beforeEach(async () => {
    getMarketDataBarsMock = vi.fn();
    service = {
      getMarketDataBars: getMarketDataBarsMock,
      onModuleInit: vi.fn(),
    } as unknown as Mocked<MarketDataService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketDataController],
      providers: [
        {
          provide: APP_PIPE,
          useValue: {},
        },
        {
          provide: MarketDataService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<MarketDataController>(MarketDataController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('is registered under the "market-data" resource path', () => {
    expect(Reflect.getMetadata(PATH_METADATA, MarketDataController)).toBe(
      'market-data',
    );
  });

  describe('getBars', () => {
    it('delegates to MarketDataService.getMarketDataBars and returns the result', () => {
      getMarketDataBarsMock.mockReturnValue(of(mockBarsResponse));
      const query = {
        instrumentId: 'BTC-USDT',
        interval: '1m',
        from: 1_000_000,
        to: 2_000_000,
        limit: 100,
      };

      const result$ = controller.getBars(query);

      expect(getMarketDataBarsMock).toHaveBeenCalledWith(query);
      // subscribe to verify value
      result$.subscribe((result) => {
        expect(result).toEqual(mockBarsResponse);
      });
    });

    it('passes through the observable from MarketDataService', () => {
      getMarketDataBarsMock.mockReturnValue(of({ bars: [] }));
      const query = {
        instrumentId: 'ETH-USDT',
        interval: '5m',
        from: 500_000,
        to: 1_000_000,
      };

      controller.getBars(query);

      expect(getMarketDataBarsMock).toHaveBeenCalledWith(query);
    });
  });
});
