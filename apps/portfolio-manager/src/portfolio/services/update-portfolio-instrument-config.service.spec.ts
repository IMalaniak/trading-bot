import { RpcException } from '@nestjs/microservices';
import { AssetClass } from '@trading-bot/common/proto';
import type { MockedFunction } from 'vitest';

import { RiskConfigAuditEntityType } from '../../prisma/generated/enums';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { InstrumentMapper } from '../mapper/instrument.mapper';
import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import {
  PortfolioInstrumentConfigWithInstrument,
  PortfolioWriteRepository,
} from '../repositories/portfolio-write.repository';
import { UpdatePortfolioInstrumentConfigService } from './update-portfolio-instrument-config.service';

describe('UpdatePortfolioInstrumentConfigService', () => {
  const now = new Date('2026-05-21T10:00:00.000Z');

  const baseInstrument = {
    id: 'instrument-1',
    assetClass: AssetClass.CRYPTO,
    symbol: 'BTC/USDT',
    venue: 'BINANCE',
    externalSymbol: 'BTCUSDT',
    createdAt: now,
    updatedAt: now,
  };

  const existingConfig: PortfolioInstrumentConfigWithInstrument = {
    id: 'config-1',
    portfolioId: 'portfolio-alpha',
    instrumentId: 'instrument-1',
    enabled: true,
    targetNotional: toPrismaDecimal('100'),
    maxTradeNotional: toPrismaDecimal('150'),
    maxPositionNotional: toPrismaDecimal('400'),
    maxOpenTrades: null,
    maxDailyTurnoverNotional: null,
    cooldownSeconds: null,
    maxConsecutiveRejections: null,
    createdAt: now,
    updatedAt: now,
    instrument: baseInstrument,
  };

  let repository: {
    findInstrumentConfigWithInstrument: MockedFunction<
      PortfolioWriteRepository['findInstrumentConfigWithInstrument']
    >;
    updateInstrumentConfig: MockedFunction<
      PortfolioWriteRepository['updateInstrumentConfig']
    >;
  };
  let service: UpdatePortfolioInstrumentConfigService;

  beforeEach(() => {
    repository = {
      findInstrumentConfigWithInstrument: vi.fn(),
      updateInstrumentConfig: vi.fn(),
    };
    service = new UpdatePortfolioInstrumentConfigService(
      repository as unknown as PortfolioWriteRepository,
      new PortfolioReadMapper(new InstrumentMapper()),
    );
  });

  it('updates enabled flag and writes one audit log entry', async () => {
    repository.findInstrumentConfigWithInstrument.mockResolvedValue(
      existingConfig,
    );
    const updated = {
      ...existingConfig,
      enabled: false,
      updatedAt: new Date('2026-05-21T10:01:00.000Z'),
    };
    repository.updateInstrumentConfig.mockResolvedValue(updated);

    const response = await service.updateConfig({
      portfolioId: 'portfolio-alpha',
      instrumentId: 'instrument-1',
      enabled: false,
    });

    expect(repository.updateInstrumentConfig).toHaveBeenCalledWith(
      'config-1',
      { enabled: false },
      expect.arrayContaining([
        expect.objectContaining({
          entityType: RiskConfigAuditEntityType.INSTRUMENT_CONFIG,
          portfolioId: 'portfolio-alpha',
          portfolioInstrumentConfigId: 'config-1',
          field: 'enabled',
          oldValue: 'true',
          newValue: 'false',
        }),
      ]),
    );
    expect(repository.updateInstrumentConfig.mock.calls[0][2]).toHaveLength(1);
    expect(response.configuredInstrument?.enabled).toBe(false);
  });

  it('writes one audit entry per changed field', async () => {
    repository.findInstrumentConfigWithInstrument.mockResolvedValue(
      existingConfig,
    );
    const updated = {
      ...existingConfig,
      maxTradeNotional: toPrismaDecimal('200'),
      maxOpenTrades: 5,
      updatedAt: new Date('2026-05-21T10:02:00.000Z'),
    };
    repository.updateInstrumentConfig.mockResolvedValue(updated);

    await service.updateConfig({
      portfolioId: 'portfolio-alpha',
      instrumentId: 'instrument-1',
      maxTradeNotional: '200',
      maxOpenTrades: 5,
    });

    const auditEntries = repository.updateInstrumentConfig.mock.calls[0][2];
    expect(auditEntries).toHaveLength(2);
    expect(auditEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'maxTradeNotional',
          oldValue: '150',
          newValue: '200',
        }),
        expect.objectContaining({
          field: 'maxOpenTrades',
          oldValue: undefined,
          newValue: '5',
        }),
      ]),
    );
  });

  it('no-ops and returns current config when no fields change', async () => {
    repository.findInstrumentConfigWithInstrument.mockResolvedValue(
      existingConfig,
    );

    const response = await service.updateConfig({
      portfolioId: 'portfolio-alpha',
      instrumentId: 'instrument-1',
      enabled: true,
      targetNotional: '100',
    });

    expect(repository.updateInstrumentConfig).not.toHaveBeenCalled();
    expect(response.configuredInstrument?.enabled).toBe(true);
    expect(response.configuredInstrument?.targetNotional).toBe('100');
  });

  it('throws NOT_FOUND for unknown instrument config', async () => {
    repository.findInstrumentConfigWithInstrument.mockResolvedValue(null);

    await expect(
      service.updateConfig({
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-unknown',
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(RpcException);
  });
});
