import { Injectable } from '@nestjs/common';
import { ListPortfolioExecutionOrdersResponse } from '@trading-bot/common/proto';

import { ExecutionReadMapper } from '../mapper/execution-read.mapper';
import { ExecutionQueryRepository } from '../repositories/execution-query.repository';

@Injectable()
export class ExecutionQueryService {
  constructor(
    private readonly repository: ExecutionQueryRepository,
    private readonly mapper: ExecutionReadMapper,
  ) {}

  async listPortfolioExecutionOrders(
    portfolioId: string,
    limit: number,
  ): Promise<ListPortfolioExecutionOrdersResponse> {
    const orders = await this.repository.listPortfolioOrders(
      portfolioId,
      limit,
    );

    return this.mapper.mapOrders(orders);
  }
}
