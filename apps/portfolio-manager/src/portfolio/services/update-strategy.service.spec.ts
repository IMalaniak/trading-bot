import { RpcException } from '@nestjs/microservices';
import type { MockedFunction } from 'vitest';

import type { StrategyModel } from '../../prisma/generated/models';
import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';
import { UpdateStrategyService } from './update-strategy.service';

const now = new Date('2026-05-21T10:00:00.000Z');

const strategyModel: StrategyModel = {
  id: 'strategy-1',
  name: 'Momentum Only',
  description: null,
  allowedSides: [1],
  minIntervalSecs: null,
  activeTimeStart: null,
  activeTimeEnd: null,
  createdAt: now,
  updatedAt: now,
};

describe('UpdateStrategyService', () => {
  let repository: {
    findStrategyById: MockedFunction<
      PortfolioWriteRepository['findStrategyById']
    >;
    updateStrategy: MockedFunction<PortfolioWriteRepository['updateStrategy']>;
  };
  let mapper: {
    mapStrategy: MockedFunction<PortfolioReadMapper['mapStrategy']>;
  };
  let service: UpdateStrategyService;

  beforeEach(() => {
    repository = {
      findStrategyById: vi.fn(),
      updateStrategy: vi.fn(),
    };
    mapper = { mapStrategy: vi.fn() };
    service = new UpdateStrategyService(
      repository as unknown as PortfolioWriteRepository,
      mapper as unknown as PortfolioReadMapper,
    );
  });

  it('throws NOT_FOUND when strategy does not exist', async () => {
    repository.findStrategyById.mockResolvedValue(null);

    await expect(
      service.updateStrategy({ strategyId: 'missing', allowedSides: [] }),
    ).rejects.toBeInstanceOf(RpcException);
  });

  it('updates strategy and returns mapped response', async () => {
    repository.findStrategyById.mockResolvedValue(strategyModel);
    const updated = { ...strategyModel, name: 'New Name' };
    repository.updateStrategy.mockResolvedValue(updated);
    mapper.mapStrategy.mockReturnValue({
      id: 'strategy-1',
      name: 'New Name',
      allowedSides: [1],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const result = await service.updateStrategy({
      strategyId: 'strategy-1',
      name: 'New Name',
      allowedSides: [1],
    });

    expect(repository.updateStrategy).toHaveBeenCalledWith(
      'strategy-1',
      expect.objectContaining({ name: 'New Name' }),
    );
    expect(result.strategy?.name).toBe('New Name');
  });
});
