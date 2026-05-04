import { Signal } from '@trading-bot/common/proto';

import { ExecutionOrderStatus, Prisma } from '../../prisma/generated/client';
import { PrismaDecimal } from '../../prisma/prisma-decimal';

export interface SimulatedOrder {
  id: string;
  approvalEventId: string;
  candidateIdempotencyKey: string;
  sourceEventId: string;
  portfolioId: string;
  instrumentId: string;
  signalId: string;
  side: number;
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

export const isUniqueConstraintViolation = (
  error: unknown,
  target?: string,
): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2002') {
    return false;
  }

  if (!target) {
    return true;
  }

  const targetFields = Array.isArray(error.meta?.['target'])
    ? error.meta?.['target'].map(String)
    : [];

  return targetFields.includes(target);
};
