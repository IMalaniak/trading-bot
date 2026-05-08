import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GrpcStatusCode } from '@trading-bot/common';
import {
  AssetClass,
  EXECUTION_ENGINE_CLIENT,
  OrderStatus,
  PORTFOLIO_MANAGER_CLIENT,
  SignalSide,
} from '@trading-bot/common/proto';
import { lastValueFrom, of, throwError } from 'rxjs';

import { OrderStatusName } from './dto/order-status-name.enum';
import { SignalSideName } from './dto/signal-side-name.enum';
import { IExecutionEngine } from './execution-engine.client.interface';
import { PortfolioService } from './portfolio.service';
import { IRiskAndPortfolioManager } from './risk-and-portfolio.client.interface';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let portfolioClient: jest.Mocked<IRiskAndPortfolioManager>;
  let executionClient: jest.Mocked<IExecutionEngine>;

  beforeEach(async () => {
    portfolioClient = {
      registerInstrument: jest.fn(),
      getPortfolio: jest.fn(),
      listInstruments: jest.fn(),
    };
    executionClient = {
      listPortfolioExecutionOrders: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: PORTFOLIO_MANAGER_CLIENT,
          useValue: {
            getService: jest.fn().mockReturnValue(portfolioClient),
          },
        },
        {
          provide: EXECUTION_ENGINE_CLIENT,
          useValue: {
            getService: jest.fn().mockReturnValue(executionClient),
          },
        },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
    service.onModuleInit();
  });

  it('aggregates portfolio state and execution orders', async () => {
    portfolioClient.getPortfolio.mockReturnValue(
      of({
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
              assetClass: AssetClass.CRYPTO,
              symbol: 'BTC/USDT',
              venue: 'BINANCE',
              externalSymbol: 'BTCUSDT',
            },
            quantity: '0.5',
            averageEntryPrice: '300',
            exposureNotional: '150',
            lastFillId: 'ord_abc:fill:2',
            updatedAt: '2026-03-25T12:00:05.000Z',
          },
        ],
      }),
    );
    executionClient.listPortfolioExecutionOrders.mockReturnValue(
      of({
        orders: [
          {
            orderId: 'ord_abc',
            approvalEventId: 'approval-event-1',
            candidateIdempotencyKey: 'source-event-1:portfolio-alpha',
            sourceEventId: 'source-event-1',
            portfolioId: 'portfolio-alpha',
            instrumentId: 'instrument-1',
            signalId: 'signal-1',
            side: SignalSide.BUY,
            requestedNotional: '100',
            requestedQuantity: '1',
            referencePrice: '100',
            status: OrderStatus.FILLED,
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
                orderStatus: OrderStatus.FILLED,
                filledAt: '2026-03-25T12:00:05.000Z',
              },
            ],
          },
        ],
      }),
    );

    await expect(
      lastValueFrom(service.getPortfolio('portfolio-alpha', 10)),
    ).resolves.toEqual({
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
            assetClass: 'crypto',
            symbol: 'BTC/USDT',
            venue: 'BINANCE',
            externalSymbol: 'BTCUSDT',
          },
          quantity: '0.5',
          averageEntryPrice: '300',
          exposureNotional: '150',
          lastFillId: 'ord_abc:fill:2',
          updatedAt: '2026-03-25T12:00:05.000Z',
        },
      ],
      recentOrders: [
        expect.objectContaining({
          orderId: 'ord_abc',
          instrument: {
            id: 'instrument-1',
            assetClass: 'crypto',
            symbol: 'BTC/USDT',
            venue: 'BINANCE',
            externalSymbol: 'BTCUSDT',
          },
          side: SignalSideName.BUY,
          status: OrderStatusName.FILLED,
          fills: [
            expect.objectContaining({
              fillId: 'ord_abc:fill:2',
              orderStatus: OrderStatusName.FILLED,
            }),
          ],
        }),
      ],
    });
    expect(portfolioClient.listInstruments.mock.calls).toHaveLength(0);
  });

  it('loads missing order instruments from portfolio-manager', async () => {
    portfolioClient.getPortfolio.mockReturnValue(
      of({
        summary: {
          portfolioId: 'portfolio-alpha',
          name: 'Alpha Portfolio',
          isActive: true,
          exposureCapNotional: '1000',
          aggregateExposureNotional: '0',
          openPositionCount: 0,
          updatedAt: '2026-03-25T12:00:00.000Z',
        },
        positions: [],
      }),
    );
    executionClient.listPortfolioExecutionOrders.mockReturnValue(
      of({
        orders: [
          {
            orderId: 'ord_abc',
            approvalEventId: 'approval-event-1',
            candidateIdempotencyKey: 'source-event-1:portfolio-alpha',
            sourceEventId: 'source-event-1',
            portfolioId: 'portfolio-alpha',
            instrumentId: 'instrument-1',
            signalId: 'signal-1',
            side: SignalSide.BUY,
            requestedNotional: '100',
            requestedQuantity: '1',
            referencePrice: '100',
            status: OrderStatus.FILLED,
            approvedAt: '2026-03-25T12:00:02.000Z',
            placedAt: '2026-03-25T12:00:03.000Z',
            lastActivityAt: '2026-03-25T12:00:05.000Z',
            fills: [],
          },
        ],
      }),
    );
    portfolioClient.listInstruments.mockReturnValue(
      of({
        instruments: [
          {
            id: 'instrument-1',
            assetClass: AssetClass.CRYPTO,
            symbol: 'BTC/USDT',
            venue: 'BINANCE',
            externalSymbol: 'BTCUSDT',
          },
        ],
      }),
    );

    const response = await lastValueFrom(
      service.getPortfolio('portfolio-alpha', 10),
    );

    expect(portfolioClient.listInstruments.mock.calls).toEqual([
      [{ instrumentIds: ['instrument-1'] }],
    ]);
    expect(response.recentOrders[0]?.instrument?.symbol).toBe('BTC/USDT');
  });

  it('maps portfolio-manager NOT_FOUND to HTTP 404', async () => {
    portfolioClient.getPortfolio.mockReturnValue(
      throwError(() => ({
        code: GrpcStatusCode.NOT_FOUND,
        details: 'Portfolio not found',
      })),
    );
    executionClient.listPortfolioExecutionOrders.mockReturnValue(
      of({ orders: [] }),
    );

    await expect(
      lastValueFrom(service.getPortfolio('missing', 10)),
    ).rejects.toMatchObject({
      response: {
        message: 'Portfolio not found',
        grpcCode: GrpcStatusCode.NOT_FOUND,
      },
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('maps invalid portfolio positions payload to HTTP 502', async () => {
    portfolioClient.getPortfolio.mockReturnValue(
      of({
        summary: {
          portfolioId: 'portfolio-alpha',
          name: 'Alpha Portfolio',
          isActive: true,
          exposureCapNotional: '1000',
          aggregateExposureNotional: '0',
          openPositionCount: 0,
          updatedAt: '2026-03-25T12:00:00.000Z',
        },
        positions: null,
      }) as never,
    );
    executionClient.listPortfolioExecutionOrders.mockReturnValue(
      of({ orders: [] }),
    );

    await expect(
      lastValueFrom(service.getPortfolio('portfolio-alpha', 10)),
    ).rejects.toMatchObject({
      response: {
        message:
          'Risk service returned invalid portfolio payload: positions must be an array',
        type: 'InvalidPortfolioPayload',
      },
      status: HttpStatus.BAD_GATEWAY,
    });
  });

  it('maps invalid execution orders payload to HTTP 502', async () => {
    portfolioClient.getPortfolio.mockReturnValue(
      of({
        summary: {
          portfolioId: 'portfolio-alpha',
          name: 'Alpha Portfolio',
          isActive: true,
          exposureCapNotional: '1000',
          aggregateExposureNotional: '0',
          openPositionCount: 0,
          updatedAt: '2026-03-25T12:00:00.000Z',
        },
        positions: [],
      }),
    );
    executionClient.listPortfolioExecutionOrders.mockReturnValue(
      of({ orders: null }) as never,
    );

    await expect(
      lastValueFrom(service.getPortfolio('portfolio-alpha', 10)),
    ).rejects.toMatchObject({
      response: {
        message:
          'Execution service returned invalid orders payload: orders must be an array',
        type: 'InvalidExecutionPayload',
      },
      status: HttpStatus.BAD_GATEWAY,
    });
  });
});
