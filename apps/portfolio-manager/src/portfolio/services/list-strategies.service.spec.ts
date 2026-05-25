import type { MockedFunction } from 'vitest';

import type { StrategyModel } from '../../prisma/generated/models';
import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';
import { ListStrategiesService } from './list-strategies.service';

const now = new Date('2026-05-21T10:00:00.000Z');

const strategyModels: StrategyModel[] = [
  {
    id: 'strategy-1',
    name: 'Alpha',
    description: null,
    allowedSides: [1],
    minIntervalSecs: null,
    activeTimeStart: null,
    activeTimeEnd: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'strategy-2',
    name: 'Beta',
    description: 'A beta strategy',
    allowedSides: [1, 2],
    minIntervalSecs: 60,
    activeTimeStart: '09:00',
    activeTimeEnd: '17:00',
    createdAt: now,
    updatedAt: now,
  },
];

describe('ListStrategiesService', () => {
  let repository: {
    listStrategies: MockedFunction<PortfolioWriteRepository['listStrategies']>;
  };
  let mapper: {
    mapStrategy: MockedFunction<PortfolioReadMapper['mapStrategy']>;
  };
  let service: ListStrategiesService;

  beforeEach(() => {
    repository = { listStrategies: vi.fn() };
    mapper = { mapStrategy: vi.fn() };
    service = new ListStrategiesService(
      repository as unknown as PortfolioWriteRepository,
      mapper as unknown as PortfolioReadMapper,
    );
  });

  it('returns empty array when no strategies exist', async () => {
    repository.listStrategies.mockResolvedValue([]);

    const result = await service.listStrategies();

    expect(result.strategies).toEqual([]);
  });

  it('returns mapped strategies', async () => {
    repository.listStrategies.mockResolvedValue(strategyModels);
    mapper.mapStrategy.mockReturnValueOnce({
      id: 'strategy-1',
      name: 'Alpha',
      allowedSides: [1],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    mapper.mapStrategy.mockReturnValueOnce({
      id: 'strategy-2',
      name: 'Beta',
      allowedSides: [1, 2],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const result = await service.listStrategies();

    expect(result.strategies).toHaveLength(2);
    expect(result.strategies[0].id).toBe('strategy-1');
    expect(result.strategies[1].id).toBe('strategy-2');
  });
});
