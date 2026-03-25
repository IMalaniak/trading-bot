import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { GrpcStatusCode } from '@trading-bot/common';
import {
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from '@trading-bot/common/proto';

import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentRegisteredEventFactory } from './events/instrument-registered-event.factory';
import { InstrumentMapper } from './mapper/instrument.mapper';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instrumentMapper: InstrumentMapper,
    private readonly instrumentRegisteredEventFactory: InstrumentRegisteredEventFactory,
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

      const registrationEvent =
        this.instrumentRegisteredEventFactory.create(createdInstrument);

      await this.eventDispatcher.enqueueEvent(
        tx,
        registrationEvent.topic,
        registrationEvent.message,
      );

      return createdInstrument;
    });

    return { instrument: this.instrumentMapper.map(instrument) };
  }
}
