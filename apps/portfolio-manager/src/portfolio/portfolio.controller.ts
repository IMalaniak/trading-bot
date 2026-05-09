import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  GetPortfolioResponse,
  ListInstrumentsResponse,
  ListPortfoliosResponse,
  RegisterPortfolioInstrumentResponse,
} from '@trading-bot/common/proto';

import {
  GetPortfolioRequestDto,
  ListInstrumentsRequestDto,
  RegisterPortfolioInstrumentRequestDto,
} from './dto/portfolio-read-request.dto';
import { PortfolioService } from './portfolio.service';
import { PortfolioQueryService } from './services/portfolio-query.service';

@Controller()
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly portfolioQueryService: PortfolioQueryService,
  ) {}

  @GrpcMethod('RiskAndPortfolioManager', 'RegisterPortfolioInstrument')
  async registerPortfolioInstrument(
    data: RegisterPortfolioInstrumentRequestDto,
  ): Promise<RegisterPortfolioInstrumentResponse> {
    return await this.portfolioService.registerPortfolioInstrument(data);
  }

  @GrpcMethod('RiskAndPortfolioManager', 'ListPortfolios')
  async listPortfolios(): Promise<ListPortfoliosResponse> {
    return await this.portfolioQueryService.listPortfolios();
  }

  @GrpcMethod('RiskAndPortfolioManager', 'GetPortfolio')
  async getPortfolio(
    data: GetPortfolioRequestDto,
  ): Promise<GetPortfolioResponse> {
    return await this.portfolioQueryService.getPortfolio(data.portfolioId);
  }

  @GrpcMethod('RiskAndPortfolioManager', 'ListInstruments')
  async listInstruments(
    data: ListInstrumentsRequestDto,
  ): Promise<ListInstrumentsResponse> {
    return await this.portfolioQueryService.listInstruments(data.instrumentIds);
  }
}
