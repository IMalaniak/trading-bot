import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  buildEventMetadataHeaders,
  KAFKA_EVENT_HEADER_NAMES,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
  portfolioKey,
} from '@trading-bot/common';
import {
  OrderFill,
  OrderPlaced,
  OrderStatus,
  Signal,
  SignalSide,
  TradeDecision,
  TradeDecisionKind,
} from '@trading-bot/common/proto';
import {
  KafkaMessageCollector,
  startKafkaMessageCollector,
  truncateTopic,
  waitForCondition,
} from '@trading-bot/testing';
import { Admin, Kafka, logLevel, Producer } from 'kafkajs';

import { AppModule } from '../app/app.module';
import { executionEngineRuntimeConfig } from '../config/runtime.config';
import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

type CollectedMessage =
  | {
      topic: typeof KAFKA_TOPICS.ORDERS_PLACED;
      key: string | undefined;
      headers: Record<string, string | undefined>;
      payload: OrderPlaced;
    }
  | {
      topic: typeof KAFKA_TOPICS.ORDERS_FILLS;
      key: string | undefined;
      headers: Record<string, string | undefined>;
      payload: OrderFill;
    };

const decodeTopicMessage = (
  topic: string,
  value: Buffer | null,
): OrderPlaced | OrderFill => {
  switch (topic) {
    case KAFKA_TOPICS.ORDERS_PLACED:
      return OrderPlaced.decode(value ?? new Uint8Array());
    case KAFKA_TOPICS.ORDERS_FILLS:
      return OrderFill.decode(value ?? new Uint8Array());
    default:
      throw new Error(`Unexpected topic '${topic}'`);
  }
};

const startCollector = async (
  kafka: Kafka,
  topics: string[],
): Promise<KafkaMessageCollector<CollectedMessage>> =>
  startKafkaMessageCollector({
    kafka,
    topics,
    groupIdPrefix: 'execution-engine-integration',
    mapMessage: ({ topic, key, headers, value }) =>
      ({
        topic: topic as CollectedMessage['topic'],
        key,
        headers,
        payload: decodeTopicMessage(topic, value),
      }) as CollectedMessage,
  });

describe('Execution engine integration', () => {
  let moduleRef: TestingModule;
  let configService: ConfigService;
  let prisma: PrismaService;
  let eventDispatcher: EventDispatcherService;
  let kafkaAdmin: Admin;
  let kafkaProducer: Producer;
  let kafka: Kafka;

  const createModule = async (): Promise<void> => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(executionEngineRuntimeConfig.KEY)
      .useValue({
        enableOutboxInterval: false,
        enableApprovedTradesConsumer: true,
      })
      .compile();

    await moduleRef.init();

    configService = moduleRef.get(ConfigService);
    prisma = moduleRef.get(PrismaService);
    eventDispatcher = moduleRef.get(EventDispatcherService);
  };

  const approvedTrade = TradeDecision.fromPartial({
    signal: Signal.fromPartial({
      id: 'signal-1',
      instrumentId: 'instrument-1',
      side: SignalSide.BUY,
      price: 100,
      timestamp: new Date('2026-03-25T12:00:00.000Z').getTime(),
    }),
    sourceEventId: 'source-event-1',
    portfolioId: 'portfolio-alpha',
    candidateIdempotencyKey: 'source-event-1:portfolio-alpha',
    decision: TradeDecisionKind.APPROVED,
    requestedNotional: '100',
    requestedQuantity: '1',
    referencePrice: '100',
    decidedAt: '2026-03-25T12:00:02.000Z',
  });

  const publishApprovedTrade = async (
    approvalEventId: string,
    tradeDecision = approvedTrade,
  ): Promise<void> => {
    const occurredAt = new Date().toISOString();

    await kafkaProducer.send({
      topic: KAFKA_TOPICS.TRADES_APPROVED,
      messages: [
        {
          key: portfolioKey(tradeDecision.portfolioId),
          value: Buffer.from(TradeDecision.encode(tradeDecision).finish()),
          headers: buildEventMetadataHeaders({
            eventId: approvalEventId,
            eventType: KAFKA_TOPICS.TRADES_APPROVED,
            schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.TRADES_APPROVED,
            occurredAt,
            producer: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
          }),
        },
      ],
    });
  };

  beforeAll(async () => {
    await createModule();

    kafka = new Kafka({
      clientId: 'execution-engine-integration',
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
    await prisma.outboxEvent.deleteMany();
    await prisma.executionFill.deleteMany();
    await prisma.executionOrder.deleteMany();

    for (const topic of [
      KAFKA_TOPICS.TRADES_APPROVED,
      KAFKA_TOPICS.ORDERS_PLACED,
      KAFKA_TOPICS.ORDERS_FILLS,
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

  it('consumes approved trades and emits deterministic order lifecycle events', async () => {
    const collector = await startCollector(kafka, [
      KAFKA_TOPICS.ORDERS_PLACED,
      KAFKA_TOPICS.ORDERS_FILLS,
    ]);

    try {
      await publishApprovedTrade('approval-event-1');

      await waitForCondition(
        async () => {
          await eventDispatcher.dispatchOutboxBatch();
          return (
            (await prisma.outboxEvent.count({
              where: { status: 'DISPATCHED' },
            })) === 3
          );
        },
        15000,
        'Timed out waiting for execution outbox dispatch.',
      );
      await waitForCondition(
        () => collector.messages.length === 3,
        10000,
        'Timed out waiting for order lifecycle Kafka events.',
      );

      const order = await prisma.executionOrder.findFirstOrThrow();
      const fills = await prisma.executionFill.findMany({
        orderBy: { sequence: 'asc' },
      });
      const placed = collector.messages.find(
        (message) => message.topic === KAFKA_TOPICS.ORDERS_PLACED,
      );
      const fillMessages = collector.messages
        .filter((message) => message.topic === KAFKA_TOPICS.ORDERS_FILLS)
        .map((message) => message)
        .sort((left, right) => left.payload.sequence - right.payload.sequence);

      expect(order.approvalEventId).toBe('approval-event-1');
      expect(order.candidateIdempotencyKey).toBe(
        approvedTrade.candidateIdempotencyKey,
      );
      expect(order.status).toBe('FILLED');
      expect(fills).toHaveLength(2);
      expect(fills.map((fill) => fill.sequence)).toEqual([1, 2]);

      expect(placed?.key).toBe(portfolioKey(approvedTrade.portfolioId));
      expect(placed?.headers).toEqual(
        expect.objectContaining({
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: `${order.id}:placed`,
          [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]: KAFKA_TOPICS.ORDERS_PLACED,
          [KAFKA_EVENT_HEADER_NAMES.SCHEMA_VERSION]:
            KAFKA_EVENT_SCHEMA_VERSIONS.ORDERS_PLACED,
          [KAFKA_EVENT_HEADER_NAMES.PRODUCER]:
            KAFKA_EVENT_PRODUCERS.EXECUTION_ENGINE,
        }),
      );
      expect((placed?.payload as OrderPlaced).orderId).toBe(order.id);
      expect((placed?.payload as OrderPlaced).status).toBe(OrderStatus.PLACED);
      expect((placed?.payload as OrderPlaced).placedAt).toBe(
        '2026-03-25T12:00:03.000Z',
      );

      expect(
        fillMessages.map((message) => message.payload.orderStatus),
      ).toEqual([OrderStatus.PARTIALLY_FILLED, OrderStatus.FILLED]);
      expect(
        fillMessages.map((message) => message.payload.fillQuantity),
      ).toEqual(['0.5', '0.5']);
      expect(fillMessages[1]?.payload.cumulativeFilledQuantity).toBe('1');
    } finally {
      await collector.consumer.stop();
      await collector.consumer.disconnect();
    }
  });

  it('does not create extra orders or fills when the same approved trade is replayed after restart', async () => {
    await publishApprovedTrade('approval-event-1');

    await waitForCondition(
      async () => {
        await eventDispatcher.dispatchOutboxBatch();
        return (await prisma.executionOrder.count()) === 1;
      },
      15000,
      'Timed out waiting for initial execution order.',
    );

    await moduleRef.close();
    await createModule();
    await publishApprovedTrade('approval-event-1');

    await waitForCondition(
      async () => {
        await eventDispatcher.dispatchOutboxBatch();
        return (await prisma.executionOrder.count()) === 1;
      },
      10000,
      'Timed out waiting for replay idempotency check.',
    );

    expect(await prisma.executionOrder.count()).toBe(1);
    expect(await prisma.executionFill.count()).toBe(2);
    expect(await prisma.outboxEvent.count()).toBe(3);
  });
});
