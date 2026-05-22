import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  buildEventMetadataHeaders,
  instrumentKey,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
} from '@trading-bot/common';
import { Signal, SignalSide } from '@trading-bot/common/proto';
import { truncateTopic, waitForCondition } from '@trading-bot/testing';
import { Admin, Kafka, logLevel, Producer } from 'kafkajs';

import { AppModule } from '../app.module';
import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Risk pipeline expanded rules integration', () => {
  let moduleRef: TestingModule;
  let configService: ConfigService;
  let prisma: PrismaService;
  let eventDispatcher: EventDispatcherService;
  let kafkaAdmin: Admin;
  let kafkaProducer: Producer;
  let kafka: Kafka;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(portfolioManagerRuntimeConfig.KEY)
      .useValue({
        enableOutboxInterval: false,
        enableRiskPipelineConsumers: true,
        enableFillReconciliationConsumer: false,
      })
      .compile();

    await moduleRef.init();

    configService = moduleRef.get(ConfigService);
    prisma = moduleRef.get(PrismaService);
    eventDispatcher = moduleRef.get(EventDispatcherService);

    kafka = new Kafka({
      clientId: 'risk-pipeline-expanded-rules-integration',
      brokers: configService
        .getOrThrow<string>('KAFKA_BROKERS')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
      logLevel: logLevel.NOTHING,
    });
    kafkaAdmin = kafka.admin();
    kafkaProducer = kafka.producer();

    await kafkaAdmin.connect();
    await kafkaProducer.connect();
  });

  beforeEach(async () => {
    await prisma.riskConfigAuditLog.deleteMany();
    await prisma.exposureReservation.deleteMany();
    await prisma.riskDecision.deleteMany();
    await prisma.portfolioSignalCandidateRecord.deleteMany();
    await prisma.signalReceipt.deleteMany();
    await prisma.portfolioFill.deleteMany();
    await prisma.portfolioOrder.deleteMany();
    await prisma.portfolioInstrumentConfig.deleteMany();
    await prisma.portfolio.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.instrument.deleteMany();

    for (const topic of [
      KAFKA_TOPICS.TRADING_SIGNALS,
      KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO,
      KAFKA_TOPICS.TRADES_APPROVED,
      KAFKA_TOPICS.TRADES_REJECTED,
    ]) {
      await truncateTopic(kafkaAdmin, topic);
    }
  });

  afterAll(async () => {
    await kafkaProducer.disconnect();
    await kafkaAdmin.disconnect();
    await prisma.$disconnect();
    await moduleRef.close();
  });

  const createInstrumentAndPortfolio = async (
    configOverrides: Record<string, unknown> = {},
  ) => {
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
        name: 'Alpha',
        exposureCapNotional: 10000,
      },
    });
    await prisma.portfolioInstrumentConfig.create({
      data: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        enabled: true,
        targetNotional: 100,
        maxTradeNotional: 500,
        maxPositionNotional: 2000,
        ...configOverrides,
      },
    });
  };

  const publishSignal = async (sourceEventId: string, signalId: string) => {
    const signal = Signal.fromPartial({
      id: signalId,
      instrumentId: 'instrument-1',
      side: SignalSide.BUY,
      price: 100,
      timestamp: new Date('2026-03-25T12:00:00.000Z').getTime(),
    });
    const occurredAt = new Date().toISOString();

    await kafkaProducer.send({
      topic: KAFKA_TOPICS.TRADING_SIGNALS,
      messages: [
        {
          key: instrumentKey('BINANCE', 'instrument-1'),
          value: Buffer.from(Signal.encode(signal).finish()),
          headers: buildEventMetadataHeaders({
            eventId: sourceEventId,
            eventType: KAFKA_TOPICS.TRADING_SIGNALS,
            schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.TRADING_SIGNALS,
            occurredAt,
            producer: KAFKA_EVENT_PRODUCERS.PREDICTION_ENGINE,
          }),
        },
      ],
    });
  };

  const waitForDecisions = async (count: number) => {
    await waitForCondition(
      async () => {
        await eventDispatcher.dispatchOutboxBatch();
        return (await prisma.riskDecision.count()) === count;
      },
      15000,
      `Timed out waiting for ${count} risk decision(s).`,
    );
  };

  const createExistingReservation = async () => {
    await prisma.signalReceipt.create({
      data: {
        id: 'existing-signal-receipt',
        sourceEventId: 'existing-source-event',
        signalId: 'existing-signal',
        instrumentId: 'instrument-1',
        kafkaKey: 'BINANCE:instrument-1',
        receivedAt: new Date(),
        status: 'FANNED_OUT',
      },
    });
    await prisma.portfolioSignalCandidateRecord.create({
      data: {
        id: 'existing-candidate-record',
        candidateIdempotencyKey: 'existing-reservation',
        signalReceiptId: 'existing-signal-receipt',
        sourceEventId: 'existing-source-event',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: 'existing-signal',
        side: 1,
        referencePrice: 100,
        targetNotionalSnapshot: 100,
        signalTimestamp: new Date(),
        receivedAt: new Date(),
        status: 'DECIDED',
      },
    });
    await prisma.riskDecision.create({
      data: {
        id: 'existing-decision',
        candidateRecordId: 'existing-candidate-record',
        candidateIdempotencyKey: 'existing-reservation',
        sourceEventId: 'existing-source-event',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        decision: 'APPROVED',
        reasonCodes: [],
        requestedNotional: 100,
        requestedQuantity: 1,
        referencePrice: 100,
        emittedTopic: KAFKA_TOPICS.TRADES_APPROVED,
        decidedAt: new Date(),
      },
    });
    await prisma.exposureReservation.create({
      data: {
        id: 'existing-reservation',
        riskDecisionId: 'existing-decision',
        candidateIdempotencyKey: 'existing-reservation',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        reservedNotional: 100,
        reservedQuantity: 1,
        status: 'ACTIVE',
      },
    });
  };

  it('rejects when active reservation count equals maxOpenTrades', async () => {
    await createInstrumentAndPortfolio({ maxOpenTrades: 1 });
    await createExistingReservation();

    await publishSignal('source-event-max-open', 'signal-max-open');
    await waitForDecisions(2);

    const decision = await prisma.riskDecision.findFirstOrThrow({
      where: { sourceEventId: 'source-event-max-open' },
    });
    expect(decision.reasonCodes).toContain('MAX_OPEN_TRADES_EXCEEDED');
    expect(decision.decision).toBe('REJECTED');
  });

  it('approves when active reservation count is below maxOpenTrades', async () => {
    await createInstrumentAndPortfolio({ maxOpenTrades: 2 });
    await createExistingReservation();

    await publishSignal('source-event-below-max', 'signal-below-max');
    await waitForDecisions(2);

    const decision = await prisma.riskDecision.findFirstOrThrow({
      where: { sourceEventId: 'source-event-below-max' },
    });
    expect(decision.decision).toBe('APPROVED');
  });

  it('rejects when daily filled notional reaches maxDailyTurnoverNotional', async () => {
    const today = new Date('2026-03-25T12:00:00.000Z');
    await createInstrumentAndPortfolio({ maxDailyTurnoverNotional: 200 });

    await prisma.portfolioOrder.create({
      data: {
        id: 'order-1',
        approvalEventId: 'approval-event-1',
        candidateIdempotencyKey: 'key-1',
        sourceEventId: 'source-1',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: 'signal-prev',
        side: 1,
        status: 'FILLED',
        firstFilledAt: today,
        lastFilledAt: today,
      },
    });
    await prisma.portfolioFill.create({
      data: {
        id: 'fill-1',
        kafkaEventId: 'kafka-event-1',
        orderId: 'order-1',
        approvalEventId: 'approval-event-1',
        sourceEventId: 'source-1',
        candidateIdempotencyKey: 'key-1',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: 'signal-prev',
        side: 1,
        sequence: 1,
        fillNotional: 150,
        fillQuantity: 1.5,
        fillPrice: 100,
        cumulativeFilledNotional: 150,
        cumulativeFilledQuantity: 1.5,
        orderStatus: 'FILLED',
        filledAt: today,
        receivedAt: today,
      },
    });

    await publishSignal('source-event-turnover', 'signal-turnover');
    await waitForDecisions(1);

    const decision = await prisma.riskDecision.findFirstOrThrow();
    expect(decision.reasonCodes).toContain('DAILY_TURNOVER_LIMIT_EXCEEDED');
    expect(decision.decision).toBe('REJECTED');
  });

  it('auto-disables instrument config after maxConsecutiveRejections and writes audit log', async () => {
    await createInstrumentAndPortfolio({
      maxConsecutiveRejections: 2,
      maxOpenTrades: 0,
    });

    await publishSignal('source-event-reject-1', 'signal-reject-1');
    await waitForDecisions(1);

    for (const topic of [
      KAFKA_TOPICS.TRADING_SIGNALS,
      KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO,
      KAFKA_TOPICS.TRADES_APPROVED,
      KAFKA_TOPICS.TRADES_REJECTED,
    ]) {
      await truncateTopic(kafkaAdmin, topic);
    }

    await publishSignal('source-event-reject-2', 'signal-reject-2');

    await waitForCondition(
      async () => {
        await eventDispatcher.dispatchOutboxBatch();
        return (await prisma.riskDecision.count()) === 2;
      },
      15000,
      'Timed out waiting for second risk decision.',
    );

    await waitForCondition(
      async () => {
        const config = await prisma.portfolioInstrumentConfig.findUnique({
          where: {
            portfolioId_instrumentId: {
              portfolioId: 'portfolio-alpha',
              instrumentId: 'instrument-1',
            },
          },
        });
        return config?.enabled === false;
      },
      5000,
      'Timed out waiting for instrument config to be auto-disabled.',
    );

    const config = await prisma.portfolioInstrumentConfig.findUniqueOrThrow({
      where: {
        portfolioId_instrumentId: {
          portfolioId: 'portfolio-alpha',
          instrumentId: 'instrument-1',
        },
      },
    });
    expect(config.enabled).toBe(false);

    const auditLog = await prisma.riskConfigAuditLog.findFirst({
      where: { portfolioId: 'portfolio-alpha', field: 'enabled' },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.oldValue).toBe('true');
    expect(auditLog?.newValue).toBe('false');
  });

  it('does not auto-disable when maxConsecutiveRejections is null', async () => {
    await createInstrumentAndPortfolio({
      maxConsecutiveRejections: null,
      maxOpenTrades: 0,
    });

    for (let i = 1; i <= 3; i++) {
      await publishSignal(`source-event-null-${i}`, `signal-null-${i}`);

      await waitForCondition(
        async () => {
          await eventDispatcher.dispatchOutboxBatch();
          return (await prisma.riskDecision.count()) === i;
        },
        15000,
        `Timed out waiting for risk decision ${i}.`,
      );
    }

    const config = await prisma.portfolioInstrumentConfig.findUniqueOrThrow({
      where: {
        portfolioId_instrumentId: {
          portfolioId: 'portfolio-alpha',
          instrumentId: 'instrument-1',
        },
      },
    });
    expect(config.enabled).toBe(true);
    expect(await prisma.riskConfigAuditLog.count()).toBe(0);
  });
});
