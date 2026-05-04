import { Signal, SignalSide } from '@trading-bot/common/proto';

import { ExecutionOrderStatus } from '../../prisma/generated/client';
import { PrismaDecimal } from '../../prisma/prisma-decimal';

export interface SimulatedOrder {
  id: string;
  approvalEventId: string;
  candidateIdempotencyKey: string;
  sourceEventId: string;
  portfolioId: string;
  instrumentId: string;
  signalId: string;
  side: SignalSide;
  requestedNotional: PrismaDecimal;
  requestedQuantity: PrismaDecimal;
  referencePrice: PrismaDecimal;
  status: ExecutionOrderStatus;
  approvedAt: Date;
  placedAt: Date;
  signal: Signal;
}

export interface SimulatedFill {
  id: string;
  orderId: string;
  portfolioId: string;
  instrumentId: string;
  sequence: number;
  fillNotional: PrismaDecimal;
  fillQuantity: PrismaDecimal;
  fillPrice: PrismaDecimal;
  cumulativeFilledNotional: PrismaDecimal;
  cumulativeFilledQuantity: PrismaDecimal;
  orderStatus: ExecutionOrderStatus;
  filledAt: Date;
}

export interface SimulatedOrderLifecycle {
  order: SimulatedOrder;
  fills: [SimulatedFill, SimulatedFill];
}
