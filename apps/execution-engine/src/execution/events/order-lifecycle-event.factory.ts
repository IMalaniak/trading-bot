import { Injectable } from '@nestjs/common';
import type { OutboxMessageInput } from '@trading-bot/common';
import {
  buildEventMetadataHeaders,
  childKafkaEventContext,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
  type KafkaEventContext,
  portfolioKey,
} from '@trading-bot/common';
import { OrderFill, OrderPlaced, OrderStatus } from '@trading-bot/common/proto';

import { ExecutionOrderStatus } from '../../prisma/generated/client';
import {
  SimulatedFill,
  SimulatedOrder,
  SimulatedOrderLifecycle,
} from '../types/execution-lifecycle';

export interface LifecycleEvent {
  topic: typeof KAFKA_TOPICS.ORDERS_PLACED | typeof KAFKA_TOPICS.ORDERS_FILLS;
  lifecycleSequence: number;
  message: OutboxMessageInput;
}

const toOrderStatus = (status: ExecutionOrderStatus): OrderStatus => {
  switch (status) {
    case ExecutionOrderStatus.PLACED:
      return OrderStatus.PLACED;
    case ExecutionOrderStatus.PARTIALLY_FILLED:
      return OrderStatus.PARTIALLY_FILLED;
    case ExecutionOrderStatus.FILLED:
      return OrderStatus.FILLED;
    default: {
      const unreachable: never = status;
      throw new Error(`Unhandled ExecutionOrderStatus: ${String(unreachable)}`);
    }
  }
};

const createPlacedPayload = (order: SimulatedOrder): OrderPlaced =>
  OrderPlaced.fromPartial({
    orderId: order.id,
    approvalEventId: order.approvalEventId,
    sourceEventId: order.sourceEventId,
    candidateIdempotencyKey: order.candidateIdempotencyKey,
    portfolioId: order.portfolioId,
    signal: order.signal,
    requestedNotional: order.requestedNotional.toString(),
    requestedQuantity: order.requestedQuantity.toString(),
    referencePrice: order.referencePrice.toString(),
    status: OrderStatus.PLACED,
    placedAt: order.placedAt.toISOString(),
  });

const createFillPayload = (
  order: SimulatedOrder,
  fill: SimulatedFill,
): OrderFill =>
  OrderFill.fromPartial({
    fillId: fill.id,
    orderId: order.id,
    approvalEventId: order.approvalEventId,
    sourceEventId: order.sourceEventId,
    candidateIdempotencyKey: order.candidateIdempotencyKey,
    portfolioId: order.portfolioId,
    signal: order.signal,
    sequence: fill.sequence,
    fillNotional: fill.fillNotional.toString(),
    fillQuantity: fill.fillQuantity.toString(),
    fillPrice: fill.fillPrice.toString(),
    cumulativeFilledNotional: fill.cumulativeFilledNotional.toString(),
    cumulativeFilledQuantity: fill.cumulativeFilledQuantity.toString(),
    orderStatus: toOrderStatus(fill.orderStatus),
    filledAt: fill.filledAt.toISOString(),
  });

@Injectable()
export class OrderLifecycleEventFactory {
  create(
    lifecycle: SimulatedOrderLifecycle,
    parentContext?: KafkaEventContext,
  ): LifecycleEvent[] {
    const placedEventId = `${lifecycle.order.id}:placed`;
    const placedAt = lifecycle.order.placedAt.toISOString();
    const key = portfolioKey(lifecycle.order.portfolioId);
    const placedPayload = createPlacedPayload(lifecycle.order);
    const placedContext = childKafkaEventContext(parentContext, placedEventId);

    return [
      {
        topic: KAFKA_TOPICS.ORDERS_PLACED,
        lifecycleSequence: 1,
        message: {
          eventId: placedEventId,
          key,
          value: OrderPlaced.encode(placedPayload).finish(),
          headers: buildEventMetadataHeaders({
            eventId: placedEventId,
            eventType: KAFKA_TOPICS.ORDERS_PLACED,
            schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.ORDERS_PLACED,
            occurredAt: placedAt,
            producer: KAFKA_EVENT_PRODUCERS.EXECUTION_ENGINE,
            correlationId: placedContext.correlationId,
            causationId: placedContext.causationId,
            traceparent: placedContext.traceparent,
          }),
        },
      },
      ...lifecycle.fills.map((fill) => {
        const eventId = fill.id;
        const filledAt = fill.filledAt.toISOString();
        const fillPayload = createFillPayload(lifecycle.order, fill);
        const fillContext = childKafkaEventContext(parentContext, eventId);

        return {
          topic: KAFKA_TOPICS.ORDERS_FILLS,
          lifecycleSequence: fill.sequence + 1,
          message: {
            eventId,
            key,
            value: OrderFill.encode(fillPayload).finish(),
            headers: buildEventMetadataHeaders({
              eventId,
              eventType: KAFKA_TOPICS.ORDERS_FILLS,
              schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.ORDERS_FILLS,
              occurredAt: filledAt,
              producer: KAFKA_EVENT_PRODUCERS.EXECUTION_ENGINE,
              correlationId: fillContext.correlationId,
              causationId: fillContext.causationId,
              traceparent: fillContext.traceparent,
            }),
          },
        };
      }),
    ];
  }
}
