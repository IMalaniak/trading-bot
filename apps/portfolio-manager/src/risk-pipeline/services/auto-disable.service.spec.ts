import type { MockedFunction } from 'vitest';

import { RiskDecisionStatus } from '../../prisma/generated/enums';
import { DecisionRepository } from '../repositories/decision.repository';
import { AutoDisableService } from './auto-disable.service';

describe('AutoDisableService', () => {
  let decisionRepository: {
    countConsecutiveRejections: MockedFunction<
      DecisionRepository['countConsecutiveRejections']
    >;
  };
  let prisma: {
    portfolioInstrumentConfig: {
      findUnique: MockedFunction<() => Promise<unknown>>;
      update: MockedFunction<() => Promise<unknown>>;
    };
    $transaction: MockedFunction<
      (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
    >;
  };
  let service: AutoDisableService;

  beforeEach(() => {
    decisionRepository = {
      countConsecutiveRejections: vi.fn(),
    };
    const txClient = {
      portfolioInstrumentConfig: {
        update: vi.fn().mockResolvedValue({}),
      },
      riskConfigAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    prisma = {
      portfolioInstrumentConfig: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockImplementation((fn) => fn(txClient)),
    };
    service = new AutoDisableService(
      decisionRepository as unknown as DecisionRepository,
      prisma as never,
    );
  });

  it('disables instrument config when consecutive rejections reach the threshold', async () => {
    decisionRepository.countConsecutiveRejections.mockResolvedValue(3);
    prisma.portfolioInstrumentConfig.findUnique.mockResolvedValue({
      id: 'config-1',
      enabled: true,
    });

    await service.handleRejection('portfolio-1', 'instrument-1', 3);

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('does not disable when threshold is null', async () => {
    await service.handleRejection('portfolio-1', 'instrument-1', null);

    expect(
      decisionRepository.countConsecutiveRejections,
    ).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not disable when consecutive count is below threshold', async () => {
    decisionRepository.countConsecutiveRejections.mockResolvedValue(2);
    prisma.portfolioInstrumentConfig.findUnique.mockResolvedValue({
      id: 'config-1',
      enabled: true,
    });

    await service.handleRejection('portfolio-1', 'instrument-1', 3);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not disable when instrument config is already disabled', async () => {
    decisionRepository.countConsecutiveRejections.mockResolvedValue(5);
    prisma.portfolioInstrumentConfig.findUnique.mockResolvedValue({
      id: 'config-1',
      enabled: false,
    });

    await service.handleRejection('portfolio-1', 'instrument-1', 3);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('DecisionRepository.countConsecutiveRejections', () => {
  let prisma: {
    riskDecision: {
      findMany: MockedFunction<() => Promise<unknown[]>>;
    };
  };
  let repository: DecisionRepository;

  beforeEach(() => {
    prisma = {
      riskDecision: {
        findMany: vi.fn(),
      },
    };
    repository = new DecisionRepository(prisma as never);
  });

  it('returns consecutive rejection count from the latest decisions', async () => {
    prisma.riskDecision.findMany.mockResolvedValue([
      { decision: RiskDecisionStatus.REJECTED },
      { decision: RiskDecisionStatus.REJECTED },
      { decision: RiskDecisionStatus.APPROVED },
      { decision: RiskDecisionStatus.REJECTED },
    ]);

    const count = await repository.countConsecutiveRejections(
      'portfolio-1',
      'instrument-1',
    );

    expect(count).toBe(2);
  });

  it('returns 0 when the most recent decision is approved', async () => {
    prisma.riskDecision.findMany.mockResolvedValue([
      { decision: RiskDecisionStatus.APPROVED },
      { decision: RiskDecisionStatus.REJECTED },
    ]);

    const count = await repository.countConsecutiveRejections(
      'portfolio-1',
      'instrument-1',
    );

    expect(count).toBe(0);
  });

  it('returns 0 when there are no decisions', async () => {
    prisma.riskDecision.findMany.mockResolvedValue([]);

    const count = await repository.countConsecutiveRejections(
      'portfolio-1',
      'instrument-1',
    );

    expect(count).toBe(0);
  });
});
