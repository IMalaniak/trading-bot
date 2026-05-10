import type { MockedFunction } from 'vitest';

import { ListPortfolioExecutionOrdersRequestDto } from './dto/list-portfolio-execution-orders-request.dto';
import { ExecutionReadController } from './execution-read.controller';
import { ExecutionQueryService } from './services/execution-query.service';

describe('ExecutionReadController', () => {
  let executionQueryService: {
    listPortfolioExecutionOrders: MockedFunction<
      ExecutionQueryService['listPortfolioExecutionOrders']
    >;
  };
  let controller: ExecutionReadController;

  beforeEach(() => {
    executionQueryService = {
      listPortfolioExecutionOrders: vi.fn().mockResolvedValue({ orders: [] }),
    };
    controller = new ExecutionReadController(
      executionQueryService as unknown as ExecutionQueryService,
    );
  });

  it('passes validated portfolio ids and normalized limits to the query service', async () => {
    const request = Object.assign(
      new ListPortfolioExecutionOrdersRequestDto(),
      {
        portfolioId: 'portfolio-alpha',
        limit: 0,
      },
    );

    await controller.listPortfolioExecutionOrders(request);

    expect(
      executionQueryService.listPortfolioExecutionOrders,
    ).toHaveBeenCalledWith('portfolio-alpha', 20);
  });
});
