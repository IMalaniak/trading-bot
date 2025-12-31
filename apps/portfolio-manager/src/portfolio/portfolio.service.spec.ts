import { Test } from '@nestjs/testing';
import {
  AssetClass,
  Instrument as ProtoInstrument,
  RegisterInstrumentRequest,
} from '@trading-bot/common/proto';

import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentMapper } from './mapper/instrument.mapper';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let prismaService: PrismaService;
  let eventDispatcher: {
    enqueueEvent: jest.Mock;
  };

  const request: RegisterInstrumentRequest = {
    assetClass: AssetClass.CRYPTO,
    symbol: 'BTCUSDT',
    venue: 'BINANCE',
    externalSymbol: 'BTC/USDT',
  };

  beforeEach(async () => {
    eventDispatcher = {
      enqueueEvent: jest.fn(),
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

    const expectedPayload = ProtoInstrument.fromPartial({
      id: createdInstrument.id,
      symbol: createdInstrument.symbol,
      assetClass: createdInstrument.assetClass,
      venue: createdInstrument.venue,
      externalSymbol: createdInstrument.externalSymbol,
    });
    const expectedBuffer = ProtoInstrument.encode(expectedPayload).finish();

    expect(eventDispatcher.enqueueEvent).toHaveBeenCalledWith(
      tx,
      'portfolio.instrument.created',
      {
        key: createdInstrument.id,
        value: expectedBuffer,
        headers: { 'content-type': 'application/x-protobuf' },
      },
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
