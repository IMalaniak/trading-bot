import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  buildEventMetadataHeaders,
  instrumentKey,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
} from '@trading-bot/common';
import {
  PortfolioSignalCandidate,
  Signal,
  SignalSide,
  TradeDecision,
  TradeDecisionKind,
  TradeDecisionReason,
} from '@trading-bot/common/proto';
import { randomUUID } from 'crypto';
import { Admin, Consumer, Kafka, logLevel, Producer } from 'kafkajs';

import { AppModule } from '../app.module';
import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

const truncateTopic = async (admin: Admin, topic: string): Promise<void> => {
  const offsets = await admin.fetchTopicOffsets(topic);

  if (offsets.length === 0) {
    return;
  }

  await admin.deleteTopicRecords({
    topic,
    partitions: offsets.map(({ partition, high }) => ({
      partition,
      offset: high,
    })),
  });
};

const waitForCondition = async (
  condition: () => Promise<boolean> | boolean,
  timeoutMs: number,
  errorMessage: string,
): Promise<void> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(errorMessage);
};

type CollectedMessage =
  | {
      topic: typeof KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO;
      key: string | undefined;
      payload: PortfolioSignalCandidate;
    }
  | {
      topic:
        | typeof KAFKA_TOPICS.TRADES_APPROVED
        | typeof KAFKA_TOPICS.TRADES_REJECTED;
      key: string | undefined;
      payload: TradeDecision;
    };

const decodeTopicMessage = (
  topic: string,
  value: Buffer | null,
): PortfolioSignalCandidate | TradeDecision => {
  switch (topic) {
    case KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO:
      return PortfolioSignalCandidate.decode(value ?? new Uint8Array());
    case KAFKA_TOPICS.TRADES_APPROVED:
    case KAFKA_TOPICS.TRADES_REJECTED:
      return TradeDecision.decode(value ?? new Uint8Array());
    default:
      throw new Error(`Unexpected topic '${topic}'`);
  }
};

const startCollector = async (
  kafka: Kafka,
  topics: string[],
): Promise<{ consumer: Consumer; messages: CollectedMessage[] }> => {
  const consumer = kafka.consumer({
    groupId: `risk-pipeline-integration-${randomUUID()}`,
    maxWaitTimeInMs: 100,
  });
  const messages: CollectedMessage[] = [];

  await consumer.connect();
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: true });
  }

  await consumer.run({
    eachMessage: ({ topic, message }) => {
      messages.push({
        topic: topic as CollectedMessage['topic'],
        key: message.key?.toString('utf8'),
        payload: decodeTopicMessage(topic, message.value),
      } as CollectedMessage);

      return Promise.resolve();
    },
  });

  return { consumer, messages };
};

describe('Risk pipeline integration', () => {
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
      })
      .compile();

    await moduleRef.init();

    configService = moduleRef.get(ConfigService);
    prisma = moduleRef.get(PrismaService);
    eventDispatcher = moduleRef.get(EventDispatcherService);

    kafka = new Kafka({
      clientId: 'risk-pipeline-integration',
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
    await prisma.exposureReservation.deleteMany();
    await prisma.riskDecision.deleteMany();
    await prisma.portfolioSignalCandidateRecord.deleteMany();
    await prisma.signalReceipt.deleteMany();
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

  const createInstrument = async () =>
    prisma.instrument.create({
      data: {
        id: 'instrument-1',
        assetClass: 1,
        symbol: 'BTC/USDT',
        venue: 'BINANCE',
        externalSymbol: 'BTCUSDT',
      },
    });

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

  it('fans one source signal out to two portfolios and produces two final decisions', async () => {
    await createInstrument();
    await prisma.portfolio.createMany({
      data: [
        {
          id: 'portfolio-alpha',
          name: 'Alpha',
          exposureCapNotional: 200,
        },
        {
          id: 'portfolio-beta',
          name: 'Beta',
          exposureCapNotional: 50,
        },
      ],
    });
    await prisma.portfolioInstrumentConfig.createMany({
      data: [
        {
          portfolioId: 'portfolio-alpha',
          instrumentId: 'instrument-1',
          enabled: true,
          targetNotional: 100,
          maxTradeNotional: 150,
          maxPositionNotional: 200,
        },
        {
          portfolioId: 'portfolio-beta',
          instrumentId: 'instrument-1',
          enabled: true,
          targetNotional: 100,
          maxTradeNotional: 150,
          maxPositionNotional: 200,
        },
      ],
    });

    const collector = await startCollector(kafka, [
      KAFKA_TOPICS.TRADES_APPROVED,
      KAFKA_TOPICS.TRADES_REJECTED,
    ]);

    try {
      await publishSignal('source-event-1', 'signal-1');

      await waitForCondition(
        async () => {
          await eventDispatcher.dispatchOutboxBatch();
          return (await prisma.riskDecision.count()) === 2;
        },
        15000,
        'Timed out waiting for two risk decisions.',
      );
      await waitForCondition(
        () => collector.messages.length === 2,
        10000,
        'Timed out waiting for final Kafka decisions.',
      );

      const approved = collector.messages.find(
        (message) => message.topic === KAFKA_TOPICS.TRADES_APPROVED,
      );
      const rejected = collector.messages.find(
        (message) => message.topic === KAFKA_TOPICS.TRADES_REJECTED,
      );

      expect(approved).toBeDefined();
      expect(rejected).toBeDefined();
      expect((approved?.payload as TradeDecision).decision).toBe(
        TradeDecisionKind.APPROVED,
      );
      expect((rejected?.payload as TradeDecision).decision).toBe(
        TradeDecisionKind.REJECTED,
      );
      expect((rejected?.payload as TradeDecision).reasonCodes).toEqual([
        TradeDecisionReason.PORTFOLIO_EXPOSURE_CAP_EXCEEDED,
      ]);
      expect(await prisma.exposureReservation.count()).toBe(1);
      expect(await prisma.portfolioSignalCandidateRecord.count()).toBe(2);
    } finally {
      await collector.consumer.stop();
      await collector.consumer.disconnect();
    }
  });

  it('does not create extra records when the same source event is replayed', async () => {
    await createInstrument();
    await prisma.portfolio.create({
      data: {
        id: 'portfolio-alpha',
        name: 'Alpha',
        exposureCapNotional: 200,
      },
    });
    await prisma.portfolioInstrumentConfig.create({
      data: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        enabled: true,
        targetNotional: 100,
        maxTradeNotional: 150,
        maxPositionNotional: 200,
      },
    });

    await publishSignal('source-event-1', 'signal-1');

    await waitForCondition(
      async () => {
        await eventDispatcher.dispatchOutboxBatch();
        return (await prisma.riskDecision.count()) === 1;
      },
      15000,
      'Timed out waiting for the initial risk decision.',
    );

    await publishSignal('source-event-1', 'signal-1-replay');

    await waitForCondition(
      async () => {
        await eventDispatcher.dispatchOutboxBatch();
        return true;
      },
      2000,
      'Failed to flush outbox after replay.',
    );

    expect(await prisma.signalReceipt.count()).toBe(1);
    expect(await prisma.portfolioSignalCandidateRecord.count()).toBe(1);
    expect(await prisma.riskDecision.count()).toBe(1);
    expect(await prisma.exposureReservation.count()).toBe(1);
  });

  it('fans out disabled subscriptions and emits a subscription-disabled rejection', async () => {
    await createInstrument();
    await prisma.portfolio.create({
      data: {
        id: 'portfolio-alpha',
        name: 'Alpha',
        exposureCapNotional: 200,
      },
    });
    await prisma.portfolioInstrumentConfig.create({
      data: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        enabled: false,
        targetNotional: 100,
        maxTradeNotional: 150,
        maxPositionNotional: 200,
      },
    });

    const collector = await startCollector(kafka, [
      KAFKA_TOPICS.TRADES_REJECTED,
    ]);

    try {
      await publishSignal('source-event-disabled', 'signal-disabled');

      await waitForCondition(
        async () => {
          await eventDispatcher.dispatchOutboxBatch();
          return (await prisma.riskDecision.count()) === 1;
        },
        15000,
        'Timed out waiting for disabled-subscription rejection.',
      );
      await waitForCondition(
        () => collector.messages.length === 1,
        10000,
        'Timed out waiting for disabled-subscription Kafka rejection.',
      );

      const decision = await prisma.riskDecision.findFirstOrThrow();

      expect(await prisma.portfolioSignalCandidateRecord.count()).toBe(1);
      expect(decision.reasonCodes).toEqual(['SUBSCRIPTION_DISABLED']);
      expect(
        (collector.messages[0]?.payload as TradeDecision).reasonCodes,
      ).toEqual([TradeDecisionReason.SUBSCRIPTION_DISABLED]);
    } finally {
      await collector.consumer.stop();
      await collector.consumer.disconnect();
    }
  });

  it('writes audit state and emits no final event when no eligible portfolios exist', async () => {
    await createInstrument();
    const collector = await startCollector(kafka, [
      KAFKA_TOPICS.TRADES_APPROVED,
      KAFKA_TOPICS.TRADES_REJECTED,
    ]);

    try {
      await publishSignal('source-event-1', 'signal-1');

      await waitForCondition(
        async () => {
          await eventDispatcher.dispatchOutboxBatch();
          const receipt = await prisma.signalReceipt.findUnique({
            where: { sourceEventId: 'source-event-1' },
          });
          return receipt?.status === 'NO_ELIGIBLE_PORTFOLIOS';
        },
        15000,
        'Timed out waiting for audit-only signal receipt.',
      );

      await new Promise((resolve) => setTimeout(resolve, 1500));
      await eventDispatcher.dispatchOutboxBatch();

      expect(collector.messages).toHaveLength(0);
      expect(await prisma.riskDecision.count()).toBe(0);
      expect(await prisma.portfolioSignalCandidateRecord.count()).toBe(0);
    } finally {
      await collector.consumer.stop();
      await collector.consumer.disconnect();
    }
  });

  it('rejects deterministically when config disappears after fan-out', async () => {
    await createInstrument();
    await prisma.portfolio.create({
      data: {
        id: 'portfolio-alpha',
        name: 'Alpha',
        exposureCapNotional: 200,
      },
    });
    await prisma.portfolioInstrumentConfig.create({
      data: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        enabled: true,
        targetNotional: 100,
        maxTradeNotional: 150,
        maxPositionNotional: 200,
      },
    });

    const collector = await startCollector(kafka, [
      KAFKA_TOPICS.TRADES_REJECTED,
    ]);

    try {
      await publishSignal(
        'source-event-missing-config',
        'signal-missing-config',
      );

      await waitForCondition(
        async () =>
          (await prisma.portfolioSignalCandidateRecord.count()) === 1 &&
          (await prisma.outboxEvent.count({
            where: {
              topic: KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO,
            },
          })) === 1,
        10000,
        'Timed out waiting for pre-dispatch candidate fan-out.',
      );

      await prisma.portfolioInstrumentConfig.delete({
        where: {
          portfolioId_instrumentId: {
            portfolioId: 'portfolio-alpha',
            instrumentId: 'instrument-1',
          },
        },
      });

      await waitForCondition(
        async () => {
          await eventDispatcher.dispatchOutboxBatch();
          return (await prisma.riskDecision.count()) === 1;
        },
        15000,
        'Timed out waiting for missing-config rejection.',
      );
      await waitForCondition(
        () => collector.messages.length === 1,
        10000,
        'Timed out waiting for missing-config Kafka rejection.',
      );

      const decision = await prisma.riskDecision.findFirstOrThrow();

      expect(decision.reasonCodes).toEqual(['SUBSCRIPTION_DISABLED']);
      expect(await prisma.exposureReservation.count()).toBe(0);
      expect(
        (collector.messages[0]?.payload as TradeDecision).reasonCodes,
      ).toEqual([TradeDecisionReason.SUBSCRIPTION_DISABLED]);
    } finally {
      await collector.consumer.stop();
      await collector.consumer.disconnect();
    }
  });

  it('preserves portfolio-stage candidate order and rejects once reservations exceed the cap', async () => {
    await createInstrument();
    await prisma.portfolio.create({
      data: {
        id: 'portfolio-alpha',
        name: 'Alpha',
        exposureCapNotional: 150,
      },
    });
    await prisma.portfolioInstrumentConfig.create({
      data: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        enabled: true,
        targetNotional: 100,
        maxTradeNotional: 150,
        maxPositionNotional: 500,
      },
    });

    const collector = await startCollector(kafka, [
      KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO,
    ]);

    try {
      await publishSignal('source-event-1', 'signal-1');
      await publishSignal('source-event-2', 'signal-2');

      await waitForCondition(
        async () => {
          await eventDispatcher.dispatchOutboxBatch();
          return (await prisma.riskDecision.count()) === 2;
        },
        15000,
        'Timed out waiting for ordered final decisions.',
      );
      await waitForCondition(
        () => collector.messages.length === 2,
        10000,
        'Timed out waiting for ordered portfolio candidate events.',
      );

      const candidateMessages = collector.messages.map(
        (message) => message.payload as PortfolioSignalCandidate,
      );
      const decisions = await prisma.riskDecision.findMany({
        orderBy: {
          createdAt: 'asc',
        },
      });

      expect(
        candidateMessages.map((candidate) => candidate.signal?.id),
      ).toEqual(['signal-1', 'signal-2']);
      expect(decisions.map((decision) => decision.sourceEventId)).toEqual([
        'source-event-1',
        'source-event-2',
      ]);
      expect(decisions.map((decision) => decision.decision)).toEqual([
        'APPROVED',
        'REJECTED',
      ]);
      expect(decisions[1]?.reasonCodes).toEqual([
        'PORTFOLIO_EXPOSURE_CAP_EXCEEDED',
      ]);
      expect(await prisma.exposureReservation.count()).toBe(1);
    } finally {
      await collector.consumer.stop();
      await collector.consumer.disconnect();
    }
  });
});
