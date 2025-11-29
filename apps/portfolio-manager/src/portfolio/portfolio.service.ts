import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { GrpcStatusCode } from '@trading-bot/common';
import {
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from '@trading-bot/common/proto';

import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentMapper } from './mapper/instrument.mapper';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instrumentMapper: InstrumentMapper,
  ) {}

  async registerInstrument(
    data: RegisterInstrumentRequest,
  ): Promise<RegisterInstrumentResponse> {
    const instrument = await this.prisma.instrument
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

    return { instrument: this.instrumentMapper.map(instrument) };
  }
}
