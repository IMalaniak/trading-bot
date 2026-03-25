import { Test } from '@nestjs/testing';
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

import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentRegisteredEventFactory } from './events/instrument-registered-event.factory';
import { InstrumentMapper } from './mapper/instrument.mapper';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let prismaService: PrismaService;
  let enqueueEventMock: jest.MockedFunction<
    EventDispatcherService['enqueueEvent']
  >;
  let eventDispatcher: {
    enqueueEvent: EventDispatcherService['enqueueEvent'];
  };

  const request: RegisterInstrumentRequest = {
    assetClass: AssetClass.CRYPTO,
    symbol: 'BTC/USDT',
    venue: 'BINANCE',
    externalSymbol: 'BTCUSDT',
  };

  beforeEach(async () => {
    enqueueEventMock = jest.fn().mockResolvedValue('event-1');
    eventDispatcher = {
      enqueueEvent: enqueueEventMock,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: PrismaService,
          useValue: {
            instrument: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: EventDispatcherService,
          useValue: eventDispatcher,
        },
        InstrumentMapper,
        InstrumentRegisteredEventFactory,
      ],
    }).compile();

    service = moduleRef.get(PortfolioService);
    prismaService = moduleRef.get(PrismaService);
  });

  it('creates an instrument, enqueues outbox event, and returns mapped result', async () => {
    const createdInstrument = {
      id: 'instrument-1',
      assetClass: AssetClass.CRYPTO,
      symbol: request.symbol,
      venue: request.venue,
      externalSymbol: request.externalSymbol,
    };
    const tx = {
      instrument: {
        create: jest.fn().mockResolvedValue(createdInstrument),
      },
      $executeRaw: jest.fn(),
    };
    (prismaService.$transaction as jest.Mock).mockImplementation(
      (cb: (client: typeof tx) => unknown) => cb(tx),
    );

    const result = await service.registerInstrument(request);

    expect(tx.instrument.create).toHaveBeenCalledWith({
      data: {
        symbol: request.symbol,
        assetClass: request.assetClass,
        venue: request.venue,
        externalSymbol: request.externalSymbol,
      },
    });

    expect(eventDispatcher.enqueueEvent).toHaveBeenCalledTimes(1);

    const firstEnqueueCall = enqueueEventMock.mock.calls[0];
    if (!firstEnqueueCall) {
      throw new Error('Expected enqueueEvent to be called once');
    }
    const [, topic, message] = firstEnqueueCall;
    const messageHeaders = message.headers;
    if (!messageHeaders) {
      throw new Error('Expected enqueueEvent headers to be defined');
    }
    const payload = InstrumentRegistered.decode(message.value);

    expect(topic).toBe(KAFKA_TOPICS.INSTRUMENT_REGISTERED);
    expect(message.key).toBe(
      instrumentKey(createdInstrument.venue, createdInstrument.id),
    );
    expect(message.eventId).toEqual(expect.any(String));
    expect(messageHeaders).toEqual(
      expect.objectContaining({
        [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: message.eventId,
        [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]:
          KAFKA_TOPICS.INSTRUMENT_REGISTERED,
        [KAFKA_EVENT_HEADER_NAMES.SCHEMA_VERSION]:
          KAFKA_EVENT_SCHEMA_VERSIONS.INSTRUMENT_REGISTERED,
        [KAFKA_EVENT_HEADER_NAMES.PRODUCER]:
          KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
        [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]: 'application/x-protobuf',
      }),
    );
    expect(payload.instrument).toEqual({
      id: createdInstrument.id,
      symbol: createdInstrument.symbol,
      assetClass: createdInstrument.assetClass,
      venue: createdInstrument.venue,
      externalSymbol: createdInstrument.externalSymbol,
    });
    expect(payload.registeredAt).toBe(
      messageHeaders[KAFKA_EVENT_HEADER_NAMES.OCCURRED_AT],
    );
    expect(result).toEqual({
      instrument: createdInstrument,
    });
  });

  it('throws RpcException with ALREADY_EXISTS when instrument already exists', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '',
      },
    );
    const tx = {
      instrument: {
        create: jest.fn().mockRejectedValue(uniqueError),
      },
      $executeRaw: jest.fn(),
    };
    (prismaService.$transaction as jest.Mock).mockImplementation(
      (cb: (client: typeof tx) => unknown) => cb(tx),
    );

    await expect(service.registerInstrument(request)).rejects.toMatchSnapshot();

    expect(eventDispatcher.enqueueEvent).not.toHaveBeenCalled();
  });
});
