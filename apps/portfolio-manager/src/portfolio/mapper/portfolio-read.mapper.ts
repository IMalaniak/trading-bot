import { Injectable } from '@nestjs/common';
import {
  GetPortfolioResponse,
  ListInstrumentsResponse,
} from '@trading-bot/common/proto';

import { InstrumentModel } from '../../prisma/generated/models';
import { prismaDecimalToString } from '../../prisma/prisma-decimal';
import { PortfolioReadModel } from '../repositories/portfolio-query.repository';
import { InstrumentMapper } from './instrument.mapper';

@Injectable()
export class PortfolioReadMapper {
  constructor(private readonly instrumentMapper: InstrumentMapper) {}

  mapPortfolio(state: PortfolioReadModel): GetPortfolioResponse {
    return {
      summary: {
        portfolioId: state.portfolio.id,
        name: state.portfolio.name,
        isActive: state.portfolio.isActive,
        exposureCapNotional: prismaDecimalToString(
          state.portfolio.exposureCapNotional,
        ),
        aggregateExposureNotional: prismaDecimalToString(
          state.aggregateExposureNotional,
        ),
        openPositionCount: state.openPositionCount,
        updatedAt: state.updatedAt.toISOString(),
      },
      positions: state.positions.map((position) => ({
        portfolioId: position.portfolioId,
        instrument: this.instrumentMapper.map(position.instrument),
        quantity: prismaDecimalToString(position.quantity),
        averageEntryPrice: prismaDecimalToString(position.averageEntryPrice),
        exposureNotional: prismaDecimalToString(position.exposureNotional),
        lastFillId: position.lastFillId ?? '',
        updatedAt: position.updatedAt.toISOString(),
      })),
    };
  }

  mapInstruments(
    instruments: readonly InstrumentModel[],
  ): ListInstrumentsResponse {
    return {
      instruments: instruments.map((instrument) =>
        this.instrumentMapper.map(instrument),
      ),
    };
  }
}
