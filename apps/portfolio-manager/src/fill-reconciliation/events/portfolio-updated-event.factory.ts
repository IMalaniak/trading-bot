import { Injectable } from '@nestjs/common';
import type { OutboxMessageInput } from '@trading-bot/common';
import {
  buildEventMetadataHeaders,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
  portfolioKey,
} from '@trading-bot/common';
import { PortfolioUpdated } from '@trading-bot/common/proto';

import { PortfolioSummarySnapshotRecord } from '../types/fill-reconciliation-types';

interface PortfolioUpdatedEvent {
  topic: typeof KAFKA_TOPICS.PORTFOLIO_UPDATED;
  message: OutboxMessageInput;
}

@Injectable()
export class PortfolioUpdatedEventFactory {
  create(snapshot: PortfolioSummarySnapshotRecord): PortfolioUpdatedEvent {
    const eventId = `${snapshot.sourceFillId}:portfolio-updated`;
    const occurredAt = snapshot.updatedAt.toISOString();
    const payload = PortfolioUpdated.fromPartial({
      portfolioId: snapshot.portfolioId,
      sourceFillId: snapshot.sourceFillId,
      orderId: snapshot.orderId,
      instrumentId: snapshot.instrumentId,
      aggregateExposureNotional: snapshot.aggregateExposureNotional.toString(),
      openPositionCount: snapshot.openPositionCount,
      changedPositionQuantity: snapshot.changedPositionQuantity.toString(),
      changedPositionAverageEntryPrice:
        snapshot.changedPositionAverageEntryPrice.toString(),
      changedPositionExposureNotional:
        snapshot.changedPositionExposureNotional.toString(),
      updatedAt: occurredAt,
    });

    return {
      topic: KAFKA_TOPICS.PORTFOLIO_UPDATED,
      message: {
        eventId,
        key: portfolioKey(snapshot.portfolioId),
        value: PortfolioUpdated.encode(payload).finish(),
        headers: buildEventMetadataHeaders({
          eventId,
          eventType: KAFKA_TOPICS.PORTFOLIO_UPDATED,
          schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.PORTFOLIO_UPDATED,
          occurredAt,
          producer: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
        }),
      },
    };
  }
}
