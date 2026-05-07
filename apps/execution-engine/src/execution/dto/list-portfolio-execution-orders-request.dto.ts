import type { ListPortfolioExecutionOrdersRequest } from '@trading-bot/common/proto';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const DEFAULT_PORTFOLIO_EXECUTION_ORDERS_LIMIT = 20;
export const MAX_PORTFOLIO_EXECUTION_ORDERS_LIMIT = 100;

export class ListPortfolioExecutionOrdersRequestDto implements ListPortfolioExecutionOrdersRequest {
  @IsString()
  @IsNotEmpty()
  portfolioId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PORTFOLIO_EXECUTION_ORDERS_LIMIT)
  limit = 0;

  get normalizedLimit(): number {
    return this.limit > 0
      ? this.limit
      : DEFAULT_PORTFOLIO_EXECUTION_ORDERS_LIMIT;
  }
}
