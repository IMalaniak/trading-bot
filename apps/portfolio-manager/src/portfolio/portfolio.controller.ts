import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  GetPortfolioResponse,
  ListInstrumentsResponse,
  ListPortfoliosResponse,
  ListRiskConfigAuditLogResponse,
  ListRiskDecisionsResponse,
  RegisterPortfolioInstrumentResponse,
  UpdatePortfolioInstrumentConfigResponse,
  UpdatePortfolioResponse,
} from '@trading-bot/common/proto';

import {
  GetPortfolioRequestDto,
  ListInstrumentsRequestDto,
  RegisterPortfolioInstrumentRequestDto,
} from './dto/portfolio-read-request.dto';
import {
  ListRiskConfigAuditLogRequestDto,
  ListRiskDecisionsRequestDto,
  UpdatePortfolioInstrumentConfigRequestDto,
  UpdatePortfolioRequestDto,
} from './dto/portfolio-write-request.dto';
import { ListRiskConfigAuditLogService } from './services/list-risk-config-audit-log.service';
import { ListRiskDecisionsService } from './services/list-risk-decisions.service';
import { PortfolioService } from './services/portfolio.service';
import { PortfolioQueryService } from './services/portfolio-query.service';
import { UpdatePortfolioService } from './services/update-portfolio.service';
import { UpdatePortfolioInstrumentConfigService } from './services/update-portfolio-instrument-config.service';

@Controller()
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly portfolioQueryService: PortfolioQueryService,
    private readonly updatePortfolioInstrumentConfigService: UpdatePortfolioInstrumentConfigService,
    private readonly updatePortfolioService: UpdatePortfolioService,
    private readonly listRiskDecisionsService: ListRiskDecisionsService,
    private readonly listRiskConfigAuditLogService: ListRiskConfigAuditLogService,
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

  @GrpcMethod('RiskAndPortfolioManager', 'UpdatePortfolioInstrumentConfig')
  async updatePortfolioInstrumentConfig(
    data: UpdatePortfolioInstrumentConfigRequestDto,
  ): Promise<UpdatePortfolioInstrumentConfigResponse> {
    return await this.updatePortfolioInstrumentConfigService.updateConfig(data);
  }

  @GrpcMethod('RiskAndPortfolioManager', 'UpdatePortfolio')
  async updatePortfolio(
    data: UpdatePortfolioRequestDto,
  ): Promise<UpdatePortfolioResponse> {
    return await this.updatePortfolioService.updatePortfolio(data);
  }

  @GrpcMethod('RiskAndPortfolioManager', 'ListRiskDecisions')
  async listRiskDecisions(
    data: ListRiskDecisionsRequestDto,
  ): Promise<ListRiskDecisionsResponse> {
    return await this.listRiskDecisionsService.listDecisions(data);
  }

  @GrpcMethod('RiskAndPortfolioManager', 'ListRiskConfigAuditLog')
  async listRiskConfigAuditLog(
    data: ListRiskConfigAuditLogRequestDto,
  ): Promise<ListRiskConfigAuditLogResponse> {
    return await this.listRiskConfigAuditLogService.listAuditLog(data);
  }
}
