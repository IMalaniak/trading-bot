import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type { ListPortfolioExecutionOrdersResponse } from '@trading-bot/common/proto';

import { ListPortfolioExecutionOrdersRequestDto } from './dto/list-portfolio-execution-orders-request.dto';
import { ExecutionQueryService } from './services/execution-query.service';

@Controller()
export class ExecutionReadController {
  constructor(private readonly executionQueryService: ExecutionQueryService) {}

  @GrpcMethod('ExecutionEngine', 'ListPortfolioExecutionOrders')
  async listPortfolioExecutionOrders(
    data: ListPortfolioExecutionOrdersRequestDto,
  ): Promise<ListPortfolioExecutionOrdersResponse> {
    return await this.executionQueryService.listPortfolioExecutionOrders(
      data.portfolioId,
      data.normalizedLimit,
    );
  }
}
