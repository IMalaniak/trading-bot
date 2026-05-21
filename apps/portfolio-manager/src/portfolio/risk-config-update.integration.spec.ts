import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../app.module';
import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import {
  RiskConfigAuditEntityType,
  RiskDecisionReasonCode,
} from '../prisma/generated/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ListRiskConfigAuditLogService } from './services/list-risk-config-audit-log.service';
import { ListRiskDecisionsService } from './services/list-risk-decisions.service';
import { UpdatePortfolioService } from './services/update-portfolio.service';
import { UpdatePortfolioInstrumentConfigService } from './services/update-portfolio-instrument-config.service';

describe('Risk config update integration', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let updateConfigService: UpdatePortfolioInstrumentConfigService;
  let updatePortfolioService: UpdatePortfolioService;
  let listDecisionsService: ListRiskDecisionsService;
  let listAuditLogService: ListRiskConfigAuditLogService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(portfolioManagerRuntimeConfig.KEY)
      .useValue({
        enableOutboxInterval: false,
        enableRiskPipelineConsumers: false,
        enableFillReconciliationConsumer: false,
      })
      .compile();

    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    updateConfigService = moduleRef.get(UpdatePortfolioInstrumentConfigService);
    updatePortfolioService = moduleRef.get(UpdatePortfolioService);
    listDecisionsService = moduleRef.get(ListRiskDecisionsService);
    listAuditLogService = moduleRef.get(ListRiskConfigAuditLogService);
  });

  beforeEach(async () => {
    await prisma.riskConfigAuditLog.deleteMany();
    await prisma.exposureReservation.deleteMany();
    await prisma.riskDecision.deleteMany();
    await prisma.portfolioSignalCandidateRecord.deleteMany();
    await prisma.signalReceipt.deleteMany();
    await prisma.portfolioInstrumentConfig.deleteMany();
    await prisma.portfolioPosition.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.portfolio.deleteMany();
    await prisma.instrument.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await moduleRef.close();
  });

  const seedInstrumentAndPortfolio = async () => {
    await prisma.instrument.create({
      data: {
        id: 'instrument-1',
        assetClass: 1,
        symbol: 'BTC/USDT',
        venue: 'BINANCE',
        externalSymbol: 'BTCUSDT',
      },
    });
    await prisma.portfolio.create({
      data: {
        id: 'portfolio-alpha',
        name: 'Alpha Portfolio',
        exposureCapNotional: 1000,
      },
    });
    await prisma.portfolioInstrumentConfig.create({
      data: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        enabled: true,
        targetNotional: 100,
        maxTradeNotional: 150,
        maxPositionNotional: 400,
      },
    });
  };

  it('persists updated instrument config fields to the database', async () => {
    await seedInstrumentAndPortfolio();

    await updateConfigService.updateConfig({
      portfolioId: 'portfolio-alpha',
      instrumentId: 'instrument-1',
      maxTradeNotional: '200',
      maxOpenTrades: 5,
      cooldownSeconds: 60,
    });

    const config = await prisma.portfolioInstrumentConfig.findFirstOrThrow({
      where: { portfolioId: 'portfolio-alpha', instrumentId: 'instrument-1' },
    });

    expect(config.maxTradeNotional.toString()).toBe('200');
    expect(config.maxOpenTrades).toBe(5);
    expect(config.cooldownSeconds).toBe(60);
    expect(config.maxPositionNotional.toString()).toBe('400');
  });

  it('writes one audit log entry per changed field on instrument config update', async () => {
    await seedInstrumentAndPortfolio();

    await updateConfigService.updateConfig({
      portfolioId: 'portfolio-alpha',
      instrumentId: 'instrument-1',
      enabled: false,
      maxTradeNotional: '200',
      maxOpenTrades: 5,
    });

    const auditEntries = await prisma.riskConfigAuditLog.findMany({
      orderBy: { field: 'asc' },
    });

    expect(auditEntries).toHaveLength(3);
    expect(auditEntries.map((e) => e.field).sort()).toEqual([
      'enabled',
      'maxOpenTrades',
      'maxTradeNotional',
    ]);

    const enabledEntry = auditEntries.find((e) => e.field === 'enabled');
    expect(enabledEntry?.entityType).toBe(
      RiskConfigAuditEntityType.INSTRUMENT_CONFIG,
    );
    expect(enabledEntry?.portfolioId).toBe('portfolio-alpha');
    expect(enabledEntry?.oldValue).toBe('true');
    expect(enabledEntry?.newValue).toBe('false');

    const notionalEntry = auditEntries.find(
      (e) => e.field === 'maxTradeNotional',
    );
    expect(notionalEntry?.oldValue).toBe('150');
    expect(notionalEntry?.newValue).toBe('200');
  });

  it('does not write audit entries when no instrument config fields change', async () => {
    await seedInstrumentAndPortfolio();

    await updateConfigService.updateConfig({
      portfolioId: 'portfolio-alpha',
      instrumentId: 'instrument-1',
      enabled: true,
      targetNotional: '100',
    });

    const auditCount = await prisma.riskConfigAuditLog.count();
    expect(auditCount).toBe(0);
  });

  it('persists updated portfolio fields and writes portfolio-level audit log entries', async () => {
    await seedInstrumentAndPortfolio();

    await updatePortfolioService.updatePortfolio({
      portfolioId: 'portfolio-alpha',
      exposureCapNotional: '2000',
      isActive: false,
    });

    const portfolio = await prisma.portfolio.findUniqueOrThrow({
      where: { id: 'portfolio-alpha' },
    });
    expect(portfolio.exposureCapNotional.toString()).toBe('2000');
    expect(portfolio.isActive).toBe(false);

    const auditEntries = await prisma.riskConfigAuditLog.findMany({
      orderBy: { field: 'asc' },
    });
    expect(auditEntries).toHaveLength(2);
    expect(auditEntries.map((e) => e.field).sort()).toEqual([
      'exposureCapNotional',
      'isActive',
    ]);

    const auditEntry = auditEntries.find(
      (e) => e.field === 'exposureCapNotional',
    );
    expect(auditEntry?.entityType).toBe(RiskConfigAuditEntityType.PORTFOLIO);
    expect(auditEntry?.oldValue).toBe('1000');
    expect(auditEntry?.newValue).toBe('2000');
    expect(auditEntry?.portfolioInstrumentConfigId).toBeNull();
  });

  const seedRiskDecision = async (opts: {
    sourceEventId: string;
    candidateIdempotencyKey: string;
    decision: 'APPROVED' | 'REJECTED';
    reasonCodes: RiskDecisionReasonCode[];
    requestedNotional: number;
    decidedAt: Date;
  }) => {
    const receipt = await prisma.signalReceipt.create({
      data: {
        sourceEventId: opts.sourceEventId,
        signalId: `sig-${opts.sourceEventId}`,
        instrumentId: 'instrument-1',
        kafkaKey: opts.sourceEventId,
        receivedAt: opts.decidedAt,
        status: 'PENDING',
      },
    });
    const candidate = await prisma.portfolioSignalCandidateRecord.create({
      data: {
        candidateIdempotencyKey: opts.candidateIdempotencyKey,
        signalReceiptId: receipt.id,
        sourceEventId: opts.sourceEventId,
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: receipt.signalId,
        side: 1,
        referencePrice: 10000,
        targetNotionalSnapshot: 100,
        signalTimestamp: opts.decidedAt,
        receivedAt: opts.decidedAt,
        status: 'DECIDED',
      },
    });
    return prisma.riskDecision.create({
      data: {
        candidateIdempotencyKey: opts.candidateIdempotencyKey,
        candidateRecordId: candidate.id,
        sourceEventId: opts.sourceEventId,
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        decision: opts.decision,
        reasonCodes: opts.reasonCodes,
        requestedNotional: opts.requestedNotional,
        requestedQuantity: 0.05,
        referencePrice: 10000,
        emittedTopic:
          opts.decision === 'REJECTED' ? 'trades-rejected' : 'trades-approved',
        decidedAt: opts.decidedAt,
      },
    });
  };

  it('returns risk decisions for a portfolio with correct field mapping', async () => {
    await seedInstrumentAndPortfolio();

    await seedRiskDecision({
      sourceEventId: 'evt-1',
      candidateIdempotencyKey: 'key-1',
      decision: 'REJECTED',
      reasonCodes: [RiskDecisionReasonCode.TRADE_CAP_EXCEEDED],
      requestedNotional: 500,
      decidedAt: new Date('2026-05-21T10:00:00.000Z'),
    });

    const response = await listDecisionsService.listDecisions({
      portfolioId: 'portfolio-alpha',
    });

    expect(response.decisions).toHaveLength(1);
    expect(response.decisions[0]).toMatchObject({
      portfolioId: 'portfolio-alpha',
      instrumentId: 'instrument-1',
      decision: 'REJECTED',
      reasonCodes: ['TRADE_CAP_EXCEEDED'],
      requestedNotional: '500',
      referencePrice: '10000',
      sourceEventId: 'evt-1',
      decidedAt: '2026-05-21T10:00:00.000Z',
    });
    expect(response.nextCursor).toBeUndefined();
  });

  it('returns audit log entries via ListRiskConfigAuditLog after a config update', async () => {
    await seedInstrumentAndPortfolio();

    await updateConfigService.updateConfig({
      portfolioId: 'portfolio-alpha',
      instrumentId: 'instrument-1',
      enabled: false,
    });

    const response = await listAuditLogService.listAuditLog({
      portfolioId: 'portfolio-alpha',
    });

    expect(response.entries).toHaveLength(1);
    expect(response.entries[0]).toMatchObject({
      entityType: 'INSTRUMENT_CONFIG',
      portfolioId: 'portfolio-alpha',
      field: 'enabled',
      oldValue: 'true',
      newValue: 'false',
    });
    expect(response.entries[0].id).toBeDefined();
    expect(response.entries[0].changedAt).toBeDefined();
    expect(response.nextCursor).toBeUndefined();
  });

  it('paginates ListRiskDecisions using cursor', async () => {
    await seedInstrumentAndPortfolio();

    await seedRiskDecision({
      sourceEventId: 'evt-page-1',
      candidateIdempotencyKey: 'key-page-1',
      decision: 'APPROVED',
      reasonCodes: [],
      requestedNotional: 100,
      decidedAt: new Date('2026-05-21T10:01:00.000Z'),
    });
    await seedRiskDecision({
      sourceEventId: 'evt-page-2',
      candidateIdempotencyKey: 'key-page-2',
      decision: 'REJECTED',
      reasonCodes: [RiskDecisionReasonCode.TRADE_CAP_EXCEEDED],
      requestedNotional: 500,
      decidedAt: new Date('2026-05-21T10:00:00.000Z'),
    });

    const firstPage = await listDecisionsService.listDecisions({
      portfolioId: 'portfolio-alpha',
      limit: 1,
    });

    expect(firstPage.decisions).toHaveLength(1);
    expect(firstPage.decisions[0].sourceEventId).toBe('evt-page-1');
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await listDecisionsService.listDecisions({
      portfolioId: 'portfolio-alpha',
      limit: 1,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.decisions).toHaveLength(1);
    expect(secondPage.decisions[0].sourceEventId).toBe('evt-page-2');
    expect(secondPage.nextCursor).toBeUndefined();
  });
});
