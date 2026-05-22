import {
  orderStatusNameToOrderStatus,
  signalSideNameToSignalSide,
} from '@trading-bot/common';
import { OrderFill, Signal } from '@trading-bot/common/proto';

import type { ExecutionFillDto, ExecutionOrderDto } from './api-client';

export const buildOrderFillReplay = (
  order: ExecutionOrderDto,
  fill: ExecutionFillDto,
): OrderFill =>
  OrderFill.fromPartial({
    approvalEventId: order.approvalEventId,
    candidateIdempotencyKey: order.candidateIdempotencyKey,
    cumulativeFilledNotional: fill.cumulativeFilledNotional,
    cumulativeFilledQuantity: fill.cumulativeFilledQuantity,
    fillId: fill.fillId,
    fillNotional: fill.fillNotional,
    fillPrice: fill.fillPrice,
    fillQuantity: fill.fillQuantity,
    filledAt: fill.filledAt,
    orderId: order.orderId,
    orderStatus: orderStatusNameToOrderStatus(fill.orderStatus),
    portfolioId: order.portfolioId,
    sequence: fill.sequence,
    signal: Signal.fromPartial({
      id: order.signalId,
      instrumentId: order.instrumentId,
      price: Number.parseFloat(order.referencePrice),
      side: signalSideNameToSignalSide(order.side),
      timestamp: Date.parse(order.approvedAt),
    }),
    sourceEventId: order.sourceEventId,
  });
