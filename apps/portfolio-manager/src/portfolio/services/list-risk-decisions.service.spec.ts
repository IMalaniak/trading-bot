import type { MockedFunction } from 'vitest';

import {
  RiskDecisionReasonCode,
  RiskDecisionStatus,
} from '../../prisma/generated/enums';
import type { RiskDecisionModel } from '../../prisma/generated/models';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import {
  PortfolioWriteRepository,
  RiskDecisionPage,
} from '../repositories/portfolio-write.repository';
import { ListRiskDecisionsService } from './list-risk-decisions.service';

describe('ListRiskDecisionsService', () => {
  const now = new Date('2026-05-21T10:00:00.000Z');

  const makeDecision = (
    overrides: Partial<RiskDecisionModel> = {},
  ): RiskDecisionModel => ({
    id: 'dec-1',
    candidateIdempotencyKey: 'key-1',
    candidateRecordId: 'rec-1',
    sourceEventId: 'evt-1',
    portfolioId: 'portfolio-alpha',
    instrumentId: 'instrument-1',
    decision: RiskDecisionStatus.APPROVED,
    reasonCodes: [],
    requestedNotional: toPrismaDecimal('100'),
    requestedQuantity: toPrismaDecimal('0.01'),
    referencePrice: toPrismaDecimal('10000'),
    emittedTopic: 'trade-approved',
    decidedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  let repository: {
    listRiskDecisions: MockedFunction<
      PortfolioWriteRepository['listRiskDecisions']
    >;
  };
  let service: ListRiskDecisionsService;

  beforeEach(() => {
    repository = { listRiskDecisions: vi.fn() };
    service = new ListRiskDecisionsService(
      repository as unknown as PortfolioWriteRepository,
    );
  });

  it('returns decisions mapped to proto entries', async () => {
    const page: RiskDecisionPage = {
      decisions: [makeDecision({ id: 'dec-1' })],
      nextCursor: undefined,
    };
    repository.listRiskDecisions.mockResolvedValue(page);

    const response = await service.listDecisions({
      portfolioId: 'portfolio-alpha',
    });

    expect(repository.listRiskDecisions).toHaveBeenCalledWith(
      'portfolio-alpha',
      undefined,
      undefined,
      undefined,
    );
    expect(response.decisions).toHaveLength(1);
    expect(response.decisions[0]).toMatchObject({
      id: 'dec-1',
      portfolioId: 'portfolio-alpha',
      instrumentId: 'instrument-1',
      decision: 'APPROVED',
      reasonCodes: [],
      requestedNotional: '100',
      referencePrice: '10000',
      sourceEventId: 'evt-1',
      decidedAt: now.toISOString(),
    });
    expect(response.nextCursor).toBeUndefined();
  });

  it('passes decision filter and pagination args to the repository', async () => {
    repository.listRiskDecisions.mockResolvedValue({
      decisions: [],
      nextCursor: undefined,
    });

    await service.listDecisions({
      portfolioId: 'portfolio-alpha',
      decisionFilter: 'REJECTED',
      limit: 10,
      cursor: '2026-05-21T09:00:00.000Z',
    });

    expect(repository.listRiskDecisions).toHaveBeenCalledWith(
      'portfolio-alpha',
      'REJECTED',
      10,
      '2026-05-21T09:00:00.000Z',
    );
  });

  it('forwards nextCursor from the repository page', async () => {
    repository.listRiskDecisions.mockResolvedValue({
      decisions: [makeDecision()],
      nextCursor: '2026-05-21T09:59:00.000Z',
    });

    const response = await service.listDecisions({
      portfolioId: 'portfolio-alpha',
    });

    expect(response.nextCursor).toBe('2026-05-21T09:59:00.000Z');
  });

  it('includes reason codes in the mapped entry', async () => {
    const dec = makeDecision({
      decision: RiskDecisionStatus.REJECTED,
      reasonCodes: [
        RiskDecisionReasonCode.TRADE_CAP_EXCEEDED,
        RiskDecisionReasonCode.PORTFOLIO_EXPOSURE_CAP_EXCEEDED,
      ],
    });
    repository.listRiskDecisions.mockResolvedValue({
      decisions: [dec],
      nextCursor: undefined,
    });

    const response = await service.listDecisions({
      portfolioId: 'portfolio-alpha',
    });

    expect(response.decisions[0].reasonCodes).toEqual([
      'TRADE_CAP_EXCEEDED',
      'PORTFOLIO_EXPOSURE_CAP_EXCEEDED',
    ]);
  });
});
