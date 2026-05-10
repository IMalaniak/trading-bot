import { Test } from '@nestjs/testing';
import { AppResponseCode } from '@trading-bot/common';
import {
  AssetClass,
  RegisterPortfolioInstrumentRequest,
} from '@trading-bot/common/proto';
import type { Mock, MockedFunction } from 'vitest';

import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentRegisteredEventFactory } from './events/instrument-registered-event.factory';
import { InstrumentMapper } from './mapper/instrument.mapper';
import { PortfolioReadMapper } from './mapper/portfolio-read.mapper';
import {
  INSTRUMENT_ALREADY_ATTACHED_ERROR,
  INSTRUMENT_METADATA_CONFLICT_ERROR,
  PortfolioService,
} from './portfolio.service';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let prismaService: PrismaService;
  let enqueueEventMock: MockedFunction<EventDispatcherService['enqueueEvent']>;
  let eventDispatcher: {
    enqueueEvent: EventDispatcherService['enqueueEvent'];
  };

  beforeEach(async () => {
    enqueueEventMock = vi.fn().mockResolvedValue('event-1');
    eventDispatcher = {
      enqueueEvent: enqueueEventMock,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: PrismaService,
          useValue: {
            portfolio: {
              findUnique: vi.fn(),
            },
            instrument: {
              create: vi.fn(),
              findFirst: vi.fn(),
            },
            portfolioInstrumentConfig: {
              create: vi.fn(),
              findUnique: vi.fn(),
            },
            $transaction: vi.fn(),
          },
        },
        {
          provide: EventDispatcherService,
          useValue: eventDispatcher,
        },
        InstrumentMapper,
        PortfolioReadMapper,
        InstrumentRegisteredEventFactory,
      ],
    }).compile();

    service = moduleRef.get(PortfolioService);
    prismaService = moduleRef.get(PrismaService);
  });

  describe('registerPortfolioInstrument', () => {
    const portfolioInstrumentRequest: RegisterPortfolioInstrumentRequest = {
      portfolioId: 'portfolio-alpha',
      assetClass: AssetClass.STOCK,
      symbol: 'AAPL',
      venue: 'NASDAQ',
      externalSymbol: 'AAPL',
      enabled: true,
      targetNotional: '100',
      maxTradeNotional: '25',
      maxPositionNotional: '400',
    };

    const updatedAt = new Date('2026-03-25T12:00:00.000Z');
    const expectRpcAppCode = async (
      promise: Promise<unknown>,
      appCode: AppResponseCode,
    ) => {
      let caught: unknown;

      try {
        await promise;
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      const payload = (
        caught as {
          getError?: () => unknown;
        }
      ).getError?.();

      expect(payload).toEqual(expect.objectContaining({ appCode }));
    };

    it('creates a new instrument and portfolio config transactionally', async () => {
      const createdInstrument = {
        id: 'instrument-aapl',
        assetClass: AssetClass.STOCK,
        symbol: 'AAPL',
        venue: 'NASDAQ',
        externalSymbol: 'AAPL',
      };
      const createdConfig = {
        id: 'config-1',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-aapl',
        enabled: true,
        targetNotional: '100',
        maxTradeNotional: '25',
        maxPositionNotional: '400',
        createdAt: updatedAt,
        updatedAt,
        instrument: createdInstrument,
      };
      const tx = {
        portfolio: {
          findUnique: vi.fn().mockResolvedValue({ id: 'portfolio-alpha' }),
        },
        instrument: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(createdInstrument),
        },
        portfolioInstrumentConfig: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(createdConfig),
        },
        $executeRaw: vi.fn(),
      };
      (prismaService.$transaction as Mock).mockImplementation(
        (cb: (client: typeof tx) => unknown) => cb(tx),
      );

      await expect(
        service.registerPortfolioInstrument(portfolioInstrumentRequest),
      ).resolves.toEqual({
        configuredInstrument: {
          portfolioId: 'portfolio-alpha',
          instrument: createdInstrument,
          enabled: true,
          targetNotional: '100',
          maxTradeNotional: '25',
          maxPositionNotional: '400',
          updatedAt: '2026-03-25T12:00:00.000Z',
        },
      });
      expect(tx.instrument.create).toHaveBeenCalledWith({
        data: {
          symbol: 'AAPL',
          assetClass: AssetClass.STOCK,
          venue: 'NASDAQ',
          externalSymbol: 'AAPL',
        },
      });
      expect(tx.portfolioInstrumentConfig.create).toHaveBeenCalledWith({
        data: {
          portfolioId: 'portfolio-alpha',
          instrumentId: 'instrument-aapl',
          enabled: true,
          targetNotional: '100',
          maxTradeNotional: '25',
          maxPositionNotional: '400',
        },
        include: {
          instrument: true,
        },
      });
      expect(eventDispatcher.enqueueEvent).toHaveBeenCalledTimes(1);
    });

    it('attaches an existing matching instrument without emitting a registration event', async () => {
      const existingInstrument = {
        id: 'instrument-aapl',
        assetClass: AssetClass.STOCK,
        symbol: 'AAPL',
        venue: 'NASDAQ',
        externalSymbol: 'AAPL',
      };
      const tx = {
        portfolio: {
          findUnique: vi.fn().mockResolvedValue({ id: 'portfolio-alpha' }),
        },
        instrument: {
          findFirst: vi.fn().mockResolvedValue(existingInstrument),
          create: vi.fn(),
        },
        portfolioInstrumentConfig: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: 'config-1',
            portfolioId: 'portfolio-alpha',
            instrumentId: 'instrument-aapl',
            enabled: true,
            targetNotional: '100',
            maxTradeNotional: '25',
            maxPositionNotional: '400',
            createdAt: updatedAt,
            updatedAt,
            instrument: existingInstrument,
          }),
        },
      };
      (prismaService.$transaction as Mock).mockImplementation(
        (cb: (client: typeof tx) => unknown) => cb(tx),
      );

      await expect(
        service.registerPortfolioInstrument(portfolioInstrumentRequest),
      ).resolves.toMatchObject({
        configuredInstrument: {
          portfolioId: 'portfolio-alpha',
          instrument: existingInstrument,
        },
      });
      expect(tx.instrument.create).not.toHaveBeenCalled();
      expect(eventDispatcher.enqueueEvent).not.toHaveBeenCalled();
    });

    it('rejects missing portfolios with a portfolio not found app code', async () => {
      const tx = {
        portfolio: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        instrument: {
          findFirst: vi.fn(),
          create: vi.fn(),
        },
        portfolioInstrumentConfig: {
          findUnique: vi.fn(),
          create: vi.fn(),
        },
      };
      (prismaService.$transaction as Mock).mockImplementation(
        (cb: (client: typeof tx) => unknown) => cb(tx),
      );

      await expectRpcAppCode(
        service.registerPortfolioInstrument(portfolioInstrumentRequest),
        AppResponseCode.PORTFOLIO_NOT_FOUND,
      );
      expect(tx.instrument.findFirst).not.toHaveBeenCalled();
    });

    it('rejects instruments already attached to the portfolio', async () => {
      const existingInstrument = {
        id: 'instrument-aapl',
        assetClass: AssetClass.STOCK,
        symbol: 'AAPL',
        venue: 'NASDAQ',
        externalSymbol: 'AAPL',
      };
      const tx = {
        portfolio: {
          findUnique: vi.fn().mockResolvedValue({ id: 'portfolio-alpha' }),
        },
        instrument: {
          findFirst: vi.fn().mockResolvedValue(existingInstrument),
          create: vi.fn(),
        },
        portfolioInstrumentConfig: {
          findUnique: vi.fn().mockResolvedValue({ id: 'config-1' }),
          create: vi.fn(),
        },
      };
      (prismaService.$transaction as Mock).mockImplementation(
        (cb: (client: typeof tx) => unknown) => cb(tx),
      );

      const promise = service.registerPortfolioInstrument(
        portfolioInstrumentRequest,
      );

      await expect(promise).rejects.toThrow(INSTRUMENT_ALREADY_ATTACHED_ERROR);
      await expectRpcAppCode(
        promise,
        AppResponseCode.INSTRUMENT_ALREADY_ATTACHED,
      );
      expect(tx.portfolioInstrumentConfig.create).not.toHaveBeenCalled();
    });

    it('rejects existing instruments with conflicting metadata', async () => {
      const tx = {
        portfolio: {
          findUnique: vi.fn().mockResolvedValue({ id: 'portfolio-alpha' }),
        },
        instrument: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'instrument-aapl',
            assetClass: AssetClass.CRYPTO,
            symbol: 'AAPL',
            venue: 'NASDAQ',
            externalSymbol: 'AAPL',
          }),
          create: vi.fn(),
        },
        portfolioInstrumentConfig: {
          findUnique: vi.fn(),
          create: vi.fn(),
        },
      };
      (prismaService.$transaction as Mock).mockImplementation(
        (cb: (client: typeof tx) => unknown) => cb(tx),
      );

      const promise = service.registerPortfolioInstrument(
        portfolioInstrumentRequest,
      );

      await expect(promise).rejects.toThrow(INSTRUMENT_METADATA_CONFLICT_ERROR);
      await expectRpcAppCode(
        promise,
        AppResponseCode.INSTRUMENT_METADATA_CONFLICT,
      );
      expect(tx.portfolioInstrumentConfig.findUnique).not.toHaveBeenCalled();
    });
  });
});
