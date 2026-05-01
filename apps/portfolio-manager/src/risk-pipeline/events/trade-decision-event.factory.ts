import { Injectable } from '@nestjs/common';
import {
  buildEventMetadataHeaders,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
  portfolioKey,
} from '@trading-bot/common';
import {
  Signal,
  TradeDecision,
  TradeDecisionKind,
  TradeDecisionReason,
} from '@trading-bot/common/proto';
import { randomUUID } from 'crypto';

import { OutboxMessageInput } from '../../event-dispatcher/types/outbox-message';
import {
  RiskDecisionReasonCode,
  RiskDecisionStatus,
} from '../../prisma/generated/enums';
import { RiskDecisionRecord } from '../repositories/decision.repository';
import { CandidateRecord } from '../types/risk-types';

interface TradeDecisionEvent {
  topic:
    | typeof KAFKA_TOPICS.TRADES_APPROVED
    | typeof KAFKA_TOPICS.TRADES_REJECTED;
  message: OutboxMessageInput;
}

const toTradeDecisionKind = (
  decision: RiskDecisionStatus,
): TradeDecisionKind =>
  decision === RiskDecisionStatus.APPROVED
    ? TradeDecisionKind.APPROVED
    : TradeDecisionKind.REJECTED;

const toTradeDecisionReason = (
  reasonCode: RiskDecisionReasonCode,
): TradeDecisionReason => {
  switch (reasonCode) {
    case RiskDecisionReasonCode.SUBSCRIPTION_DISABLED:
      return TradeDecisionReason.SUBSCRIPTION_DISABLED;
    case RiskDecisionReasonCode.TRADE_CAP_EXCEEDED:
      return TradeDecisionReason.TRADE_CAP_EXCEEDED;
    case RiskDecisionReasonCode.INSTRUMENT_EXPOSURE_CAP_EXCEEDED:
      return TradeDecisionReason.INSTRUMENT_EXPOSURE_CAP_EXCEEDED;
    case RiskDecisionReasonCode.PORTFOLIO_EXPOSURE_CAP_EXCEEDED:
      return TradeDecisionReason.PORTFOLIO_EXPOSURE_CAP_EXCEEDED;
  }

  return TradeDecisionReason.TRADE_DECISION_REASON_UNSPECIFIED;
};

const toSignal = (candidate: CandidateRecord): Signal =>
  Signal.fromPartial({
    id: candidate.signalId,
    instrumentId: candidate.instrumentId,
    side: candidate.side,
    price: candidate.referencePrice.toNumber(),
    timestamp: candidate.signalTimestamp.getTime(),
  });

@Injectable()
export class TradeDecisionEventFactory {
  create(
    candidate: CandidateRecord,
    decisionRecord: RiskDecisionRecord,
  ): TradeDecisionEvent {
    const eventId = randomUUID();
    const occurredAt = decisionRecord.decidedAt.toISOString();
    const topic =
      decisionRecord.decision === RiskDecisionStatus.APPROVED
        ? KAFKA_TOPICS.TRADES_APPROVED
        : KAFKA_TOPICS.TRADES_REJECTED;
    const payload = TradeDecision.fromPartial({
      signal: toSignal(candidate),
      sourceEventId: decisionRecord.sourceEventId,
      portfolioId: decisionRecord.portfolioId,
      candidateIdempotencyKey: decisionRecord.candidateIdempotencyKey,
      decision: toTradeDecisionKind(decisionRecord.decision),
      reasonCodes: decisionRecord.reasonCodes.map(toTradeDecisionReason),
      requestedNotional: decisionRecord.requestedNotional.toString(),
      requestedQuantity: decisionRecord.requestedQuantity.toString(),
      referencePrice: decisionRecord.referencePrice.toString(),
      decidedAt: occurredAt,
    });

    return {
      topic,
      message: {
        eventId,
        key: portfolioKey(decisionRecord.portfolioId),
        value: TradeDecision.encode(payload).finish(),
        headers: buildEventMetadataHeaders({
          eventId,
          eventType: topic,
          schemaVersion:
            topic === KAFKA_TOPICS.TRADES_APPROVED
              ? KAFKA_EVENT_SCHEMA_VERSIONS.TRADES_APPROVED
              : KAFKA_EVENT_SCHEMA_VERSIONS.TRADES_REJECTED,
          occurredAt,
          producer: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
        }),
      },
    };
  }
}
