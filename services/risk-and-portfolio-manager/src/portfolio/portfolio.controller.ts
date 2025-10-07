import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from 'src/types/services/risk_manager';

import { PortfolioService } from './portfolio.service';

@Controller()
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @GrpcMethod('RiskAndPortfolioManager', 'RegisterInstrument')
  async registerInstrument(
    data: RegisterInstrumentRequest,
  ): Promise<RegisterInstrumentResponse> {
    return await this.portfolioService.registerInstrument(data);
  }
}
