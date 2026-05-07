import { PrismaService } from '../../prisma/prisma.service';
import { PortfolioQueryRepository } from './portfolio-query.repository';

describe('PortfolioQueryRepository', () => {
  let prisma: {
    portfolio: {
      findUnique: jest.Mock;
    };
    portfolioPosition: {
      findMany: jest.Mock;
      aggregate: jest.Mock;
      findFirst: jest.Mock;
    };
    portfolioSummarySnapshot: {
      findFirst: jest.Mock;
    };
    instrument: {
      findMany: jest.Mock;
    };
  };
  let repository: PortfolioQueryRepository;

  beforeEach(() => {
    prisma = {
      portfolio: {
        findUnique: jest.fn(),
      },
      portfolioPosition: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
        findFirst: jest.fn(),
      },
      portfolioSummarySnapshot: {
        findFirst: jest.fn(),
      },
      instrument: {
        findMany: jest.fn(),
      },
    };
    repository = new PortfolioQueryRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('uses the newest timestamp across portfolio, snapshot, and position state', async () => {
    const portfolioUpdatedAt = new Date('2026-03-25T12:00:00.000Z');
    const snapshotUpdatedAt = new Date('2026-03-25T12:00:05.000Z');
    const positionUpdatedAt = new Date('2026-03-25T12:00:10.000Z');

    prisma.portfolio.findUnique.mockResolvedValue({
      id: 'portfolio-alpha',
      updatedAt: portfolioUpdatedAt,
    });
    prisma.portfolioPosition.findMany.mockResolvedValue([]);
    prisma.portfolioPosition.aggregate.mockResolvedValue({
      _sum: { exposureNotional: null },
    });
    prisma.portfolioSummarySnapshot.findFirst.mockResolvedValue({
      updatedAt: snapshotUpdatedAt,
    });
    prisma.portfolioPosition.findFirst.mockResolvedValue({
      updatedAt: positionUpdatedAt,
    });

    await expect(
      repository.findPortfolio('portfolio-alpha'),
    ).resolves.toMatchObject({
      updatedAt: positionUpdatedAt,
    });
  });
});
