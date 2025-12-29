import { Test } from '@nestjs/testing';
import {
  AssetClass,
  Instrument as ProtoInstrument,
  RegisterInstrumentRequest,
} from '@trading-bot/common/proto';
import { of } from 'rxjs';

import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { PORTFOLIO_KAFKA_CLIENT } from './constants';
import { InstrumentMapper } from './mapper/instrument.mapper';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let prismaService: PrismaService;
  let kafkaClient: {
    emit: jest.Mock;
    connect: jest.Mock;
    close: jest.Mock;
  };

  const request: RegisterInstrumentRequest = {
    assetClass: AssetClass.CRYPTO,
    symbol: 'BTCUSDT',
    venue: 'BINANCE',
    externalSymbol: 'BTC/USDT',
  };

  beforeEach(async () => {
    kafkaClient = {
      emit: jest.fn(),
      connect: jest.fn(),
      close: jest.fn(),
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
          },
        },
        {
          provide: PORTFOLIO_KAFKA_CLIENT,
          useValue: kafkaClient,
        },
        InstrumentMapper,
      ],
    }).compile();

    service = moduleRef.get(PortfolioService);
    prismaService = moduleRef.get(PrismaService);
  });

  it('connects Kafka producer on module init', async () => {
    await service.onModuleInit();

    expect(kafkaClient.connect).toHaveBeenCalledTimes(1);
  });

  it('closes Kafka producer on module destroy', async () => {
    await service.onModuleDestroy();

    expect(kafkaClient.close).toHaveBeenCalledTimes(1);
  });

  it('creates an instrument, emits kafka event, and returns mapped result', async () => {
    const createdInstrument = {
      id: 'instrument-1',
      assetClass: AssetClass.CRYPTO,
      symbol: request.symbol,
      venue: request.venue,
      externalSymbol: request.externalSymbol,
    };
    (prismaService.instrument.create as jest.Mock).mockResolvedValue(
      createdInstrument,
    );

    kafkaClient.emit.mockReturnValue(of(undefined));

    const result = await service.registerInstrument(request);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prismaService.instrument.create).toHaveBeenCalledWith({
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

    expect(kafkaClient.emit).toHaveBeenCalledWith(
      'portfolio.instrument.created',
      {
        key: String(createdInstrument.id),
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
    (prismaService.instrument.create as jest.Mock).mockRejectedValue(
      uniqueError,
    );

    await expect(service.registerInstrument(request)).rejects.toMatchSnapshot();

    expect(kafkaClient.emit).not.toHaveBeenCalled();
  });
});
