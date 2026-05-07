import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  GetPortfolioResponse,
  ListInstrumentsResponse,
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from '@trading-bot/common/proto';

import {
  GetPortfolioRequestDto,
  ListInstrumentsRequestDto,
} from './dto/portfolio-read-request.dto';
import { PortfolioService } from './portfolio.service';
import { PortfolioQueryService } from './services/portfolio-query.service';

@Controller()
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly portfolioQueryService: PortfolioQueryService,
  ) {}

  @GrpcMethod('RiskAndPortfolioManager', 'RegisterInstrument')
  async registerInstrument(
    data: RegisterInstrumentRequest,
  ): Promise<RegisterInstrumentResponse> {
    return await this.portfolioService.registerInstrument(data);
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
