import { Injectable } from '@nestjs/common';
import { TradeDecision, TradeDecisionKind } from '@trading-bot/common/proto';
import { createHash } from 'crypto';

import { ExecutionOrderStatus } from '../../prisma/generated/client';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { SimulatedOrderLifecycle } from '../types/execution-lifecycle';

const ORDER_ID_HASH_LENGTH = 32;
const PLACED_OFFSET_MS = 1000;
const PARTIAL_FILL_OFFSET_MS = 2000;
const FINAL_FILL_OFFSET_MS = 3000;

const addMs = (date: Date, ms: number): Date => new Date(date.getTime() + ms);

export const deriveOrderId = (candidateIdempotencyKey: string): string =>
  `ord_${createHash('sha256')
    .update(candidateIdempotencyKey)
    .digest('hex')
    .slice(0, ORDER_ID_HASH_LENGTH)}`;

const parseApprovedAt = (decidedAt: string): Date => {
  const approvedAt = new Date(decidedAt);

  if (Number.isNaN(approvedAt.getTime())) {
    throw new Error(`Invalid trade decision decided_at '${decidedAt}'`);
  }

  return approvedAt;
};

@Injectable()
export class ExecutionSimulatorService {
  simulate(
    approvalEventId: string,
    decision: TradeDecision,
  ): SimulatedOrderLifecycle {
    if (decision.decision !== TradeDecisionKind.APPROVED) {
      throw new Error('Execution simulator only accepts approved trades');
    }

    if (!decision.signal) {
      throw new Error('Approved trade is missing signal payload');
    }

    if (!decision.candidateIdempotencyKey) {
      throw new Error('Approved trade is missing candidate idempotency key');
    }

    if (!decision.portfolioId) {
      throw new Error('Approved trade is missing portfolio id');
    }

    const orderId = deriveOrderId(decision.candidateIdempotencyKey);
    const approvedAt = parseApprovedAt(decision.decidedAt);
    const requestedNotional = toPrismaDecimal(decision.requestedNotional);
    const requestedQuantity = toPrismaDecimal(decision.requestedQuantity);
    const referencePrice = toPrismaDecimal(decision.referencePrice);
    const firstFillNotional = requestedNotional.div(2);
    const firstFillQuantity = requestedQuantity.div(2);
    const finalFillNotional = requestedNotional.minus(firstFillNotional);
    const finalFillQuantity = requestedQuantity.minus(firstFillQuantity);

    return {
      order: {
        id: orderId,
        approvalEventId,
        candidateIdempotencyKey: decision.candidateIdempotencyKey,
        sourceEventId: decision.sourceEventId,
        portfolioId: decision.portfolioId,
        instrumentId: decision.signal.instrumentId,
        signalId: decision.signal.id,
        side: decision.signal.side,
        requestedNotional,
        requestedQuantity,
        referencePrice,
        status: ExecutionOrderStatus.FILLED,
        approvedAt,
        placedAt: addMs(approvedAt, PLACED_OFFSET_MS),
        signal: decision.signal,
      },
      fills: [
        {
          id: `${orderId}:fill:1`,
          orderId,
          portfolioId: decision.portfolioId,
          instrumentId: decision.signal.instrumentId,
          sequence: 1,
          fillNotional: firstFillNotional,
          fillQuantity: firstFillQuantity,
          fillPrice: referencePrice,
          cumulativeFilledNotional: firstFillNotional,
          cumulativeFilledQuantity: firstFillQuantity,
          orderStatus: ExecutionOrderStatus.PARTIALLY_FILLED,
          filledAt: addMs(approvedAt, PARTIAL_FILL_OFFSET_MS),
        },
        {
          id: `${orderId}:fill:2`,
          orderId,
          portfolioId: decision.portfolioId,
          instrumentId: decision.signal.instrumentId,
          sequence: 2,
          fillNotional: finalFillNotional,
          fillQuantity: finalFillQuantity,
          fillPrice: referencePrice,
          cumulativeFilledNotional: requestedNotional,
          cumulativeFilledQuantity: requestedQuantity,
          orderStatus: ExecutionOrderStatus.FILLED,
          filledAt: addMs(approvedAt, FINAL_FILL_OFFSET_MS),
        },
      ],
    };
  }
}
