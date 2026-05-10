import type { Mock } from 'vitest';

import { PrismaService } from '../../prisma/prisma.service';
import { PortfolioQueryRepository } from './portfolio-query.repository';

describe('PortfolioQueryRepository', () => {
  let prisma: {
    portfolio: {
      findUnique: Mock;
      findMany: Mock;
    };
    portfolioPosition: {
      findMany: Mock;
      aggregate: Mock;
      findFirst: Mock;
      count: Mock;
      groupBy: Mock;
    };
    portfolioSummarySnapshot: {
      findFirst: Mock;
      groupBy: Mock;
    };
    portfolioInstrumentConfig: {
      findMany: Mock;
      findFirst: Mock;
      groupBy: Mock;
    };
    instrument: {
      findMany: Mock;
    };
  };
  let repository: PortfolioQueryRepository;

  beforeEach(() => {
    prisma = {
      portfolio: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      portfolioPosition: {
        findMany: vi.fn(),
        aggregate: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
      },
      portfolioSummarySnapshot: {
        findFirst: vi.fn(),
        groupBy: vi.fn(),
      },
      portfolioInstrumentConfig: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        groupBy: vi.fn(),
      },
      instrument: {
        findMany: vi.fn(),
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
    prisma.portfolioPosition.count.mockResolvedValue(0);
    prisma.portfolioSummarySnapshot.findFirst.mockResolvedValue({
      updatedAt: snapshotUpdatedAt,
    });
    prisma.portfolioPosition.findFirst.mockResolvedValue({
      updatedAt: positionUpdatedAt,
    });
    prisma.portfolioInstrumentConfig.findMany.mockResolvedValue([]);
    prisma.portfolioInstrumentConfig.findFirst.mockResolvedValue(null);

    await expect(
      repository.findPortfolio('portfolio-alpha'),
    ).resolves.toMatchObject({
      updatedAt: positionUpdatedAt,
    });
  });

  it('lists portfolio summaries active first and then by name and id', async () => {
    const updatedAt = new Date('2026-03-25T12:00:00.000Z');
    prisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'portfolio-alpha',
        name: 'Alpha Portfolio',
        isActive: true,
        exposureCapNotional: '1000',
        createdAt: updatedAt,
        updatedAt,
      },
    ]);
    prisma.portfolioPosition.groupBy.mockResolvedValue([]);
    prisma.portfolioSummarySnapshot.groupBy.mockResolvedValue([]);
    prisma.portfolioInstrumentConfig.groupBy.mockResolvedValue([]);

    await expect(repository.listPortfolioSummaries()).resolves.toHaveLength(1);
    expect(prisma.portfolio.findMany).toHaveBeenCalledWith({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
  });
});
