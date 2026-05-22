import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AppResponseCode,
  GrpcStatusCode,
  OrderStatusName,
  SignalSideName,
} from '@trading-bot/common';
import {
  AssetClass,
  EXECUTION_ENGINE_CLIENT,
  OrderStatus,
  PORTFOLIO_MANAGER_CLIENT,
  SignalSide,
} from '@trading-bot/common/proto';
import { lastValueFrom, of, throwError } from 'rxjs';
import { TimeoutError } from 'rxjs';
import type { Mocked } from 'vitest';

import {
  ListRiskConfigAuditLogQueryDto,
  ListRiskDecisionsQueryDto,
} from './dto/portfolio-decisions.dto';
import { RegisterPortfolioInstrumentRequestDto } from './dto/portfolio-instrument.dto';
import {
  UpdatePortfolioInstrumentConfigRestRequestDto,
  UpdatePortfolioRestRequestDto,
} from './dto/portfolio-write.dto';
import { IExecutionEngine } from './execution-engine.client.interface';
import { PortfolioService } from './portfolio.service';
import { IRiskAndPortfolioManager } from './risk-and-portfolio.client.interface';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let portfolioClient: Mocked<IRiskAndPortfolioManager>;
  let executionClient: Mocked<IExecutionEngine>;

  beforeEach(async () => {
    portfolioClient = {
      registerPortfolioInstrument: vi.fn(),
      listPortfolios: vi.fn(),
      getPortfolio: vi.fn(),
      listInstruments: vi.fn(),
      updatePortfolio: vi.fn(),
      updatePortfolioInstrumentConfig: vi.fn(),
      listRiskDecisions: vi.fn(),
      listRiskConfigAuditLog: vi.fn(),
    };
    executionClient = {
      listPortfolioExecutionOrders: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: PORTFOLIO_MANAGER_CLIENT,
          useValue: {
            getService: vi.fn().mockReturnValue(portfolioClient),
          },
        },
        {
          provide: EXECUTION_ENGINE_CLIENT,
          useValue: {
            getService: vi.fn().mockReturnValue(executionClient),
          },
        },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
    service.onModuleInit();
  });

  it('lists portfolios from portfolio-manager', async () => {
    portfolioClient.listPortfolios.mockReturnValue(
      of({
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
      }),
    );

    await expect(lastValueFrom(service.listPortfolios())).resolves.toEqual({
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
    });
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
        configuredInstruments: [
          {
            portfolioId: 'portfolio-alpha',
            instrument: {
              id: 'instrument-1',
              assetClass: AssetClass.CRYPTO,
              symbol: 'BTC/USDT',
              venue: 'BINANCE',
              externalSymbol: 'BTCUSDT',
            },
            enabled: true,
            targetNotional: '100',
            maxTradeNotional: '150',
            maxPositionNotional: '400',
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
      configuredInstruments: [
        {
          portfolioId: 'portfolio-alpha',
          instrument: {
            id: 'instrument-1',
            assetClass: 'crypto',
            symbol: 'BTC/USDT',
            venue: 'BINANCE',
            externalSymbol: 'BTCUSDT',
          },
          enabled: true,
          targetNotional: '100',
          maxTradeNotional: '150',
          maxPositionNotional: '400',
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
        configuredInstruments: [],
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
        appCode: AppResponseCode.PORTFOLIO_NOT_FOUND,
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
        code: AppResponseCode.PORTFOLIO_NOT_FOUND,
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
        configuredInstruments: [],
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
        code: AppResponseCode.UPSTREAM_UNAVAILABLE,
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
        configuredInstruments: [],
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
        code: AppResponseCode.UPSTREAM_UNAVAILABLE,
      },
      status: HttpStatus.BAD_GATEWAY,
    });
  });

  describe('registerPortfolioInstrument', () => {
    const registrationPayload = Object.assign(
      new RegisterPortfolioInstrumentRequestDto(),
      {
        symbol: 'AAPL',
        assetClass: 'stock',
        venue: 'NASDAQ',
        externalSymbol: 'AAPL',
        enabled: true,
        targetNotional: '100',
        maxTradeNotional: '25',
        maxPositionNotional: '400',
      },
    );

    it('maps a successful upstream response to a portfolio instrument config', async () => {
      portfolioClient.registerPortfolioInstrument.mockReturnValue(
        of({
          configuredInstrument: {
            portfolioId: 'portfolio-alpha',
            instrument: {
              id: 'instrument-aapl',
              assetClass: AssetClass.STOCK,
              symbol: 'AAPL',
              venue: 'NASDAQ',
              externalSymbol: 'AAPL',
            },
            enabled: true,
            targetNotional: '100',
            maxTradeNotional: '25',
            maxPositionNotional: '400',
            updatedAt: '2026-03-25T12:00:05.000Z',
          },
        }),
      );

      await expect(
        lastValueFrom(
          service.registerPortfolioInstrument(
            'portfolio-alpha',
            registrationPayload,
          ),
        ),
      ).resolves.toEqual({
        portfolioId: 'portfolio-alpha',
        instrument: {
          id: 'instrument-aapl',
          assetClass: 'stock',
          symbol: 'AAPL',
          venue: 'NASDAQ',
          externalSymbol: 'AAPL',
        },
        enabled: true,
        targetNotional: '100',
        maxTradeNotional: '25',
        maxPositionNotional: '400',
        updatedAt: '2026-03-25T12:00:05.000Z',
      });
      expect(
        portfolioClient.registerPortfolioInstrument.mock.calls[0]?.[0],
      ).toEqual({
        portfolioId: 'portfolio-alpha',
        symbol: 'AAPL',
        assetClass: AssetClass.STOCK,
        venue: 'NASDAQ',
        externalSymbol: 'AAPL',
        enabled: true,
        targetNotional: '100',
        maxTradeNotional: '25',
        maxPositionNotional: '400',
      });
    });

    it('maps a duplicate portfolio attachment to HTTP 409 without transport details', async () => {
      portfolioClient.registerPortfolioInstrument.mockReturnValue(
        throwError(() => ({
          code: GrpcStatusCode.ALREADY_EXISTS,
          appCode: AppResponseCode.INSTRUMENT_ALREADY_ATTACHED,
          details: 'Instrument already attached to portfolio',
        })),
      );

      await expect(
        lastValueFrom(
          service.registerPortfolioInstrument(
            'portfolio-alpha',
            registrationPayload,
          ),
        ),
      ).rejects.toMatchObject({
        response: {
          message: 'Instrument already attached to portfolio',
          code: AppResponseCode.INSTRUMENT_ALREADY_ATTACHED,
        },
        status: HttpStatus.CONFLICT,
      });
    });

    it('maps a metadata conflict to HTTP 409 with a distinct app code', async () => {
      portfolioClient.registerPortfolioInstrument.mockReturnValue(
        throwError(() => ({
          code: GrpcStatusCode.ALREADY_EXISTS,
          appCode: AppResponseCode.INSTRUMENT_METADATA_CONFLICT,
          details: 'Instrument metadata conflicts with existing instrument',
        })),
      );

      await expect(
        lastValueFrom(
          service.registerPortfolioInstrument(
            'portfolio-alpha',
            registrationPayload,
          ),
        ),
      ).rejects.toMatchObject({
        response: {
          message: 'Instrument metadata conflicts with existing instrument',
          code: AppResponseCode.INSTRUMENT_METADATA_CONFLICT,
        },
        status: HttpStatus.CONFLICT,
      });
    });

    it('maps a registration timeout to HTTP 504', async () => {
      portfolioClient.registerPortfolioInstrument.mockReturnValue(
        throwError(() => new TimeoutError()),
      );

      await expect(
        lastValueFrom(
          service.registerPortfolioInstrument(
            'portfolio-alpha',
            registrationPayload,
          ),
        ),
      ).rejects.toMatchObject({
        response: {
          message: 'Timed out while trying to register portfolio instrument',
          code: AppResponseCode.UPSTREAM_TIMEOUT,
        },
        status: HttpStatus.GATEWAY_TIMEOUT,
      });
    });
  });

  it('maps a getPortfolio timeout to HTTP 504', async () => {
    portfolioClient.getPortfolio.mockReturnValue(
      throwError(() => new TimeoutError()),
    );
    executionClient.listPortfolioExecutionOrders.mockReturnValue(
      of({ orders: [] }),
    );

    await expect(
      lastValueFrom(service.getPortfolio('portfolio-alpha', 10)),
    ).rejects.toMatchObject({
      response: {
        message: 'Timed out while trying to get portfolio',
        code: AppResponseCode.UPSTREAM_TIMEOUT,
      },
      status: HttpStatus.GATEWAY_TIMEOUT,
    });
  });

  describe('updatePortfolio', () => {
    it('returns updated portfolio summary', async () => {
      portfolioClient.updatePortfolio.mockReturnValue(
        of({
          summary: {
            portfolioId: 'portfolio-alpha',
            name: 'Alpha Portfolio',
            isActive: false,
            exposureCapNotional: '2000',
            aggregateExposureNotional: '0',
            openPositionCount: 0,
            updatedAt: '2026-05-21T10:00:00.000Z',
          },
        }),
      );

      const dto = Object.assign(new UpdatePortfolioRestRequestDto(), {
        isActive: false,
        exposureCapNotional: '2000',
      });

      await expect(
        lastValueFrom(service.updatePortfolio('portfolio-alpha', dto)),
      ).resolves.toMatchObject({
        portfolioId: 'portfolio-alpha',
        isActive: false,
        exposureCapNotional: '2000',
      });

      expect(portfolioClient.updatePortfolio.mock.calls).toEqual([
        [
          {
            portfolioId: 'portfolio-alpha',
            isActive: false,
            exposureCapNotional: '2000',
          },
        ],
      ]);
    });

    it('throws 404 for unknown portfolio', async () => {
      portfolioClient.updatePortfolio.mockReturnValue(
        throwError(() => ({
          code: GrpcStatusCode.NOT_FOUND,
          appCode: AppResponseCode.PORTFOLIO_NOT_FOUND,
          details: 'Portfolio not found',
        })),
      );

      const dto = Object.assign(new UpdatePortfolioRestRequestDto(), {
        isActive: false,
      });

      await expect(
        lastValueFrom(service.updatePortfolio('missing', dto)),
      ).rejects.toMatchObject({
        response: {
          message: 'Portfolio not found',
          code: AppResponseCode.PORTFOLIO_NOT_FOUND,
        },
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('throws 502 when upstream returns no summary', async () => {
      portfolioClient.updatePortfolio.mockReturnValue(
        of({ summary: undefined }),
      );

      const dto = Object.assign(new UpdatePortfolioRestRequestDto(), {});

      await expect(
        lastValueFrom(service.updatePortfolio('portfolio-alpha', dto)),
      ).rejects.toMatchObject({
        response: { code: AppResponseCode.UPSTREAM_UNAVAILABLE },
        status: HttpStatus.BAD_GATEWAY,
      });
    });
  });

  describe('updatePortfolioInstrumentConfig', () => {
    it('returns updated configured instrument', async () => {
      portfolioClient.updatePortfolioInstrumentConfig.mockReturnValue(
        of({
          configuredInstrument: {
            portfolioId: 'portfolio-alpha',
            instrument: {
              id: 'instrument-1',
              assetClass: AssetClass.CRYPTO,
              symbol: 'BTC/USDT',
              venue: 'BINANCE',
              externalSymbol: 'BTCUSDT',
            },
            enabled: false,
            targetNotional: '100',
            maxTradeNotional: '150',
            maxPositionNotional: '400',
            updatedAt: '2026-05-21T10:00:00.000Z',
          },
        }),
      );

      const dto = Object.assign(
        new UpdatePortfolioInstrumentConfigRestRequestDto(),
        { enabled: false },
      );

      await expect(
        lastValueFrom(
          service.updatePortfolioInstrumentConfig(
            'portfolio-alpha',
            'instrument-1',
            dto,
          ),
        ),
      ).resolves.toMatchObject({
        portfolioId: 'portfolio-alpha',
        enabled: false,
      });

      expect(
        portfolioClient.updatePortfolioInstrumentConfig.mock.calls,
      ).toEqual([
        [
          {
            portfolioId: 'portfolio-alpha',
            instrumentId: 'instrument-1',
            enabled: false,
          },
        ],
      ]);
    });

    it('throws 404 for unknown instrument config', async () => {
      portfolioClient.updatePortfolioInstrumentConfig.mockReturnValue(
        throwError(() => ({
          code: GrpcStatusCode.NOT_FOUND,
          appCode: AppResponseCode.INSTRUMENT_CONFIG_NOT_FOUND,
          details: 'Instrument config not found',
        })),
      );

      const dto = Object.assign(
        new UpdatePortfolioInstrumentConfigRestRequestDto(),
        { enabled: true },
      );

      await expect(
        lastValueFrom(
          service.updatePortfolioInstrumentConfig(
            'portfolio-alpha',
            'missing',
            dto,
          ),
        ),
      ).rejects.toMatchObject({
        response: {
          message: 'Instrument config not found',
          code: AppResponseCode.INSTRUMENT_CONFIG_NOT_FOUND,
        },
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('listRiskDecisions', () => {
    it('returns decisions list', async () => {
      portfolioClient.listRiskDecisions.mockReturnValue(
        of({
          decisions: [
            {
              id: 'dec-1',
              portfolioId: 'portfolio-alpha',
              instrumentId: 'instrument-1',
              decision: 'REJECTED',
              reasonCodes: ['TRADE_CAP_EXCEEDED'],
              requestedNotional: '500',
              referencePrice: '10000',
              decidedAt: '2026-05-21T10:00:00.000Z',
              sourceEventId: 'evt-1',
            },
          ],
        }),
      );

      const query = Object.assign(new ListRiskDecisionsQueryDto(), {});

      await expect(
        lastValueFrom(service.listRiskDecisions('portfolio-alpha', query)),
      ).resolves.toEqual({
        decisions: [
          {
            id: 'dec-1',
            portfolioId: 'portfolio-alpha',
            instrumentId: 'instrument-1',
            decision: 'REJECTED',
            reasonCodes: ['TRADE_CAP_EXCEEDED'],
            requestedNotional: '500',
            referencePrice: '10000',
            decidedAt: '2026-05-21T10:00:00.000Z',
            sourceEventId: 'evt-1',
          },
        ],
      });
    });

    it('forwards decisionFilter to the gRPC client', async () => {
      portfolioClient.listRiskDecisions.mockReturnValue(of({ decisions: [] }));

      const query = Object.assign(new ListRiskDecisionsQueryDto(), {
        decisionFilter: 'REJECTED',
        limit: 10,
      });

      await lastValueFrom(service.listRiskDecisions('portfolio-alpha', query));

      expect(portfolioClient.listRiskDecisions.mock.calls).toEqual([
        [
          {
            portfolioId: 'portfolio-alpha',
            decisionFilter: 'REJECTED',
            limit: 10,
          },
        ],
      ]);
    });
  });

  describe('listRiskConfigAuditLog', () => {
    it('returns audit entries list', async () => {
      portfolioClient.listRiskConfigAuditLog.mockReturnValue(
        of({
          entries: [
            {
              id: 'audit-1',
              entityType: 'INSTRUMENT_CONFIG',
              portfolioId: 'portfolio-alpha',
              field: 'enabled',
              oldValue: 'true',
              newValue: 'false',
              changedAt: '2026-05-21T10:00:00.000Z',
            },
          ],
        }),
      );

      const query = Object.assign(new ListRiskConfigAuditLogQueryDto(), {});

      await expect(
        lastValueFrom(service.listRiskConfigAuditLog('portfolio-alpha', query)),
      ).resolves.toEqual({
        entries: [
          {
            id: 'audit-1',
            entityType: 'INSTRUMENT_CONFIG',
            portfolioId: 'portfolio-alpha',
            field: 'enabled',
            oldValue: 'true',
            newValue: 'false',
            changedAt: '2026-05-21T10:00:00.000Z',
          },
        ],
      });
    });

    it('forwards nextCursor from the gRPC response', async () => {
      portfolioClient.listRiskConfigAuditLog.mockReturnValue(
        of({ entries: [], nextCursor: 'cursor-abc' }),
      );

      const query = Object.assign(new ListRiskConfigAuditLogQueryDto(), {});

      await expect(
        lastValueFrom(service.listRiskConfigAuditLog('portfolio-alpha', query)),
      ).resolves.toMatchObject({ nextCursor: 'cursor-abc' });
    });
  });
});
