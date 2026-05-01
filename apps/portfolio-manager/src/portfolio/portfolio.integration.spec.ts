import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  instrumentKey,
  KAFKA_EVENT_HEADER_NAMES,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
} from '@trading-bot/common';
import {
  AssetClass,
  InstrumentRegistered,
  RegisterInstrumentRequest,
} from '@trading-bot/common/proto';
import { randomUUID } from 'crypto';
import { Admin, Kafka, logLevel } from 'kafkajs';

import { AppModule } from '../app.module';
import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioService } from './portfolio.service';

const headerValueToString = (
  value: Buffer | string | readonly (Buffer | string)[] | undefined,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        Buffer.isBuffer(item) ? item.toString('utf8') : String(item),
      )
      .join(',');
  }
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
};

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

describe('PortfolioService integration', () => {
  let moduleRef: TestingModule;
  let configService: ConfigService;
  let prisma: PrismaService;
  let portfolioService: PortfolioService;
  let eventDispatcher: EventDispatcherService;
  let kafkaAdmin: Admin;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(portfolioManagerRuntimeConfig.KEY)
      .useValue({
        enableOutboxInterval: false,
        // This spec validates registration only, so skip the risk Kafka
        // consumers to reduce startup cost and avoid unrelated handles.
        enableRiskPipelineConsumers: false,
      })
      .compile();

    await moduleRef.init();

    configService = moduleRef.get(ConfigService);
    prisma = moduleRef.get(PrismaService);
    portfolioService = moduleRef.get(PortfolioService);
    eventDispatcher = moduleRef.get(EventDispatcherService);

    const kafka = new Kafka({
      clientId: 'portfolio-manager-integration-admin',
      brokers: configService
        .getOrThrow<string>('KAFKA_BROKERS')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
      logLevel: logLevel.NOTHING,
    });
    kafkaAdmin = kafka.admin();

    await kafkaAdmin.connect();
    try {
      const existingTopics = await kafkaAdmin.listTopics();
      if (!existingTopics.includes(KAFKA_TOPICS.INSTRUMENT_REGISTERED)) {
        await kafkaAdmin.createTopics({
          waitForLeaders: true,
          topics: [
            {
              topic: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
              numPartitions: 3,
              replicationFactor: 1,
            },
          ],
        });
      }
    } catch (error) {
      await kafkaAdmin.disconnect();
      throw error;
    }
  });

  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany();
    await prisma.instrument.deleteMany();
    await truncateTopic(kafkaAdmin, KAFKA_TOPICS.INSTRUMENT_REGISTERED);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany();
    await prisma.instrument.deleteMany();
    await truncateTopic(kafkaAdmin, KAFKA_TOPICS.INSTRUMENT_REGISTERED);
    await kafkaAdmin.disconnect();
    await prisma.$disconnect();
    await moduleRef.close();
  });

  it('persists an instrument, creates one outbox event, and emits one registration message', async () => {
    const request: RegisterInstrumentRequest = {
      assetClass: AssetClass.CRYPTO,
      symbol: 'BTC/USDT',
      venue: 'BINANCE',
      externalSymbol: 'BTCUSDT',
    };
    const kafka = new Kafka({
      clientId: 'portfolio-manager-integration-consumer',
      brokers: configService
        .getOrThrow<string>('KAFKA_BROKERS')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
      logLevel: logLevel.NOTHING,
    });
    const consumer = kafka.consumer({
      groupId: `portfolio-manager-integration-${randomUUID()}`,
      maxWaitTimeInMs: 100,
    });

    let resolveMessage:
      | ((value: {
          key: string | undefined;
          headers: Record<string, string | undefined>;
          payload: InstrumentRegistered;
        }) => void)
      | undefined;
    let timeout: NodeJS.Timeout | undefined;
    const receivedMessage = new Promise<{
      key: string | undefined;
      headers: Record<string, string | undefined>;
      payload: InstrumentRegistered;
    }>((resolve, reject) => {
      resolveMessage = resolve;
      timeout = setTimeout(() => {
        reject(
          new Error(
            'Timed out waiting for the instrument.registered event to be consumed.',
          ),
        );
      }, 10000);
    });

    await consumer.connect();
    await consumer.subscribe({
      topic: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      fromBeginning: true,
    });
    void consumer.run({
      autoCommit: false,
      eachMessage: async ({ message }) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        resolveMessage?.({
          key: message.key?.toString('utf8'),
          headers: Object.fromEntries(
            Object.entries(message.headers ?? {}).map(([headerName, value]) => [
              headerName,
              headerValueToString(value),
            ]),
          ),
          payload: InstrumentRegistered.decode(
            message.value ?? new Uint8Array(),
          ),
        });

        return Promise.resolve();
      },
    });

    try {
      const result = await portfolioService.registerInstrument(request);

      await eventDispatcher.dispatchOutboxBatch();

      const instruments = await prisma.instrument.findMany();
      const outboxEvents = await prisma.outboxEvent.findMany();
      const consumed = await receivedMessage;

      expect(instruments).toHaveLength(1);
      expect(outboxEvents).toHaveLength(1);
      expect(outboxEvents[0]?.topic).toBe(KAFKA_TOPICS.INSTRUMENT_REGISTERED);
      expect(outboxEvents[0]?.key).toBe(
        instrumentKey(instruments[0].venue, instruments[0].id),
      );
      expect(result.instrument?.id).toBe(instruments[0]?.id);

      expect(consumed.key).toBe(
        instrumentKey(instruments[0].venue, instruments[0].id),
      );
      expect(consumed.headers).toEqual(
        expect.objectContaining({
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: outboxEvents[0]?.id,
          [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]:
            KAFKA_TOPICS.INSTRUMENT_REGISTERED,
          [KAFKA_EVENT_HEADER_NAMES.SCHEMA_VERSION]:
            KAFKA_EVENT_SCHEMA_VERSIONS.INSTRUMENT_REGISTERED,
          [KAFKA_EVENT_HEADER_NAMES.PRODUCER]:
            KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
          [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]: 'application/x-protobuf',
        }),
      );
      expect(consumed.payload.instrument).toEqual({
        id: instruments[0]?.id,
        assetClass: request.assetClass,
        symbol: request.symbol,
        venue: request.venue,
        externalSymbol: request.externalSymbol,
      });
      expect(consumed.payload.registeredAt).toBe(
        consumed.headers[KAFKA_EVENT_HEADER_NAMES.OCCURRED_AT],
      );
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      await consumer.stop();
      await consumer.disconnect();
    }
  }, 15000);
});
