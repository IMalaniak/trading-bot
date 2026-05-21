import { RpcException } from '@nestjs/microservices';
import type { MockedFunction } from 'vitest';

import { RiskConfigAuditEntityType } from '../../prisma/generated/enums';
import type { PortfolioModel } from '../../prisma/generated/models';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';
import { UpdatePortfolioService } from './update-portfolio.service';

describe('UpdatePortfolioService', () => {
  const now = new Date('2026-05-21T10:00:00.000Z');

  const existingPortfolio: PortfolioModel = {
    id: 'portfolio-alpha',
    name: 'Alpha Portfolio',
    isActive: true,
    exposureCapNotional: toPrismaDecimal('1000'),
    strategyId: null,
    createdAt: now,
    updatedAt: now,
  };

  let repository: {
    findPortfolioById: MockedFunction<
      PortfolioWriteRepository['findPortfolioById']
    >;
    updatePortfolio: MockedFunction<
      PortfolioWriteRepository['updatePortfolio']
    >;
  };
  let service: UpdatePortfolioService;

  beforeEach(() => {
    repository = {
      findPortfolioById: vi.fn(),
      updatePortfolio: vi.fn(),
    };
    service = new UpdatePortfolioService(
      repository as unknown as PortfolioWriteRepository,
    );
  });

  it('updates exposureCapNotional and writes one audit log entry', async () => {
    repository.findPortfolioById.mockResolvedValue(existingPortfolio);
    const updated = {
      ...existingPortfolio,
      exposureCapNotional: toPrismaDecimal('2000'),
      updatedAt: new Date('2026-05-21T10:01:00.000Z'),
    };
    repository.updatePortfolio.mockResolvedValue(updated);

    const response = await service.updatePortfolio({
      portfolioId: 'portfolio-alpha',
      exposureCapNotional: '2000',
    });

    expect(repository.updatePortfolio).toHaveBeenCalledWith(
      'portfolio-alpha',
      { exposureCapNotional: expect.objectContaining({ s: 1 }) },
      expect.arrayContaining([
        expect.objectContaining({
          entityType: RiskConfigAuditEntityType.PORTFOLIO,
          portfolioId: 'portfolio-alpha',
          field: 'exposureCapNotional',
          oldValue: '1000',
          newValue: '2000',
        }),
      ]),
    );
    expect(repository.updatePortfolio.mock.calls[0][2]).toHaveLength(1);
    expect(response.summary?.portfolioId).toBe('portfolio-alpha');
    expect(response.summary?.exposureCapNotional).toBe('2000');
  });

  it('updates isActive and writes one audit log entry', async () => {
    repository.findPortfolioById.mockResolvedValue(existingPortfolio);
    const updated = { ...existingPortfolio, isActive: false };
    repository.updatePortfolio.mockResolvedValue(updated);

    await service.updatePortfolio({
      portfolioId: 'portfolio-alpha',
      isActive: false,
    });

    const auditEntries = repository.updatePortfolio.mock.calls[0][2];
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({
      field: 'isActive',
      oldValue: 'true',
      newValue: 'false',
    });
  });

  it('writes one audit entry per changed field', async () => {
    repository.findPortfolioById.mockResolvedValue(existingPortfolio);
    repository.updatePortfolio.mockResolvedValue({
      ...existingPortfolio,
      exposureCapNotional: toPrismaDecimal('3000'),
      isActive: false,
    });

    await service.updatePortfolio({
      portfolioId: 'portfolio-alpha',
      exposureCapNotional: '3000',
      isActive: false,
    });

    expect(repository.updatePortfolio.mock.calls[0][2]).toHaveLength(2);
  });

  it('no-ops when no fields change', async () => {
    repository.findPortfolioById.mockResolvedValue(existingPortfolio);

    const response = await service.updatePortfolio({
      portfolioId: 'portfolio-alpha',
      exposureCapNotional: '1000',
      isActive: true,
    });

    expect(repository.updatePortfolio).not.toHaveBeenCalled();
    expect(response.summary?.exposureCapNotional).toBe('1000');
  });

  it('throws NOT_FOUND for unknown portfolio', async () => {
    repository.findPortfolioById.mockResolvedValue(null);

    await expect(
      service.updatePortfolio({
        portfolioId: 'portfolio-missing',
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(RpcException);
  });
});
