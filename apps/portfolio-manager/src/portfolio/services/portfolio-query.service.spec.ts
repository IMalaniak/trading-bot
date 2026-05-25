import { RpcException } from '@nestjs/microservices';
import { AssetClass } from '@trading-bot/common/proto';
import type { MockedFunction } from 'vitest';

import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { InstrumentMapper } from '../mapper/instrument.mapper';
import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import { PortfolioQueryRepository } from '../repositories/portfolio-query.repository';
import { PortfolioQueryService } from './portfolio-query.service';

describe('PortfolioQueryService', () => {
  let repository: {
    findPortfolio: MockedFunction<PortfolioQueryRepository['findPortfolio']>;
    listInstruments: MockedFunction<
      PortfolioQueryRepository['listInstruments']
    >;
    listPortfolioSummaries: MockedFunction<
      PortfolioQueryRepository['listPortfolioSummaries']
    >;
  };
  let service: PortfolioQueryService;

  beforeEach(() => {
    repository = {
      findPortfolio: vi.fn(),
      listInstruments: vi.fn(),
      listPortfolioSummaries: vi.fn(),
    };
    service = new PortfolioQueryService(
      repository as unknown as PortfolioQueryRepository,
      new PortfolioReadMapper(new InstrumentMapper()),
    );
  });

  it('returns inactive portfolios with zero exposure and no positions', async () => {
    const updatedAt = new Date('2026-03-25T12:00:00.000Z');
    repository.findPortfolio.mockResolvedValue({
      portfolio: {
        id: 'portfolio-alpha',
        name: 'Alpha Portfolio',
        isActive: false,
        exposureCapNotional: toPrismaDecimal('1000'),
        strategyId: null,
        createdAt: updatedAt,
        updatedAt,
      },
      strategy: null,
      aggregateExposureNotional: toPrismaDecimal('0'),
      openPositionCount: 0,
      updatedAt,
      positions: [],
      configuredInstruments: [],
    });

    await expect(service.getPortfolio('portfolio-alpha')).resolves.toEqual({
      summary: {
        portfolioId: 'portfolio-alpha',
        name: 'Alpha Portfolio',
        isActive: false,
        exposureCapNotional: '1000',
        aggregateExposureNotional: '0',
        openPositionCount: 0,
        updatedAt: '2026-03-25T12:00:00.000Z',
      },
      positions: [],
      configuredInstruments: [],
    });
  });

  it('maps open positions with instrument details and decimal strings', async () => {
    const updatedAt = new Date('2026-03-25T12:00:05.000Z');
    repository.findPortfolio.mockResolvedValue({
      portfolio: {
        id: 'portfolio-alpha',
        name: 'Alpha Portfolio',
        isActive: true,
        exposureCapNotional: toPrismaDecimal('1000'),
        strategyId: null,
        createdAt: updatedAt,
        updatedAt,
      },
      strategy: null,
      aggregateExposureNotional: toPrismaDecimal('150.5'),
      openPositionCount: 1,
      updatedAt,
      configuredInstruments: [
        {
          id: 'config-1',
          portfolioId: 'portfolio-alpha',
          instrumentId: 'instrument-1',
          enabled: true,
          targetNotional: toPrismaDecimal('100'),
          maxTradeNotional: toPrismaDecimal('150'),
          maxPositionNotional: toPrismaDecimal('400'),
          maxOpenTrades: null,
          maxDailyTurnoverNotional: null,
          cooldownSeconds: null,
          maxConsecutiveRejections: null,
          createdAt: updatedAt,
          updatedAt,
          instrument: {
            id: 'instrument-1',
            assetClass: AssetClass.CRYPTO,
            symbol: 'BTC/USDT',
            venue: 'BINANCE',
            externalSymbol: 'BTCUSDT',
            createdAt: updatedAt,
            updatedAt,
          },
        },
      ],
      positions: [
        {
          id: 'position-1',
          portfolioId: 'portfolio-alpha',
          instrumentId: 'instrument-1',
          quantity: toPrismaDecimal('0.5'),
          averageEntryPrice: toPrismaDecimal('301'),
          exposureNotional: toPrismaDecimal('150.5'),
          lastFillId: 'ord_abc:fill:2',
          createdAt: updatedAt,
          updatedAt,
          instrument: {
            id: 'instrument-1',
            assetClass: AssetClass.CRYPTO,
            symbol: 'BTC/USDT',
            venue: 'BINANCE',
            externalSymbol: 'BTCUSDT',
            createdAt: updatedAt,
            updatedAt,
          },
        },
      ],
    });

    const response = await service.getPortfolio('portfolio-alpha');

    expect(response.configuredInstruments).toEqual([
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
    ]);
    expect(response.positions).toEqual([
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
        averageEntryPrice: '301',
        exposureNotional: '150.5',
        lastFillId: 'ord_abc:fill:2',
        updatedAt: '2026-03-25T12:00:05.000Z',
      },
    ]);
  });

  it('lists portfolio summaries', async () => {
    const updatedAt = new Date('2026-03-25T12:00:00.000Z');
    repository.listPortfolioSummaries.mockResolvedValue([
      {
        portfolio: {
          id: 'portfolio-alpha',
          name: 'Alpha Portfolio',
          isActive: true,
          exposureCapNotional: toPrismaDecimal('1000'),
          strategyId: null,
          createdAt: updatedAt,
          updatedAt,
        },
        aggregateExposureNotional: toPrismaDecimal('25'),
        openPositionCount: 2,
        updatedAt,
      },
    ]);

    await expect(service.listPortfolios()).resolves.toEqual({
      portfolios: [
        {
          portfolioId: 'portfolio-alpha',
          name: 'Alpha Portfolio',
          isActive: true,
          exposureCapNotional: '1000',
          aggregateExposureNotional: '25',
          openPositionCount: 2,
          updatedAt: '2026-03-25T12:00:00.000Z',
        },
      ],
    });
  });

  it('includes strategy in response when portfolio has an assigned strategy', async () => {
    const updatedAt = new Date('2026-03-25T12:00:00.000Z');
    repository.findPortfolio.mockResolvedValue({
      portfolio: {
        id: 'portfolio-alpha',
        name: 'Alpha Portfolio',
        isActive: true,
        exposureCapNotional: toPrismaDecimal('1000'),
        strategyId: 'strategy-1',
        createdAt: updatedAt,
        updatedAt,
      },
      strategy: {
        id: 'strategy-1',
        name: 'Momentum Only',
        description: 'A momentum-based strategy',
        allowedSides: [1, 2],
        minIntervalSecs: 300,
        activeTimeStart: null,
        activeTimeEnd: null,
        createdAt: updatedAt,
        updatedAt,
      },
      aggregateExposureNotional: toPrismaDecimal('0'),
      openPositionCount: 0,
      updatedAt,
      positions: [],
      configuredInstruments: [],
    });

    const response = await service.getPortfolio('portfolio-alpha');

    expect(response.strategy).toEqual({
      id: 'strategy-1',
      name: 'Momentum Only',
      description: 'A momentum-based strategy',
      allowedSides: [1, 2],
      minIntervalSecs: 300,
      createdAt: '2026-03-25T12:00:00.000Z',
      updatedAt: '2026-03-25T12:00:00.000Z',
    });
  });

  it('omits strategy from response when portfolio has no assigned strategy', async () => {
    const updatedAt = new Date('2026-03-25T12:00:00.000Z');
    repository.findPortfolio.mockResolvedValue({
      portfolio: {
        id: 'portfolio-alpha',
        name: 'Alpha Portfolio',
        isActive: true,
        exposureCapNotional: toPrismaDecimal('1000'),
        strategyId: null,
        createdAt: updatedAt,
        updatedAt,
      },
      strategy: null,
      aggregateExposureNotional: toPrismaDecimal('0'),
      openPositionCount: 0,
      updatedAt,
      positions: [],
      configuredInstruments: [],
    });

    const response = await service.getPortfolio('portfolio-alpha');

    expect(response.strategy).toBeUndefined();
  });

  it('throws NOT_FOUND for missing portfolios', async () => {
    repository.findPortfolio.mockResolvedValue(null);

    await expect(service.getPortfolio('missing')).rejects.toBeInstanceOf(
      RpcException,
    );
  });

  it('lists instruments for API gateway enrichment', async () => {
    const updatedAt = new Date('2026-03-25T12:00:00.000Z');
    repository.listInstruments.mockResolvedValue([
      {
        id: 'instrument-1',
        assetClass: AssetClass.CRYPTO,
        symbol: 'BTC/USDT',
        venue: 'BINANCE',
        externalSymbol: null,
        createdAt: updatedAt,
        updatedAt,
      },
    ]);

    await expect(service.listInstruments(['instrument-1'])).resolves.toEqual({
      instruments: [
        {
          id: 'instrument-1',
          assetClass: AssetClass.CRYPTO,
          symbol: 'BTC/USDT',
          venue: 'BINANCE',
          externalSymbol: undefined,
        },
      ],
    });
  });
});
