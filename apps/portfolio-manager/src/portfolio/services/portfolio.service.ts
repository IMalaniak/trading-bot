import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AppResponseCode, GrpcStatusCode } from '@trading-bot/common';
import {
  RegisterPortfolioInstrumentRequest,
  RegisterPortfolioInstrumentResponse,
} from '@trading-bot/common/proto';

import { EventDispatcherService } from '../../event-dispatcher/event-dispatcher.service';
import { InstrumentModel } from '../../prisma/generated/models';
import { PrismaService } from '../../prisma/prisma.service';
import { InstrumentRegisteredEventFactory } from '../events/instrument-registered-event.factory';
import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';

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

      let isNewInstrument = false;
      let instrument: InstrumentModel;

      if (existingInstrument) {
        instrument = existingInstrument;
      } else {
        try {
          instrument = await tx.instrument.create({
            data: {
              symbol: data.symbol,
              assetClass: data.assetClass,
              venue: data.venue,
              externalSymbol: requestedExternalSymbol,
            },
          });
          isNewInstrument = true;
        } catch (err: unknown) {
          // Two concurrent registrations for the same (symbol, venue) can both
          // pass the findFirst check and race to create. The loser hits the DB
          // unique-index (P2002); re-fetch the winner's row and continue.
          if (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            err.code === 'P2002'
          ) {
            const found = await tx.instrument.findFirst({
              where: { symbol: data.symbol, venue: data.venue },
            });

            if (!found) throw err;

            instrument = found;
          } else {
            throw err;
          }
        }
      }

      if (isNewInstrument) {
        const registrationEvent =
          this.instrumentRegisteredEventFactory.create(instrument);

        await this.eventDispatcher.enqueueEvent(
          tx,
          registrationEvent.topic,
          registrationEvent.message,
        );
      } else if (
        instrument.assetClass !== Number(data.assetClass) ||
        (requestedExternalSymbol !== undefined &&
          instrument.externalSymbol !== requestedExternalSymbol)
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
