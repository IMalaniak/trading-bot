import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AppResponseCode, GrpcStatusCode } from '@trading-bot/common';
import {
  RegisterPortfolioInstrumentRequest,
  RegisterPortfolioInstrumentResponse,
} from '@trading-bot/common/proto';

import { EventDispatcherService } from '../event-dispatcher/event-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentRegisteredEventFactory } from './events/instrument-registered-event.factory';
import { PortfolioReadMapper } from './mapper/portfolio-read.mapper';

export const PORTFOLIO_NOT_FOUND_ERROR = 'Portfolio was not found';
export const INSTRUMENT_ALREADY_ATTACHED_ERROR =
  'Instrument already attached to portfolio';
export const INSTRUMENT_METADATA_CONFLICT_ERROR =
  'Instrument metadata conflicts with existing instrument';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolioReadMapper: PortfolioReadMapper,
    private readonly instrumentRegisteredEventFactory: InstrumentRegisteredEventFactory,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  async registerPortfolioInstrument(
    data: RegisterPortfolioInstrumentRequest,
  ): Promise<RegisterPortfolioInstrumentResponse> {
    const configuredInstrument = await this.prisma.$transaction(async (tx) => {
      const portfolio = await tx.portfolio.findUnique({
        where: { id: data.portfolioId },
        select: { id: true },
      });

      if (!portfolio) {
        throw new RpcException({
          message: PORTFOLIO_NOT_FOUND_ERROR,
          code: GrpcStatusCode.NOT_FOUND,
          appCode: AppResponseCode.PORTFOLIO_NOT_FOUND,
        });
      }

      const requestedExternalSymbol = data.externalSymbol || undefined;
      const existingInstrument = await tx.instrument.findFirst({
        where: {
          symbol: data.symbol,
          venue: data.venue,
        },
      });

      const instrument =
        existingInstrument ??
        (await tx.instrument.create({
          data: {
            symbol: data.symbol,
            assetClass: data.assetClass,
            venue: data.venue,
            externalSymbol: requestedExternalSymbol,
          },
        }));

      if (!existingInstrument) {
        const registrationEvent =
          this.instrumentRegisteredEventFactory.create(instrument);

        await this.eventDispatcher.enqueueEvent(
          tx,
          registrationEvent.topic,
          registrationEvent.message,
        );
      } else if (
        existingInstrument.assetClass !== Number(data.assetClass) ||
        (requestedExternalSymbol !== undefined &&
          existingInstrument.externalSymbol !== requestedExternalSymbol)
      ) {
        throw new RpcException({
          message: INSTRUMENT_METADATA_CONFLICT_ERROR,
          code: GrpcStatusCode.ALREADY_EXISTS,
          appCode: AppResponseCode.INSTRUMENT_METADATA_CONFLICT,
        });
      }

      const existingConfig = await tx.portfolioInstrumentConfig.findUnique({
        where: {
          portfolioId_instrumentId: {
            portfolioId: data.portfolioId,
            instrumentId: instrument.id,
          },
        },
      });

      if (existingConfig) {
        throw new RpcException({
          message: INSTRUMENT_ALREADY_ATTACHED_ERROR,
          code: GrpcStatusCode.ALREADY_EXISTS,
          appCode: AppResponseCode.INSTRUMENT_ALREADY_ATTACHED,
        });
      }

      return await tx.portfolioInstrumentConfig.create({
        data: {
          portfolioId: data.portfolioId,
          instrumentId: instrument.id,
          enabled: data.enabled,
          targetNotional: data.targetNotional,
          maxTradeNotional: data.maxTradeNotional,
          maxPositionNotional: data.maxPositionNotional,
        },
        include: {
          instrument: true,
        },
      });
    });

    return {
      configuredInstrument:
        this.portfolioReadMapper.mapConfiguredInstrument(configuredInstrument),
    };
  }
}
