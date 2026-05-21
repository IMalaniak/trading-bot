import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  AssignStrategyToPortfolioResponse,
  CreateStrategyResponse,
  GetPortfolioResponse,
  GetStrategyResponse,
  ListInstrumentsResponse,
  ListPortfoliosResponse,
  ListRiskConfigAuditLogResponse,
  ListRiskDecisionsResponse,
  ListStrategiesResponse,
  RegisterPortfolioInstrumentResponse,
  UpdatePortfolioInstrumentConfigResponse,
  UpdatePortfolioResponse,
  UpdateStrategyResponse,
} from '@trading-bot/common/proto';

import {
  GetPortfolioRequestDto,
  ListInstrumentsRequestDto,
  RegisterPortfolioInstrumentRequestDto,
} from './dto/portfolio-read-request.dto';
import {
  AssignStrategyToPortfolioRequestDto,
  CreateStrategyRequestDto,
  GetStrategyRequestDto,
  ListRiskConfigAuditLogRequestDto,
  ListRiskDecisionsRequestDto,
  UpdatePortfolioInstrumentConfigRequestDto,
  UpdatePortfolioRequestDto,
  UpdateStrategyRequestDto,
} from './dto/portfolio-write-request.dto';
import { AssignStrategyToPortfolioService } from './services/assign-strategy-to-portfolio.service';
import { CreateStrategyService } from './services/create-strategy.service';
import { GetStrategyService } from './services/get-strategy.service';
import { ListRiskConfigAuditLogService } from './services/list-risk-config-audit-log.service';
import { ListRiskDecisionsService } from './services/list-risk-decisions.service';
import { ListStrategiesService } from './services/list-strategies.service';
import { PortfolioService } from './services/portfolio.service';
import { PortfolioQueryService } from './services/portfolio-query.service';
import { UpdatePortfolioService } from './services/update-portfolio.service';
import { UpdatePortfolioInstrumentConfigService } from './services/update-portfolio-instrument-config.service';
import { UpdateStrategyService } from './services/update-strategy.service';

@Controller()
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly portfolioQueryService: PortfolioQueryService,
    private readonly updatePortfolioInstrumentConfigService: UpdatePortfolioInstrumentConfigService,
    private readonly updatePortfolioService: UpdatePortfolioService,
    private readonly listRiskDecisionsService: ListRiskDecisionsService,
    private readonly listRiskConfigAuditLogService: ListRiskConfigAuditLogService,
    private readonly createStrategyService: CreateStrategyService,
    private readonly updateStrategyService: UpdateStrategyService,
    private readonly getStrategyService: GetStrategyService,
    private readonly listStrategiesService: ListStrategiesService,
    private readonly assignStrategyToPortfolioService: AssignStrategyToPortfolioService,
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

  @GrpcMethod('RiskAndPortfolioManager', 'CreateStrategy')
  async createStrategy(
    data: CreateStrategyRequestDto,
  ): Promise<CreateStrategyResponse> {
    return await this.createStrategyService.createStrategy(data);
  }

  @GrpcMethod('RiskAndPortfolioManager', 'UpdateStrategy')
  async updateStrategy(
    data: UpdateStrategyRequestDto,
  ): Promise<UpdateStrategyResponse> {
    return await this.updateStrategyService.updateStrategy(data);
  }

  @GrpcMethod('RiskAndPortfolioManager', 'GetStrategy')
  async getStrategy(data: GetStrategyRequestDto): Promise<GetStrategyResponse> {
    return await this.getStrategyService.getStrategy(data);
  }

  @GrpcMethod('RiskAndPortfolioManager', 'ListStrategies')
  async listStrategies(): Promise<ListStrategiesResponse> {
    return await this.listStrategiesService.listStrategies();
  }

  @GrpcMethod('RiskAndPortfolioManager', 'AssignStrategyToPortfolio')
  async assignStrategyToPortfolio(
    data: AssignStrategyToPortfolioRequestDto,
  ): Promise<AssignStrategyToPortfolioResponse> {
    return await this.assignStrategyToPortfolioService.assignStrategyToPortfolio(
      data,
    );
  }
}
