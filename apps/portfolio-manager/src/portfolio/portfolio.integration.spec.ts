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
  RegisterPortfolioInstrumentRequest,
} from '@trading-bot/common/proto';
import {
  startKafkaMessageCollector,
  truncateTopic,
  waitForCondition,
} from '@trading-bot/testing';
import { Admin, Kafka, logLevel } from 'kafkajs';

import { AppModule } from '../app.module';
import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioService } from './services/portfolio.service';

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
        enableFillReconciliationConsumer: false,
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
    await prisma.portfolioInstrumentConfig.deleteMany();
    await prisma.instrument.deleteMany();
    await prisma.portfolio.deleteMany();
    await truncateTopic(kafkaAdmin, KAFKA_TOPICS.INSTRUMENT_REGISTERED);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany();
    await prisma.portfolioInstrumentConfig.deleteMany();
    await prisma.instrument.deleteMany();
    await prisma.portfolio.deleteMany();
    await truncateTopic(kafkaAdmin, KAFKA_TOPICS.INSTRUMENT_REGISTERED);
    await kafkaAdmin.disconnect();
    await prisma.$disconnect();
    await moduleRef.close();
  });

  it('persists an instrument, creates one outbox event, and emits one registration message', async () => {
    const request: RegisterPortfolioInstrumentRequest = {
      portfolioId: 'portfolio-integration',
      assetClass: AssetClass.STOCK,
      symbol: 'AAPL',
      venue: 'NASDAQ',
      externalSymbol: 'AAPL',
      enabled: true,
      targetNotional: '100',
      maxTradeNotional: '25',
      maxPositionNotional: '400',
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
    const collector = await startKafkaMessageCollector({
      kafka,
      topics: [KAFKA_TOPICS.INSTRUMENT_REGISTERED],
      groupIdPrefix: 'portfolio-manager-integration',
      mapMessage: ({ key, headers, value }) => ({
        key,
        headers,
        payload: InstrumentRegistered.decode(value ?? new Uint8Array()),
      }),
    });

    try {
      await prisma.portfolio.create({
        data: {
          id: request.portfolioId,
          name: 'Integration Portfolio',
          exposureCapNotional: '1000',
          isActive: true,
        },
      });

      const result =
        await portfolioService.registerPortfolioInstrument(request);

      await eventDispatcher.dispatchOutboxBatch();
      await waitForCondition(
        () => collector.messages.length === 1,
        10000,
        'Timed out waiting for the instrument.registered event to be consumed.',
      );

      const instruments = await prisma.instrument.findMany();
      const instrumentConfigs =
        await prisma.portfolioInstrumentConfig.findMany();
      const outboxEvents = await prisma.outboxEvent.findMany();
      const consumed = collector.messages[0];

      if (!consumed) {
        throw new Error('Expected one consumed instrument registration event.');
      }

      expect(instruments).toHaveLength(1);
      expect(instrumentConfigs).toHaveLength(1);
      expect(outboxEvents).toHaveLength(1);
      expect(outboxEvents[0]?.topic).toBe(KAFKA_TOPICS.INSTRUMENT_REGISTERED);
      expect(outboxEvents[0]?.key).toBe(
        instrumentKey(instruments[0].venue, instruments[0].id),
      );
      expect(result.configuredInstrument?.instrument?.id).toBe(
        instruments[0]?.id,
      );
      expect(result.configuredInstrument?.portfolioId).toBe(
        request.portfolioId,
      );

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
      await collector.consumer.stop();
      await collector.consumer.disconnect();
    }
  }, 15000);
});
