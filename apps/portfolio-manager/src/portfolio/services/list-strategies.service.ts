import { Injectable } from '@nestjs/common';
import type { ListStrategiesResponse } from '@trading-bot/common/proto';

import { PortfolioReadMapper } from '../mapper/portfolio-read.mapper';
import { PortfolioWriteRepository } from '../repositories/portfolio-write.repository';

@Injectable()
export class ListStrategiesService {
  constructor(
    private readonly repository: PortfolioWriteRepository,
    private readonly mapper: PortfolioReadMapper,
  ) {}

  async listStrategies(): Promise<ListStrategiesResponse> {
    const strategies = await this.repository.listStrategies();
    return { strategies: strategies.map((s) => this.mapper.mapStrategy(s)) };
  }
}
