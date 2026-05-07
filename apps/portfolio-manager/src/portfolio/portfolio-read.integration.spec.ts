import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../app.module';
import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioQueryService } from './services/portfolio-query.service';

describe('Portfolio read integration', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let portfolioQueryService: PortfolioQueryService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(portfolioManagerRuntimeConfig.KEY)
      .useValue({
        enableOutboxInterval: false,
        enableRiskPipelineConsumers: false,
        enableFillReconciliationConsumer: false,
      })
      .compile();

    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    portfolioQueryService = moduleRef.get(PortfolioQueryService);
  });

  beforeEach(async () => {
    await prisma.portfolioSummarySnapshot.deleteMany();
    await prisma.portfolioPosition.deleteMany();
    await prisma.portfolioFill.deleteMany();
    await prisma.portfolioOrder.deleteMany();
    await prisma.exposureReservation.deleteMany();
    await prisma.riskDecision.deleteMany();
    await prisma.portfolioSignalCandidateRecord.deleteMany();
    await prisma.signalReceipt.deleteMany();
    await prisma.portfolioInstrumentConfig.deleteMany();
    await prisma.portfolio.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.instrument.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await moduleRef.close();
  });

  it('returns an inactive empty portfolio with zero exposure', async () => {
    await prisma.portfolio.create({
      data: {
        id: 'portfolio-empty',
        name: 'Empty Portfolio',
        exposureCapNotional: 1000,
        isActive: false,
      },
    });

    await expect(
      portfolioQueryService.getPortfolio('portfolio-empty'),
    ).resolves.toEqual({
      summary: expect.objectContaining({
        portfolioId: 'portfolio-empty',
        name: 'Empty Portfolio',
        isActive: false,
        exposureCapNotional: '1000',
        aggregateExposureNotional: '0',
        openPositionCount: 0,
      }),
      positions: [],
    });
  });

  it('returns open positions with current aggregate exposure', async () => {
    await prisma.instrument.create({
      data: {
        id: 'instrument-1',
        assetClass: 1,
        symbol: 'BTC/USDT',
        venue: 'BINANCE',
        externalSymbol: 'BTCUSDT',
      },
    });
    await prisma.portfolio.create({
      data: {
        id: 'portfolio-alpha',
        name: 'Alpha Portfolio',
        exposureCapNotional: 1000,
      },
    });
    await prisma.portfolioPosition.create({
      data: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        quantity: '0.5',
        averageEntryPrice: '300',
        exposureNotional: '150',
        lastFillId: 'ord_abc:fill:2',
      },
    });

    await expect(
      portfolioQueryService.getPortfolio('portfolio-alpha'),
    ).resolves.toEqual({
      summary: expect.objectContaining({
        portfolioId: 'portfolio-alpha',
        aggregateExposureNotional: '150',
        openPositionCount: 1,
      }),
      positions: [
        expect.objectContaining({
          portfolioId: 'portfolio-alpha',
          quantity: '0.5',
          averageEntryPrice: '300',
          exposureNotional: '150',
          lastFillId: 'ord_abc:fill:2',
          instrument: expect.objectContaining({
            id: 'instrument-1',
            symbol: 'BTC/USDT',
          }),
        }),
      ],
    });
  });
});
