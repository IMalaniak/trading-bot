import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  DEFAULT_PORTFOLIO_EXECUTION_ORDERS_LIMIT,
  ListPortfolioExecutionOrdersRequestDto,
  MAX_PORTFOLIO_EXECUTION_ORDERS_LIMIT,
} from './list-portfolio-execution-orders-request.dto';

describe('ListPortfolioExecutionOrdersRequestDto', () => {
  it('normalizes omitted proto3 limits to the default read limit', async () => {
    const dto = plainToInstance(ListPortfolioExecutionOrdersRequestDto, {
      portfolioId: 'portfolio-alpha',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.normalizedLimit).toBe(DEFAULT_PORTFOLIO_EXECUTION_ORDERS_LIMIT);
  });

  it('accepts explicit limits within the contract maximum', async () => {
    const dto = plainToInstance(ListPortfolioExecutionOrdersRequestDto, {
      portfolioId: 'portfolio-alpha',
      limit: MAX_PORTFOLIO_EXECUTION_ORDERS_LIMIT,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.normalizedLimit).toBe(MAX_PORTFOLIO_EXECUTION_ORDERS_LIMIT);
  });

  it('rejects missing portfolio ids and limits above the contract maximum', async () => {
    const dto = plainToInstance(ListPortfolioExecutionOrdersRequestDto, {
      portfolioId: '',
      limit: MAX_PORTFOLIO_EXECUTION_ORDERS_LIMIT + 1,
    });

    await expect(validate(dto)).resolves.toHaveLength(2);
  });
});
