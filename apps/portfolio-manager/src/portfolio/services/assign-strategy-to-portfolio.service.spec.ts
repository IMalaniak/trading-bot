import { RpcException } from '@nestjs/microservices';
import type { MockedFunction } from 'vitest';

import type {
  PortfolioModel,
  StrategyModel,
} from '../../prisma/generated/models';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';
import { AssignStrategyToPortfolioService } from './assign-strategy-to-portfolio.service';

const now = new Date('2026-05-21T10:00:00.000Z');

const portfolioModel: PortfolioModel = {
  id: 'portfolio-1',
  name: 'Main',
  isActive: true,
  exposureCapNotional: toPrismaDecimal('10000'),
  strategyId: null,
  createdAt: now,
  updatedAt: now,
};

const strategyModel: StrategyModel = {
  id: 'strategy-1',
  name: 'Alpha',
  description: null,
  allowedSides: [1],
  minIntervalSecs: null,
  activeTimeStart: null,
  activeTimeEnd: null,
  createdAt: now,
  updatedAt: now,
};

describe('AssignStrategyToPortfolioService', () => {
  let repository: {
    findPortfolioById: MockedFunction<
      PortfolioWriteRepository['findPortfolioById']
    >;
    findStrategyById: MockedFunction<
      PortfolioWriteRepository['findStrategyById']
    >;
    assignStrategyToPortfolio: MockedFunction<
      PortfolioWriteRepository['assignStrategyToPortfolio']
    >;
  };
  let service: AssignStrategyToPortfolioService;

  beforeEach(() => {
    repository = {
      findPortfolioById: vi.fn(),
      findStrategyById: vi.fn(),
      assignStrategyToPortfolio: vi.fn(),
    };
    service = new AssignStrategyToPortfolioService(
      repository as unknown as PortfolioWriteRepository,
    );
  });

  it('throws NOT_FOUND when portfolio does not exist', async () => {
    repository.findPortfolioById.mockResolvedValue(null);

    await expect(
      service.assignStrategyToPortfolio({ portfolioId: 'missing' }),
    ).rejects.toBeInstanceOf(RpcException);
  });

  it('throws NOT_FOUND when strategy does not exist', async () => {
    repository.findPortfolioById.mockResolvedValue(portfolioModel);
    repository.findStrategyById.mockResolvedValue(null);

    await expect(
      service.assignStrategyToPortfolio({
        portfolioId: 'portfolio-1',
        strategyId: 'missing',
      }),
    ).rejects.toBeInstanceOf(RpcException);
  });

  it('clears strategy when strategyId is not provided', async () => {
    repository.findPortfolioById.mockResolvedValue(portfolioModel);
    repository.assignStrategyToPortfolio.mockResolvedValue({
      ...portfolioModel,
      strategyId: null,
    });

    const result = await service.assignStrategyToPortfolio({
      portfolioId: 'portfolio-1',
    });

    expect(repository.assignStrategyToPortfolio).toHaveBeenCalledWith(
      'portfolio-1',
      undefined,
    );
    expect(result.strategy).toBeUndefined();
  });

  it('assigns strategy when strategyId is provided', async () => {
    repository.findPortfolioById.mockResolvedValue(portfolioModel);
    repository.findStrategyById.mockResolvedValue(strategyModel);
    repository.assignStrategyToPortfolio.mockResolvedValue({
      ...portfolioModel,
      strategyId: 'strategy-1',
    });

    const result = await service.assignStrategyToPortfolio({
      portfolioId: 'portfolio-1',
      strategyId: 'strategy-1',
    });

    expect(result.strategy?.id).toBe('strategy-1');
  });
});
