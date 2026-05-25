import { ValidationPipe } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { lastValueFrom, of } from 'rxjs';

import { validationPipeOptions } from '../app-setup';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

describe('PortfolioController', () => {
  let controller: PortfolioController;
  let service: {
    listPortfolios: ReturnType<typeof vi.fn>;
    getPortfolio: ReturnType<typeof vi.fn>;
    registerPortfolioInstrument: ReturnType<typeof vi.fn>;
    updatePortfolio: ReturnType<typeof vi.fn>;
    updatePortfolioInstrumentConfig: ReturnType<typeof vi.fn>;
    listRiskDecisions: ReturnType<typeof vi.fn>;
    listRiskConfigAuditLog: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      listPortfolios: vi.fn(),
      getPortfolio: vi.fn(),
      registerPortfolioInstrument: vi.fn(),
      updatePortfolio: vi.fn(),
      updatePortfolioInstrumentConfig: vi.fn(),
      listRiskDecisions: vi.fn(),
      listRiskConfigAuditLog: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortfolioController],
      providers: [
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe(validationPipeOptions),
        },
        {
          provide: PortfolioService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<PortfolioController>(PortfolioController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('uses the plural REST resource path', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PortfolioController)).toBe(
      'portfolios',
    );
  });

  it('updatePortfolio delegates to the service', async () => {
    const summary = {
      portfolioId: 'portfolio-alpha',
      name: 'Alpha Portfolio',
      isActive: false,
      exposureCapNotional: '2000',
      aggregateExposureNotional: '0',
      openPositionCount: 0,
      updatedAt: '2026-05-21T10:00:00.000Z',
    };
    service.updatePortfolio.mockReturnValue(of(summary));

    const result = await lastValueFrom(
      controller.updatePortfolio({ portfolioId: 'portfolio-alpha' }, {
        isActive: false,
        exposureCapNotional: '2000',
      } as never),
    );

    expect(result).toEqual(summary);
    expect(service.updatePortfolio).toHaveBeenCalledWith('portfolio-alpha', {
      isActive: false,
      exposureCapNotional: '2000',
    });
  });

  it('updatePortfolioInstrumentConfig delegates to the service', async () => {
    const config = {
      portfolioId: 'portfolio-alpha',
      instrument: { id: 'instrument-1', symbol: 'BTC/USDT' },
      enabled: false,
      targetNotional: '100',
      maxTradeNotional: '150',
      maxPositionNotional: '400',
      updatedAt: '2026-05-21T10:00:00.000Z',
    };
    service.updatePortfolioInstrumentConfig.mockReturnValue(of(config));

    const result = await lastValueFrom(
      controller.updatePortfolioInstrumentConfig(
        { portfolioId: 'portfolio-alpha', instrumentId: 'instrument-1' },
        { enabled: false } as never,
      ),
    );

    expect(result).toEqual(config);
    expect(service.updatePortfolioInstrumentConfig).toHaveBeenCalledWith(
      'portfolio-alpha',
      'instrument-1',
      { enabled: false },
    );
  });

  it('listRiskDecisions delegates to the service', async () => {
    const response = { decisions: [], nextCursor: undefined };
    service.listRiskDecisions.mockReturnValue(of(response));

    const result = await lastValueFrom(
      controller.listRiskDecisions({ portfolioId: 'portfolio-alpha' }, {}),
    );

    expect(result).toEqual(response);
    expect(service.listRiskDecisions).toHaveBeenCalledWith(
      'portfolio-alpha',
      {},
    );
  });

  it('listRiskConfigAuditLog delegates to the service', async () => {
    const response = { entries: [], nextCursor: undefined };
    service.listRiskConfigAuditLog.mockReturnValue(of(response));

    const result = await lastValueFrom(
      controller.listRiskConfigAuditLog({ portfolioId: 'portfolio-alpha' }, {}),
    );

    expect(result).toEqual(response);
    expect(service.listRiskConfigAuditLog).toHaveBeenCalledWith(
      'portfolio-alpha',
      {},
    );
  });
});
