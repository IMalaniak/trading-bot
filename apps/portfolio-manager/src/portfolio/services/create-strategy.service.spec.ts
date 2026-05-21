import { RpcException } from '@nestjs/microservices';
import type { MockedFunction } from 'vitest';

import type { StrategyModel } from '../../prisma/generated/models';
import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';
import { CreateStrategyService } from './create-strategy.service';

const now = new Date('2026-05-21T10:00:00.000Z');

const strategyModel: StrategyModel = {
  id: 'strategy-1',
  name: 'Momentum Only',
  description: 'Momentum strategy',
  allowedSides: [1],
  minIntervalSecs: 300,
  activeTimeStart: '09:00',
  activeTimeEnd: '17:00',
  createdAt: now,
  updatedAt: now,
};

describe('CreateStrategyService', () => {
  let repository: {
    findStrategyByName: MockedFunction<
      PortfolioWriteRepository['findStrategyByName']
    >;
    createStrategy: MockedFunction<PortfolioWriteRepository['createStrategy']>;
  };
  let mapper: {
    mapStrategy: MockedFunction<PortfolioReadMapper['mapStrategy']>;
  };
  let service: CreateStrategyService;

  beforeEach(() => {
    repository = {
      findStrategyByName: vi.fn(),
      createStrategy: vi.fn(),
    };
    mapper = { mapStrategy: vi.fn() };
    service = new CreateStrategyService(
      repository as unknown as PortfolioWriteRepository,
      mapper as unknown as PortfolioReadMapper,
    );
  });

  it('creates strategy and returns mapped response', async () => {
    repository.findStrategyByName.mockResolvedValue(null);
    repository.createStrategy.mockResolvedValue(strategyModel);
    mapper.mapStrategy.mockReturnValue({
      id: 'strategy-1',
      name: 'Momentum Only',
      allowedSides: [1],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const result = await service.createStrategy({
      name: 'Momentum Only',
      allowedSides: [1],
      minIntervalSecs: 300,
      activeTimeStart: '09:00',
      activeTimeEnd: '17:00',
    });

    expect(repository.createStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Momentum Only', allowedSides: [1] }),
    );
    expect(result.strategy?.id).toBe('strategy-1');
  });

  it('throws ALREADY_EXISTS when name is taken', async () => {
    repository.findStrategyByName.mockResolvedValue(strategyModel);

    await expect(
      service.createStrategy({ name: 'Momentum Only', allowedSides: [] }),
    ).rejects.toBeInstanceOf(RpcException);
  });
});
