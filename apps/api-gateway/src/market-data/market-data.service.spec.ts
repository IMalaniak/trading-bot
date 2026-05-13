import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GrpcStatusCode } from '@trading-bot/common';
import type {
  GetMarketDataBarsRequest,
  GetMarketDataBarsResponse,
} from '@trading-bot/common/proto';
import { DATA_INGESTION_CLIENT } from '@trading-bot/common/proto';
import { lastValueFrom, Observable, of, throwError, TimeoutError } from 'rxjs';
import type { Mock, Mocked } from 'vitest';

import { IDataIngestion } from './data-ingestion.client.interface';
import { MarketDataService } from './market-data.service';

describe('MarketDataService', () => {
  let service: MarketDataService;
  let dataIngestionClient: Mocked<IDataIngestion>;
  let getMarketDataBarsMock: Mock<
    (data: GetMarketDataBarsRequest) => Observable<GetMarketDataBarsResponse>
  >;

  beforeEach(async () => {
    getMarketDataBarsMock = vi.fn();
    dataIngestionClient = {
      getMarketDataBars: getMarketDataBarsMock,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataService,
        {
          provide: DATA_INGESTION_CLIENT,
          useValue: {
            getService: vi.fn().mockReturnValue(dataIngestionClient),
          },
        },
      ],
    }).compile();

    service = module.get<MarketDataService>(MarketDataService);
    service.onModuleInit();
  });

  describe('getMarketDataBars', () => {
    const query = {
      instrumentId: 'BTC-USDT',
      interval: '1m',
      from: 1_000_000,
      to: 2_000_000,
      limit: 100,
    };

    it('returns mapped bars from data-ingestion gRPC service', async () => {
      const grpcBar = {
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
      };
      getMarketDataBarsMock.mockReturnValue(of({ bars: [grpcBar] }));

      const result = await lastValueFrom(service.getMarketDataBars(query));

      expect(result.bars).toHaveLength(1);
      expect(result.bars[0]).toEqual({
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
      });
      expect(getMarketDataBarsMock).toHaveBeenCalledWith({
        instrumentId: 'BTC-USDT',
        interval: '1m',
        fromMs: 1_000_000,
        toMs: 2_000_000,
        limit: 100,
      });
    });

    it('returns empty bars array when gRPC returns no bars', async () => {
      getMarketDataBarsMock.mockReturnValue(of({ bars: [] }));

      const result = await lastValueFrom(service.getMarketDataBars(query));

      expect(result.bars).toHaveLength(0);
    });

    it('uses limit 0 when limit is not provided', async () => {
      getMarketDataBarsMock.mockReturnValue(of({ bars: [] }));
      const queryWithoutLimit = {
        instrumentId: 'BTC-USDT',
        interval: '1m',
        from: 1_000_000,
        to: 2_000_000,
      };

      await lastValueFrom(service.getMarketDataBars(queryWithoutLimit));

      expect(getMarketDataBarsMock).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 0 }),
      );
    });

    it('propagates gRPC NOT_FOUND as 404 HttpException', async () => {
      const grpcError = {
        code: GrpcStatusCode.NOT_FOUND,
        message: 'instrument not found',
      };
      getMarketDataBarsMock.mockReturnValue(throwError(() => grpcError));

      await expect(
        lastValueFrom(service.getMarketDataBars(query)),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('propagates gRPC INVALID_ARGUMENT as 400 HttpException', async () => {
      const grpcError = {
        code: GrpcStatusCode.INVALID_ARGUMENT,
        message: 'from must be before to',
      };
      getMarketDataBarsMock.mockReturnValue(throwError(() => grpcError));

      await expect(
        lastValueFrom(service.getMarketDataBars(query)),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('propagates timeout as 504 HttpException', async () => {
      getMarketDataBarsMock.mockReturnValue(
        new Observable((subscriber) => {
          subscriber.error(new TimeoutError());
        }),
      );

      await expect(
        lastValueFrom(service.getMarketDataBars(query)),
      ).rejects.toMatchObject({ status: HttpStatus.GATEWAY_TIMEOUT });
    });
  });
});
