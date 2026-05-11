import {
  OrderFill,
  OrderStatus,
  Signal,
  SignalSide,
} from '@trading-bot/common/proto';

import type {
  ExecutionFillDto,
  ExecutionOrderDto,
  OrderStatusName,
  SignalSideName,
} from './api-client';

export const signalSideNameToProto = (side: SignalSideName): SignalSide => {
  switch (side) {
    case 'BUY':
      return SignalSide.BUY;
    case 'SELL':
      return SignalSide.SELL;
    case 'SIGNAL_SIDE_UNSPECIFIED':
      return SignalSide.SIGNAL_SIDE_UNSPECIFIED;
    default:
      return SignalSide.UNRECOGNIZED;
  }
};

export const orderStatusNameToProto = (
  status: OrderStatusName,
): OrderStatus => {
  switch (status) {
    case 'PLACED':
      return OrderStatus.PLACED;
    case 'PARTIALLY_FILLED':
      return OrderStatus.PARTIALLY_FILLED;
    case 'FILLED':
      return OrderStatus.FILLED;
    case 'ORDER_STATUS_UNSPECIFIED':
      return OrderStatus.ORDER_STATUS_UNSPECIFIED;
    default:
      return OrderStatus.UNRECOGNIZED;
  }
};

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
    orderStatus: orderStatusNameToProto(fill.orderStatus),
    portfolioId: order.portfolioId,
    sequence: fill.sequence,
    signal: Signal.fromPartial({
      id: order.signalId,
      instrumentId: order.instrumentId,
      price: Number.parseFloat(order.referencePrice),
      side: signalSideNameToProto(order.side),
      timestamp: Date.parse(order.approvedAt),
    }),
    sourceEventId: order.sourceEventId,
  });
