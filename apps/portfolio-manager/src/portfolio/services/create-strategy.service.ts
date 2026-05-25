import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { AppResponseCode, GrpcStatusCode } from '@trading-bot/common';
import type {
  CreateStrategyRequest,
  CreateStrategyResponse,
} from '@trading-bot/common/proto';

import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';

@Injectable()
export class CreateStrategyService {
  constructor(
    private readonly repository: PortfolioWriteRepository,
    private readonly mapper: PortfolioReadMapper,
  ) {}

  async createStrategy(
    request: CreateStrategyRequest,
  ): Promise<CreateStrategyResponse> {
    const existing = await this.repository.findStrategyByName(request.name);

    if (existing) {
      throw new RpcException({
        message: `Strategy with name '${request.name}' already exists`,
        code: GrpcStatusCode.ALREADY_EXISTS,
        appCode: AppResponseCode.STRATEGY_ALREADY_EXISTS,
      });
    }

    const strategy = await this.repository.createStrategy({
      name: request.name,
      description: request.description,
      allowedSides: request.allowedSides,
      minIntervalSecs: request.minIntervalSecs,
      activeTimeStart: request.activeTimeStart,
      activeTimeEnd: request.activeTimeEnd,
    });

    return { strategy: this.mapper.mapStrategy(strategy) };
  }
}
