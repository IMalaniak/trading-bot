import type { MockedFunction } from 'vitest';

import { RiskConfigAuditEntityType } from '../../prisma/generated/enums';
import type { RiskConfigAuditLogModel } from '../../prisma/generated/models';
import {
  PortfolioWriteRepository,
  RiskConfigAuditLogPage,
} from '../repositories/portfolio-write.repository';
import { ListRiskConfigAuditLogService } from './list-risk-config-audit-log.service';

describe('ListRiskConfigAuditLogService', () => {
  const now = new Date('2026-05-21T10:00:00.000Z');

  const makeEntry = (
    overrides: Partial<RiskConfigAuditLogModel> = {},
  ): RiskConfigAuditLogModel => ({
    id: 'audit-1',
    entityType: RiskConfigAuditEntityType.INSTRUMENT_CONFIG,
    portfolioId: 'portfolio-alpha',
    portfolioInstrumentConfigId: 'config-1',
    field: 'enabled',
    oldValue: 'true',
    newValue: 'false',
    changedAt: now,
    ...overrides,
  });

  let repository: {
    listRiskConfigAuditLog: MockedFunction<
      PortfolioWriteRepository['listRiskConfigAuditLog']
    >;
  };
  let service: ListRiskConfigAuditLogService;

  beforeEach(() => {
    repository = { listRiskConfigAuditLog: vi.fn() };
    service = new ListRiskConfigAuditLogService(
      repository as unknown as PortfolioWriteRepository,
    );
  });

  it('returns audit entries mapped to proto format', async () => {
    const page: RiskConfigAuditLogPage = {
      entries: [makeEntry()],
      nextCursor: undefined,
    };
    repository.listRiskConfigAuditLog.mockResolvedValue(page);

    const response = await service.listAuditLog({
      portfolioId: 'portfolio-alpha',
    });

    expect(repository.listRiskConfigAuditLog).toHaveBeenCalledWith(
      'portfolio-alpha',
      undefined,
      undefined,
    );
    expect(response.entries).toHaveLength(1);
    expect(response.entries[0]).toMatchObject({
      id: 'audit-1',
      entityType: 'INSTRUMENT_CONFIG',
      portfolioId: 'portfolio-alpha',
      portfolioInstrumentConfigId: 'config-1',
      field: 'enabled',
      oldValue: 'true',
      newValue: 'false',
      changedAt: now.toISOString(),
    });
  });

  it('passes limit and cursor args to the repository', async () => {
    repository.listRiskConfigAuditLog.mockResolvedValue({
      entries: [],
      nextCursor: undefined,
    });

    await service.listAuditLog({
      portfolioId: 'portfolio-alpha',
      limit: 20,
      cursor: '2026-05-21T09:00:00.000Z',
    });

    expect(repository.listRiskConfigAuditLog).toHaveBeenCalledWith(
      'portfolio-alpha',
      20,
      '2026-05-21T09:00:00.000Z',
    );
  });

  it('forwards nextCursor from the repository page', async () => {
    repository.listRiskConfigAuditLog.mockResolvedValue({
      entries: [makeEntry()],
      nextCursor: '2026-05-21T09:59:00.000Z',
    });

    const response = await service.listAuditLog({
      portfolioId: 'portfolio-alpha',
    });

    expect(response.nextCursor).toBe('2026-05-21T09:59:00.000Z');
  });

  it('handles portfolio-level audit entries without portfolioInstrumentConfigId', async () => {
    const portfolioEntry = makeEntry({
      entityType: RiskConfigAuditEntityType.PORTFOLIO,
      portfolioInstrumentConfigId: null,
      field: 'isActive',
      oldValue: 'true',
      newValue: 'false',
    });
    repository.listRiskConfigAuditLog.mockResolvedValue({
      entries: [portfolioEntry],
      nextCursor: undefined,
    });

    const response = await service.listAuditLog({
      portfolioId: 'portfolio-alpha',
    });

    expect(response.entries[0].entityType).toBe('PORTFOLIO');
    expect(response.entries[0].portfolioInstrumentConfigId).toBeUndefined();
  });
});
