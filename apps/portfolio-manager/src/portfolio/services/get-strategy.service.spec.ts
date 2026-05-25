import { RpcException } from '@nestjs/microservices';
import type { MockedFunction } from 'vitest';

import type { StrategyModel } from '../../prisma/generated/models';
import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';
import { GetStrategyService } from './get-strategy.service';

const now = new Date('2026-05-21T10:00:00.000Z');

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

describe('GetStrategyService', () => {
  let repository: {
    findStrategyById: MockedFunction<
      PortfolioWriteRepository['findStrategyById']
    >;
  };
  let mapper: {
    mapStrategy: MockedFunction<PortfolioReadMapper['mapStrategy']>;
  };
  let service: GetStrategyService;

  beforeEach(() => {
    repository = { findStrategyById: vi.fn() };
    mapper = { mapStrategy: vi.fn() };
    service = new GetStrategyService(
      repository as unknown as PortfolioWriteRepository,
      mapper as unknown as PortfolioReadMapper,
    );
  });

  it('throws NOT_FOUND when strategy does not exist', async () => {
    repository.findStrategyById.mockResolvedValue(null);

    await expect(
      service.getStrategy({ strategyId: 'missing' }),
    ).rejects.toBeInstanceOf(RpcException);
  });

  it('returns mapped strategy', async () => {
    repository.findStrategyById.mockResolvedValue(strategyModel);
    mapper.mapStrategy.mockReturnValue({
      id: 'strategy-1',
      name: 'Alpha',
      allowedSides: [1],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const result = await service.getStrategy({ strategyId: 'strategy-1' });

    expect(result.strategy?.id).toBe('strategy-1');
  });
});
