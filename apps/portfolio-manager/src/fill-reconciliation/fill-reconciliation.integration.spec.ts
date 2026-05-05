import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  buildEventMetadataHeaders,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
  portfolioKey,
} from '@trading-bot/common';
import {
  OrderFill,
  OrderStatus,
  PortfolioSignalCandidate,
  PortfolioUpdated,
  Signal,
  SignalSide,
} from '@trading-bot/common/proto';
import {
  KafkaMessageCollector,
  startKafkaMessageCollector,
  truncateTopic,
  waitForCondition,
} from '@trading-bot/testing';
import { Admin, Kafka, logLevel, Producer } from 'kafkajs';

import { AppModule } from '../app.module';
import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import {
  ExposureReservationStatus,
  RiskDecisionReasonCode,
  RiskDecisionStatus,
  SignalReceiptStatus,
} from '../prisma/generated/enums';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioStageService } from '../risk-pipeline/services/portfolio-stage.service';

const startPortfolioUpdatedCollector = async (
  kafka: Kafka,
): Promise<
  KafkaMessageCollector<{ key: string | undefined; payload: PortfolioUpdated }>
> =>
  startKafkaMessageCollector({
    kafka,
    topics: [KAFKA_TOPICS.PORTFOLIO_UPDATED],
    groupIdPrefix: 'fill-reconciliation-integration',
    mapMessage: ({ key, value }) => ({
      key,
      payload: PortfolioUpdated.decode(value ?? new Uint8Array()),
    }),
  });

describe('Fill reconciliation integration', () => {
  let moduleRef: TestingModule;
  let configService: ConfigService;
  let prisma: PrismaService;
  let eventDispatcher: EventDispatcherService;
  let portfolioStageService: PortfolioStageService;
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
        enableRiskPipelineConsumers: false,
        enableFillReconciliationConsumer: true,
      })
      .compile();

    await moduleRef.init();

    configService = moduleRef.get(ConfigService);
    prisma = moduleRef.get(PrismaService);
    eventDispatcher = moduleRef.get(EventDispatcherService);
    portfolioStageService = moduleRef.get(PortfolioStageService, {
      strict: false,
    });

    kafka = new Kafka({
      clientId: 'fill-reconciliation-integration',
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
    await prisma.portfolioSummarySnapshot.deleteMany();
    await prisma.portfolioPosition.deleteMany();
    await prisma.portfolioFill.deleteMany();
    await prisma.portfolioOrder.deleteMany();
    await prisma.exposureReservation.deleteMany();
    await prisma.riskDecision.deleteMany();
    await prisma.portfolioSignalCandidateRecord.deleteMany();
    await prisma.signalReceipt.deleteMany();
    await prisma.portfolioInstrumentConfig.deleteMany();
    await prisma.portfolio.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.instrument.deleteMany();

    for (const topic of [
      KAFKA_TOPICS.ORDERS_FILLS,
      KAFKA_TOPICS.PORTFOLIO_UPDATED,
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

  const createPortfolioAndInstrument = async () => {
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
        exposureCapNotional: 1_000,
      },
    });
  };

  const buildFill = (
    overrides: Partial<OrderFill> & {
      fillId: string;
      sequence: number;
      orderStatus: OrderStatus;
      fillNotional: string;
      fillQuantity: string;
      cumulativeFilledNotional: string;
      cumulativeFilledQuantity: string;
      filledAt: string;
    },
  ): OrderFill =>
    OrderFill.fromPartial({
      orderId: 'order-1',
      approvalEventId: 'approval-1',
      sourceEventId: 'source-1',
      candidateIdempotencyKey: 'source-1:portfolio-alpha',
      portfolioId: 'portfolio-alpha',
      signal: Signal.fromPartial({
        id: 'signal-1',
        instrumentId: 'instrument-1',
        side: SignalSide.BUY,
        price: 100,
        timestamp: new Date('2026-03-25T12:00:00.000Z').getTime(),
      }),
      fillPrice: '100',
      ...overrides,
    });

  const publishFill = async (fill: OrderFill): Promise<void> => {
    await kafkaProducer.send({
      topic: KAFKA_TOPICS.ORDERS_FILLS,
      messages: [
        {
          key: portfolioKey(fill.portfolioId),
          value: Buffer.from(OrderFill.encode(fill).finish()),
          headers: buildEventMetadataHeaders({
            eventId: fill.fillId,
            eventType: KAFKA_TOPICS.ORDERS_FILLS,
            schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.ORDERS_FILLS,
            occurredAt: fill.filledAt,
            producer: KAFKA_EVENT_PRODUCERS.EXECUTION_ENGINE,
          }),
        },
      ],
    });
  };

  it('persists an order fill, updates position state, and emits portfolio.updated', async () => {
    await createPortfolioAndInstrument();
    const collector = await startPortfolioUpdatedCollector(kafka);

    try {
      await publishFill(
        buildFill({
          fillId: 'order-1:fill:1',
          sequence: 1,
          orderStatus: OrderStatus.PARTIALLY_FILLED,
          fillNotional: '50',
          fillQuantity: '0.5',
          cumulativeFilledNotional: '50',
          cumulativeFilledQuantity: '0.5',
          filledAt: '2026-03-25T12:00:03.000Z',
        }),
      );

      await waitForCondition(
        async () => {
          await eventDispatcher.dispatchOutboxBatch();
          return collector.messages.length === 1;
        },
        15000,
        'Timed out waiting for portfolio.updated.',
      );

      const position = await prisma.portfolioPosition.findUniqueOrThrow({
        where: {
          portfolioId_instrumentId: {
            portfolioId: 'portfolio-alpha',
            instrumentId: 'instrument-1',
          },
        },
      });
      const snapshot = await prisma.portfolioSummarySnapshot.findFirstOrThrow();

      expect(await prisma.portfolioFill.count()).toBe(1);
      expect(position.quantity.toString()).toBe('0.5');
      expect(position.averageEntryPrice.toString()).toBe('100');
      expect(position.exposureNotional.toString()).toBe('50');
      expect(snapshot.aggregateExposureNotional.toString()).toBe('50');
      expect(collector.messages[0]?.key).toBe('portfolio-alpha');
      expect(collector.messages[0]?.payload).toEqual(
        expect.objectContaining({
          portfolioId: 'portfolio-alpha',
          sourceFillId: 'order-1:fill:1',
          orderId: 'order-1',
          instrumentId: 'instrument-1',
          aggregateExposureNotional: '50',
          openPositionCount: 1,
          changedPositionQuantity: '0.5',
          changedPositionAverageEntryPrice: '100',
          changedPositionExposureNotional: '50',
        }),
      );
    } finally {
      await collector.consumer.stop();
      await collector.consumer.disconnect();
    }
  });

  it('absorbs duplicate fill replays without duplicate snapshots or events', async () => {
    await createPortfolioAndInstrument();
    const fill = buildFill({
      fillId: 'order-1:fill:1',
      sequence: 1,
      orderStatus: OrderStatus.PARTIALLY_FILLED,
      fillNotional: '50',
      fillQuantity: '0.5',
      cumulativeFilledNotional: '50',
      cumulativeFilledQuantity: '0.5',
      filledAt: '2026-03-25T12:00:03.000Z',
    });
    const collector = await startPortfolioUpdatedCollector(kafka);

    try {
      await publishFill(fill);
      await waitForCondition(
        async () => {
          await eventDispatcher.dispatchOutboxBatch();
          return collector.messages.length === 1;
        },
        15000,
        'Timed out waiting for initial portfolio.updated.',
      );

      await publishFill(fill);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await eventDispatcher.dispatchOutboxBatch();

      expect(await prisma.portfolioFill.count()).toBe(1);
      expect(await prisma.portfolioSummarySnapshot.count()).toBe(1);
      expect(await prisma.outboxEvent.count()).toBe(1);
      expect(collector.messages).toHaveLength(1);
    } finally {
      await collector.consumer.stop();
      await collector.consumer.disconnect();
    }
  });

  it('keeps reservations active for out-of-order final fills and releases after contiguous completion', async () => {
    await createPortfolioAndInstrument();
    await prisma.signalReceipt.create({
      data: {
        sourceEventId: 'source-1',
        signalId: 'signal-1',
        instrumentId: 'instrument-1',
        kafkaKey: 'BINANCE:instrument-1',
        receivedAt: new Date('2026-03-25T12:00:01.000Z'),
        status: SignalReceiptStatus.FANNED_OUT,
        eligiblePortfolioCount: 1,
      },
    });
    const candidate = await prisma.portfolioSignalCandidateRecord.create({
      data: {
        candidateIdempotencyKey: 'source-1:portfolio-alpha',
        signalReceiptId: (await prisma.signalReceipt.findFirstOrThrow()).id,
        sourceEventId: 'source-1',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: 'signal-1',
        side: SignalSide.BUY,
        referencePrice: 100,
        targetNotionalSnapshot: 100,
        signalTimestamp: new Date('2026-03-25T12:00:00.000Z'),
        receivedAt: new Date('2026-03-25T12:00:01.000Z'),
      },
    });
    const decision = await prisma.riskDecision.create({
      data: {
        candidateRecordId: candidate.id,
        candidateIdempotencyKey: candidate.candidateIdempotencyKey,
        sourceEventId: candidate.sourceEventId,
        portfolioId: candidate.portfolioId,
        instrumentId: candidate.instrumentId,
        decision: RiskDecisionStatus.APPROVED,
        reasonCodes: [],
        requestedNotional: 100,
        requestedQuantity: 1,
        referencePrice: 100,
        emittedTopic: KAFKA_TOPICS.TRADES_APPROVED,
        decidedAt: new Date('2026-03-25T12:00:02.000Z'),
      },
    });
    await prisma.exposureReservation.create({
      data: {
        riskDecisionId: decision.id,
        candidateIdempotencyKey: decision.candidateIdempotencyKey,
        portfolioId: decision.portfolioId,
        instrumentId: decision.instrumentId,
        reservedNotional: 100,
        reservedQuantity: 1,
        status: ExposureReservationStatus.ACTIVE,
      },
    });

    await publishFill(
      buildFill({
        fillId: 'order-1:fill:2',
        sequence: 2,
        orderStatus: OrderStatus.FILLED,
        fillNotional: '50',
        fillQuantity: '0.5',
        cumulativeFilledNotional: '100',
        cumulativeFilledQuantity: '1',
        filledAt: '2026-03-25T12:00:04.000Z',
      }),
    );
    await waitForCondition(
      async () => (await prisma.portfolioFill.count()) === 1,
      15000,
      'Timed out waiting for first out-of-order fill.',
    );

    expect(await prisma.exposureReservation.findFirstOrThrow()).toMatchObject({
      status: ExposureReservationStatus.ACTIVE,
    });

    await publishFill(
      buildFill({
        fillId: 'order-1:fill:1',
        sequence: 1,
        orderStatus: OrderStatus.PARTIALLY_FILLED,
        fillNotional: '50',
        fillQuantity: '0.5',
        cumulativeFilledNotional: '50',
        cumulativeFilledQuantity: '0.5',
        filledAt: '2026-03-25T12:00:03.000Z',
      }),
    );
    await waitForCondition(
      async () => {
        await eventDispatcher.dispatchOutboxBatch();
        const reservation = await prisma.exposureReservation.findFirstOrThrow();
        return (
          (await prisma.portfolioFill.count()) === 2 &&
          reservation.status === ExposureReservationStatus.RELEASED
        );
      },
      15000,
      'Timed out waiting for reservation release after contiguous fills.',
    );

    const position = await prisma.portfolioPosition.findUniqueOrThrow({
      where: {
        portfolioId_instrumentId: {
          portfolioId: 'portfolio-alpha',
          instrumentId: 'instrument-1',
        },
      },
    });

    expect(position.quantity.toString()).toBe('1');
    expect(position.averageEntryPrice.toString()).toBe('100');
    expect(position.exposureNotional.toString()).toBe('100');
    expect(await prisma.portfolioSummarySnapshot.count()).toBe(2);
  });

  it('uses filled position exposure when evaluating later risk candidates', async () => {
    await createPortfolioAndInstrument();
    await prisma.portfolioOrder.create({
      data: {
        id: 'settled-order-1',
        approvalEventId: 'settled-approval-1',
        candidateIdempotencyKey: 'settled-source:portfolio-alpha',
        sourceEventId: 'settled-source',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: 'settled-signal',
        side: SignalSide.BUY,
        status: 'FILLED',
        finalSequence: 1,
        firstFilledAt: new Date('2026-03-25T12:00:03.000Z'),
        lastFilledAt: new Date('2026-03-25T12:00:03.000Z'),
      },
    });
    await prisma.portfolioFill.create({
      data: {
        id: 'settled-order-1:fill:1',
        kafkaEventId: 'settled-order-1:fill:1',
        orderId: 'settled-order-1',
        approvalEventId: 'settled-approval-1',
        sourceEventId: 'settled-source',
        candidateIdempotencyKey: 'settled-source:portfolio-alpha',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: 'settled-signal',
        side: SignalSide.BUY,
        sequence: 1,
        fillNotional: 100,
        fillQuantity: 1,
        fillPrice: 100,
        cumulativeFilledNotional: 100,
        cumulativeFilledQuantity: 1,
        orderStatus: 'FILLED',
        filledAt: new Date('2026-03-25T12:00:03.000Z'),
        receivedAt: new Date('2026-03-25T12:00:04.000Z'),
      },
    });
    await prisma.portfolioPosition.create({
      data: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        quantity: 1,
        averageEntryPrice: 100,
        exposureNotional: 100,
      },
    });
    await prisma.portfolioInstrumentConfig.create({
      data: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        enabled: true,
        targetNotional: 60,
        maxTradeNotional: 100,
        maxPositionNotional: 150,
      },
    });
    const receipt = await prisma.signalReceipt.create({
      data: {
        sourceEventId: 'source-2',
        signalId: 'signal-2',
        instrumentId: 'instrument-1',
        kafkaKey: 'BINANCE:instrument-1',
        receivedAt: new Date('2026-03-25T12:01:01.000Z'),
        status: SignalReceiptStatus.FANNED_OUT,
        eligiblePortfolioCount: 1,
      },
    });
    await prisma.portfolioSignalCandidateRecord.create({
      data: {
        candidateIdempotencyKey: 'source-2:portfolio-alpha',
        signalReceiptId: receipt.id,
        sourceEventId: 'source-2',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: 'signal-2',
        side: SignalSide.BUY,
        referencePrice: 100,
        targetNotionalSnapshot: 60,
        signalTimestamp: new Date('2026-03-25T12:01:00.000Z'),
        receivedAt: new Date('2026-03-25T12:01:01.000Z'),
      },
    });

    await portfolioStageService.handleCandidate(
      PortfolioSignalCandidate.fromPartial({
        signal: {
          id: 'signal-2',
          instrumentId: 'instrument-1',
          side: SignalSide.BUY,
          price: 100,
          timestamp: new Date('2026-03-25T12:01:00.000Z').getTime(),
        },
        sourceEventId: 'source-2',
        portfolioId: 'portfolio-alpha',
        candidateIdempotencyKey: 'source-2:portfolio-alpha',
        signalReceivedAt: '2026-03-25T12:01:01.000Z',
      }),
    );

    const decision = await prisma.riskDecision.findFirstOrThrow({
      where: { candidateIdempotencyKey: 'source-2:portfolio-alpha' },
    });

    expect(decision.decision).toBe(RiskDecisionStatus.REJECTED);
    expect(decision.reasonCodes).toEqual([
      RiskDecisionReasonCode.INSTRUMENT_EXPOSURE_CAP_EXCEEDED,
    ]);
  });

  it('does not double-count fills that are still covered by active reservations', async () => {
    await createPortfolioAndInstrument();
    await prisma.portfolioInstrumentConfig.create({
      data: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        enabled: true,
        targetNotional: 40,
        maxTradeNotional: 100,
        maxPositionNotional: 150,
      },
    });
    const activeReceipt = await prisma.signalReceipt.create({
      data: {
        sourceEventId: 'active-source',
        signalId: 'active-signal',
        instrumentId: 'instrument-1',
        kafkaKey: 'BINANCE:instrument-1',
        receivedAt: new Date('2026-03-25T12:00:01.000Z'),
        status: SignalReceiptStatus.FANNED_OUT,
        eligiblePortfolioCount: 1,
      },
    });
    const activeCandidate = await prisma.portfolioSignalCandidateRecord.create({
      data: {
        candidateIdempotencyKey: 'active-source:portfolio-alpha',
        signalReceiptId: activeReceipt.id,
        sourceEventId: 'active-source',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: 'active-signal',
        side: SignalSide.BUY,
        referencePrice: 100,
        targetNotionalSnapshot: 100,
        signalTimestamp: new Date('2026-03-25T12:00:00.000Z'),
        receivedAt: new Date('2026-03-25T12:00:01.000Z'),
      },
    });
    const activeDecision = await prisma.riskDecision.create({
      data: {
        candidateRecordId: activeCandidate.id,
        candidateIdempotencyKey: activeCandidate.candidateIdempotencyKey,
        sourceEventId: activeCandidate.sourceEventId,
        portfolioId: activeCandidate.portfolioId,
        instrumentId: activeCandidate.instrumentId,
        decision: RiskDecisionStatus.APPROVED,
        reasonCodes: [],
        requestedNotional: 100,
        requestedQuantity: 1,
        referencePrice: 100,
        emittedTopic: KAFKA_TOPICS.TRADES_APPROVED,
        decidedAt: new Date('2026-03-25T12:00:02.000Z'),
      },
    });
    await prisma.exposureReservation.create({
      data: {
        riskDecisionId: activeDecision.id,
        candidateIdempotencyKey: activeDecision.candidateIdempotencyKey,
        portfolioId: activeDecision.portfolioId,
        instrumentId: activeDecision.instrumentId,
        reservedNotional: 100,
        reservedQuantity: 1,
        status: ExposureReservationStatus.ACTIVE,
      },
    });
    await prisma.portfolioOrder.create({
      data: {
        id: 'active-order-1',
        approvalEventId: 'active-approval-1',
        candidateIdempotencyKey: activeDecision.candidateIdempotencyKey,
        sourceEventId: activeDecision.sourceEventId,
        portfolioId: activeDecision.portfolioId,
        instrumentId: activeDecision.instrumentId,
        signalId: 'active-signal',
        side: SignalSide.BUY,
        status: 'PARTIALLY_FILLED',
        firstFilledAt: new Date('2026-03-25T12:00:03.000Z'),
        lastFilledAt: new Date('2026-03-25T12:00:03.000Z'),
      },
    });
    await prisma.portfolioFill.create({
      data: {
        id: 'active-order-1:fill:1',
        kafkaEventId: 'active-order-1:fill:1',
        orderId: 'active-order-1',
        approvalEventId: 'active-approval-1',
        sourceEventId: activeDecision.sourceEventId,
        candidateIdempotencyKey: activeDecision.candidateIdempotencyKey,
        portfolioId: activeDecision.portfolioId,
        instrumentId: activeDecision.instrumentId,
        signalId: 'active-signal',
        side: SignalSide.BUY,
        sequence: 1,
        fillNotional: 50,
        fillQuantity: 0.5,
        fillPrice: 100,
        cumulativeFilledNotional: 50,
        cumulativeFilledQuantity: 0.5,
        orderStatus: 'PARTIALLY_FILLED',
        filledAt: new Date('2026-03-25T12:00:03.000Z'),
        receivedAt: new Date('2026-03-25T12:00:04.000Z'),
      },
    });
    const nextReceipt = await prisma.signalReceipt.create({
      data: {
        sourceEventId: 'source-3',
        signalId: 'signal-3',
        instrumentId: 'instrument-1',
        kafkaKey: 'BINANCE:instrument-1',
        receivedAt: new Date('2026-03-25T12:01:01.000Z'),
        status: SignalReceiptStatus.FANNED_OUT,
        eligiblePortfolioCount: 1,
      },
    });
    await prisma.portfolioSignalCandidateRecord.create({
      data: {
        candidateIdempotencyKey: 'source-3:portfolio-alpha',
        signalReceiptId: nextReceipt.id,
        sourceEventId: 'source-3',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: 'signal-3',
        side: SignalSide.BUY,
        referencePrice: 100,
        targetNotionalSnapshot: 40,
        signalTimestamp: new Date('2026-03-25T12:01:00.000Z'),
        receivedAt: new Date('2026-03-25T12:01:01.000Z'),
      },
    });

    await portfolioStageService.handleCandidate(
      PortfolioSignalCandidate.fromPartial({
        signal: {
          id: 'signal-3',
          instrumentId: 'instrument-1',
          side: SignalSide.BUY,
          price: 100,
          timestamp: new Date('2026-03-25T12:01:00.000Z').getTime(),
        },
        sourceEventId: 'source-3',
        portfolioId: 'portfolio-alpha',
        candidateIdempotencyKey: 'source-3:portfolio-alpha',
        signalReceivedAt: '2026-03-25T12:01:01.000Z',
      }),
    );

    const decision = await prisma.riskDecision.findFirstOrThrow({
      where: { candidateIdempotencyKey: 'source-3:portfolio-alpha' },
    });

    expect(decision.decision).toBe(RiskDecisionStatus.APPROVED);
  });
});
