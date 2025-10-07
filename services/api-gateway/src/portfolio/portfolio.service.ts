import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { RISK_AND_PORTFOLIO_CLIENT } from 'src/grpc/grpc.constants';
import {
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from 'src/types/services/risk_manager';

import { IRiskAndPortfolioManager } from './risk-and-portfolio.client.interface';

@Injectable()
export class PortfolioService implements OnModuleInit {
  private riskAndPortfolioManagerClient: IRiskAndPortfolioManager;

  constructor(@Inject(RISK_AND_PORTFOLIO_CLIENT) private client: ClientGrpc) {}

  onModuleInit() {
    this.riskAndPortfolioManagerClient =
      this.client.getService<IRiskAndPortfolioManager>(
        'RiskAndPortfolioManager',
      );
  }

  public async registerInstrument(
    data: RegisterInstrumentRequest,
  ): Promise<RegisterInstrumentResponse> {
    return await lastValueFrom(
      this.riskAndPortfolioManagerClient.registerInstrument(data),
    );
  }
}
