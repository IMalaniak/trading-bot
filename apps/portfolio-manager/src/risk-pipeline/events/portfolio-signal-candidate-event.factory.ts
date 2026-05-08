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
import { PortfolioSignalCandidate, Signal } from '@trading-bot/common/proto';
import { randomUUID } from 'crypto';

import { CandidateRecord } from '../types/risk-types';

interface PortfolioSignalCandidateEvent {
  topic: typeof KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO;
  message: OutboxMessageInput;
}

@Injectable()
export class PortfolioSignalCandidateEventFactory {
  create(
    candidate: CandidateRecord,
    signal: Signal,
    parentContext?: KafkaEventContext,
  ): PortfolioSignalCandidateEvent {
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    const eventContext = childKafkaEventContext(parentContext, eventId);
    const payload = PortfolioSignalCandidate.fromPartial({
      signal,
      sourceEventId: candidate.sourceEventId,
      portfolioId: candidate.portfolioId,
      candidateIdempotencyKey: candidate.candidateIdempotencyKey,
      signalReceivedAt: candidate.receivedAt.toISOString(),
    });

    return {
      topic: KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO,
      message: {
        eventId,
        key: portfolioKey(candidate.portfolioId),
        value: PortfolioSignalCandidate.encode(payload).finish(),
        headers: buildEventMetadataHeaders({
          eventId,
          eventType: KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO,
          schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.TRADING_SIGNALS_PORTFOLIO,
          occurredAt,
          producer: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
          correlationId: eventContext.correlationId,
          causationId: eventContext.causationId,
          traceparent: eventContext.traceparent,
        }),
      },
    };
  }
}
