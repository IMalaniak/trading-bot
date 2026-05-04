import { Injectable } from '@nestjs/common';
import { TradeDecision } from '@trading-bot/common/proto';

import { EventDispatcherService } from '../../event-dispatcher/event-dispatcher.service';
import { Prisma } from '../../prisma/generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isUniqueConstraintViolation } from '../../prisma/prisma.utils';
import { OrderLifecycleEventFactory } from '../events/order-lifecycle-event.factory';
import { SimulatedOrderLifecycle } from '../types/execution-lifecycle';
import { ExecutionSimulatorService } from './execution-simulator.service';

@Injectable()
export class ExecutionOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly simulator: ExecutionSimulatorService,
    private readonly eventFactory: OrderLifecycleEventFactory,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  async handleApprovedTrade(
    approvalEventId: string,
    decision: TradeDecision,
  ): Promise<void> {
    const existingOrder = await this.prisma.executionOrder.findFirst({
      where: {
        OR: [
          { approvalEventId },
          { candidateIdempotencyKey: decision.candidateIdempotencyKey },
        ],
      },
    });

    if (existingOrder) {
      return;
    }

    const lifecycle = this.simulator.simulate(approvalEventId, decision);

    try {
      await this.prisma.$transaction(async (tx) => {
        const duplicate = await tx.executionOrder.findFirst({
          where: {
            OR: [
              { approvalEventId },
              {
                candidateIdempotencyKey:
                  lifecycle.order.candidateIdempotencyKey,
              },
            ],
          },
        });

        if (duplicate) {
          return;
        }

        await this.persistLifecycle(tx, lifecycle);

        for (const event of this.eventFactory.create(lifecycle)) {
          await this.eventDispatcher.enqueueEvent(
            tx,
            event.topic,
            event.lifecycleSequence,
            event.message,
          );
        }
      });
    } catch (error) {
      if (
        isUniqueConstraintViolation(error, 'approvalEventId') ||
        isUniqueConstraintViolation(error, 'candidateIdempotencyKey')
      ) {
        return;
      }

      throw error;
    }
  }

  private async persistLifecycle(
    tx: Prisma.TransactionClient,
    lifecycle: SimulatedOrderLifecycle,
  ): Promise<void> {
    await tx.executionOrder.create({
      data: {
        id: lifecycle.order.id,
        approvalEventId: lifecycle.order.approvalEventId,
        candidateIdempotencyKey: lifecycle.order.candidateIdempotencyKey,
        sourceEventId: lifecycle.order.sourceEventId,
        portfolioId: lifecycle.order.portfolioId,
        instrumentId: lifecycle.order.instrumentId,
        signalId: lifecycle.order.signalId,
        side: lifecycle.order.side,
        requestedNotional: lifecycle.order.requestedNotional,
        requestedQuantity: lifecycle.order.requestedQuantity,
        referencePrice: lifecycle.order.referencePrice,
        status: lifecycle.order.status,
        approvedAt: lifecycle.order.approvedAt,
        placedAt: lifecycle.order.placedAt,
      },
    });

    await tx.executionFill.createMany({
      data: lifecycle.fills.map((fill) => ({
        id: fill.id,
        orderId: fill.orderId,
        portfolioId: fill.portfolioId,
        instrumentId: fill.instrumentId,
        sequence: fill.sequence,
        fillNotional: fill.fillNotional,
        fillQuantity: fill.fillQuantity,
        fillPrice: fill.fillPrice,
        cumulativeFilledNotional: fill.cumulativeFilledNotional,
        cumulativeFilledQuantity: fill.cumulativeFilledQuantity,
        orderStatus: fill.orderStatus,
        filledAt: fill.filledAt,
      })),
    });
  }
}
