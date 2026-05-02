import { Injectable } from '@nestjs/common';
import {
  buildEventMetadataHeaders,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
  portfolioKey,
} from '@trading-bot/common';
import { PortfolioSignalCandidate, Signal } from '@trading-bot/common/proto';
import { randomUUID } from 'crypto';

import { OutboxMessageInput } from '../../event-dispatcher/types/outbox-message';
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
  ): PortfolioSignalCandidateEvent {
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
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
        }),
      },
    };
  }
}
