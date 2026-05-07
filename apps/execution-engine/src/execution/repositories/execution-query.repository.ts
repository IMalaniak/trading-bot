import { Injectable } from '@nestjs/common';

import {
  ExecutionFillModel,
  ExecutionOrderModel,
} from '../../prisma/generated/models';
import { PrismaService } from '../../prisma/prisma.service';

export interface ExecutionOrderReadModel extends ExecutionOrderModel {
  fills: ExecutionFillModel[];
}

@Injectable()
export class ExecutionQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPortfolioOrders(
    portfolioId: string,
    limit: number,
  ): Promise<ExecutionOrderReadModel[]> {
    return await this.prisma.executionOrder.findMany({
      where: { portfolioId },
      include: {
        fills: {
          orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }
}
