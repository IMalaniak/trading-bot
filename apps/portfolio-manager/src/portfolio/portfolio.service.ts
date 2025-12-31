import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { GrpcStatusCode } from '@trading-bot/common';
import {
  Instrument,
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from '@trading-bot/common/proto';

import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentMapper } from './mapper/instrument.mapper';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instrumentMapper: InstrumentMapper,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  async registerInstrument(
    data: RegisterInstrumentRequest,
  ): Promise<RegisterInstrumentResponse> {
    const instrument = await this.prisma.$transaction(async (tx) => {
      const createdInstrument = await tx.instrument
        .create({
          data: {
            symbol: data.symbol,
            assetClass: data.assetClass,
            venue: data.venue,
            externalSymbol: data.externalSymbol,
          },
        })
        .catch((error) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
              throw new RpcException({
                message: 'Instrument already exists',
                code: GrpcStatusCode.ALREADY_EXISTS,
              });
            }
          }
          throw error;
        });

      const kafkaPayload = Instrument.fromPartial({
        id: createdInstrument.id,
        symbol: createdInstrument.symbol,
        assetClass: createdInstrument.assetClass,
        venue: createdInstrument.venue,
        ...(createdInstrument.externalSymbol && {
          externalSymbol: createdInstrument.externalSymbol,
        }),
      });

      await this.eventDispatcher.enqueueEvent(
        tx,
        'portfolio.instrument.created',
        {
          key: createdInstrument.id,
          value: Instrument.encode(kafkaPayload).finish(),
          headers: {
            'content-type': 'application/x-protobuf',
          },
        },
      );

      return createdInstrument;
    });

    return { instrument: this.instrumentMapper.map(instrument) };
  }
}
