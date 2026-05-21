import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AppResponseCode, GrpcStatusCode } from '@trading-bot/common';
import type {
  UpdateStrategyRequest,
  UpdateStrategyResponse,
} from '@trading-bot/common/proto';

import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';

@Injectable()
export class UpdateStrategyService {
  constructor(
    private readonly repository: PortfolioWriteRepository,
    private readonly mapper: PortfolioReadMapper,
  ) {}

  async updateStrategy(
    request: UpdateStrategyRequest,
  ): Promise<UpdateStrategyResponse> {
    const existing = await this.repository.findStrategyById(request.strategyId);

    if (!existing) {
      throw new RpcException({
        message: `Strategy '${request.strategyId}' was not found`,
        code: GrpcStatusCode.NOT_FOUND,
        appCode: AppResponseCode.STRATEGY_NOT_FOUND,
      });
    }

    const updated = await this.repository.updateStrategy(request.strategyId, {
      name: request.name,
      description: request.description,
      allowedSides: request.allowedSides,
      minIntervalSecs:
        request.minIntervalSecs !== undefined
          ? request.minIntervalSecs
          : undefined,
      activeTimeStart: request.activeTimeStart,
      activeTimeEnd: request.activeTimeEnd,
    });

    return { strategy: this.mapper.mapStrategy(updated) };
  }
}
