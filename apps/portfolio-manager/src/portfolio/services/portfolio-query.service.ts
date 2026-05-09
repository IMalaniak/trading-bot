import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AppResponseCode, GrpcStatusCode } from '@trading-bot/common';
import {
  GetPortfolioResponse,
  ListInstrumentsResponse,
  ListPortfoliosResponse,
} from '@trading-bot/common/proto';

import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import { PortfolioQueryRepository } from '../repositories/portfolio-query.repository';

@Injectable()
export class PortfolioQueryService {
  constructor(
    private readonly repository: PortfolioQueryRepository,
    private readonly mapper: PortfolioReadMapper,
  ) {}

  async getPortfolio(portfolioId: string): Promise<GetPortfolioResponse> {
    const state = await this.repository.findPortfolio(portfolioId);

    if (!state) {
      throw new RpcException({
        message: `Portfolio '${portfolioId}' was not found`,
        code: GrpcStatusCode.NOT_FOUND,
        appCode: AppResponseCode.PORTFOLIO_NOT_FOUND,
      });
    }

    return this.mapper.mapPortfolio(state);
  }

  async listPortfolios(): Promise<ListPortfoliosResponse> {
    const summaries = await this.repository.listPortfolioSummaries();

    return this.mapper.mapPortfolioSummaries(summaries);
  }

  async listInstruments(
    instrumentIds: readonly string[],
  ): Promise<ListInstrumentsResponse> {
    const instruments = await this.repository.listInstruments(instrumentIds);

    return this.mapper.mapInstruments(instruments);
  }
}
