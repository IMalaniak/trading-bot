import { Injectable } from '@nestjs/common';
import {
  ExecutionOrder,
  ListPortfolioExecutionOrdersResponse,
  OrderStatus,
} from '@trading-bot/common/proto';

import { ExecutionOrderStatus } from '../../prisma/generated/enums';
import { prismaDecimalToString } from '../../prisma/prisma-decimal';
import { ExecutionOrderReadModel } from '../repositories/execution-query.repository';

const mapOrderStatus = (status: ExecutionOrderStatus): OrderStatus => {
  switch (status) {
    case ExecutionOrderStatus.PLACED:
      return OrderStatus.PLACED;
    case ExecutionOrderStatus.PARTIALLY_FILLED:
      return OrderStatus.PARTIALLY_FILLED;
    case ExecutionOrderStatus.FILLED:
      return OrderStatus.FILLED;
    default: {
      throw new Error(`Unhandled ExecutionOrderStatus: ${String(status)}`);
    }
  }
};

@Injectable()
export class ExecutionReadMapper {
  mapOrders(
    orders: readonly ExecutionOrderReadModel[],
  ): ListPortfolioExecutionOrdersResponse {
    return {
      orders: orders.map((order) => this.mapOrder(order)),
    };
  }

  private mapOrder(order: ExecutionOrderReadModel): ExecutionOrder {
    return {
      orderId: order.id,
      approvalEventId: order.approvalEventId,
      candidateIdempotencyKey: order.candidateIdempotencyKey,
      sourceEventId: order.sourceEventId,
      portfolioId: order.portfolioId,
      instrumentId: order.instrumentId,
      signalId: order.signalId,
      side: order.side,
      requestedNotional: prismaDecimalToString(order.requestedNotional),
      requestedQuantity: prismaDecimalToString(order.requestedQuantity),
      referencePrice: prismaDecimalToString(order.referencePrice),
      status: mapOrderStatus(order.status),
      approvedAt: order.approvedAt.toISOString(),
      placedAt: order.placedAt.toISOString(),
      lastActivityAt: order.lastActivityAt.toISOString(),
      fills: order.fills.map((fill) => ({
        fillId: fill.id,
        orderId: fill.orderId,
        portfolioId: fill.portfolioId,
        instrumentId: fill.instrumentId,
        sequence: fill.sequence,
        fillNotional: prismaDecimalToString(fill.fillNotional),
        fillQuantity: prismaDecimalToString(fill.fillQuantity),
        fillPrice: prismaDecimalToString(fill.fillPrice),
        cumulativeFilledNotional: prismaDecimalToString(
          fill.cumulativeFilledNotional,
        ),
        cumulativeFilledQuantity: prismaDecimalToString(
          fill.cumulativeFilledQuantity,
        ),
        orderStatus: mapOrderStatus(fill.orderStatus),
        filledAt: fill.filledAt.toISOString(),
      })),
    };
  }
}
