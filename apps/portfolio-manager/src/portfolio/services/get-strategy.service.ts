import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AppResponseCode, GrpcStatusCode } from '@trading-bot/common';
import type {
  GetStrategyRequest,
  GetStrategyResponse,
} from '@trading-bot/common/proto';

import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';

@Injectable()
export class GetStrategyService {
  constructor(
    private readonly repository: PortfolioWriteRepository,
    private readonly mapper: PortfolioReadMapper,
  ) {}

  async getStrategy(request: GetStrategyRequest): Promise<GetStrategyResponse> {
    const strategy = await this.repository.findStrategyById(request.strategyId);

    if (!strategy) {
      throw new RpcException({
        message: `Strategy '${request.strategyId}' was not found`,
        code: GrpcStatusCode.NOT_FOUND,
        appCode: AppResponseCode.STRATEGY_NOT_FOUND,
      });
    }

    return { strategy: this.mapper.mapStrategy(strategy) };
  }
}
