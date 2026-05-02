import { Injectable } from '@nestjs/common';
import { KAFKA_TOPICS } from '@trading-bot/common';
import { PortfolioSignalCandidate } from '@trading-bot/common/proto';

import { EventDispatcherService } from '../../event-dispatcher/event-dispatcher.service';
import { Prisma, RiskDecisionStatus } from '../../prisma/generated/client';
import { RiskDecisionReasonCode } from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { TradeDecisionEventFactory } from '../events/trade-decision-event.factory';
import { CandidateRepository } from '../repositories/candidate.repository';
import { DecisionRepository } from '../repositories/decision.repository';
import { ReservationRepository } from '../repositories/reservation.repository';
import { RiskConfigRepository } from '../repositories/risk-config.repository';
import { RiskRuleEngine } from './risk-rule-engine.service';
import { TradeSizingService } from './trade-sizing.service';

const isUniqueConstraintViolation = (
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

@Injectable()
export class PortfolioStageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidateRepository: CandidateRepository,
    private readonly decisionRepository: DecisionRepository,
    private readonly reservationRepository: ReservationRepository,
    private readonly riskConfigRepository: RiskConfigRepository,
    private readonly tradeSizingService: TradeSizingService,
    private readonly riskRuleEngine: RiskRuleEngine,
    private readonly tradeDecisionEventFactory: TradeDecisionEventFactory,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  async handleCandidate(payload: PortfolioSignalCandidate): Promise<void> {
    const existingDecision =
      await this.decisionRepository.findByCandidateIdempotencyKey(
        payload.candidateIdempotencyKey,
      );

    if (existingDecision) {
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const candidate = await this.candidateRepository.findByIdempotencyKey(
          payload.candidateIdempotencyKey,
          tx,
        );

        if (!candidate) {
          throw new Error(
            `Candidate '${payload.candidateIdempotencyKey}' was not found`,
          );
        }

        const config = await this.riskConfigRepository.findConfig(
          candidate.portfolioId,
          candidate.instrumentId,
          tx,
        );

        const sizedTrade = this.tradeSizingService.sizeTrade(
          config?.targetNotional ?? candidate.targetNotionalSnapshot,
          candidate.referencePrice,
        );
        const activeInstrumentReservedNotional =
          await this.reservationRepository.sumActiveInstrumentReservedNotional(
            candidate.portfolioId,
            candidate.instrumentId,
            tx,
          );
        const activePortfolioReservedNotional =
          await this.reservationRepository.sumActivePortfolioReservedNotional(
            candidate.portfolioId,
            tx,
          );
        const evaluation = config
          ? this.riskRuleEngine.evaluate({
              config,
              trade: sizedTrade,
              activeInstrumentReservedNotional,
              activePortfolioReservedNotional,
            })
          : {
              ...sizedTrade,
              decision: RiskDecisionStatus.REJECTED,
              reasonCodes: [RiskDecisionReasonCode.SUBSCRIPTION_DISABLED],
            };
        const decisionRecord = await this.decisionRepository.create(
          {
            candidateRecordId: candidate.id,
            candidateIdempotencyKey: candidate.candidateIdempotencyKey,
            sourceEventId: candidate.sourceEventId,
            portfolioId: candidate.portfolioId,
            instrumentId: candidate.instrumentId,
            decision: evaluation.decision,
            reasonCodes: evaluation.reasonCodes,
            requestedNotional: evaluation.requestedNotional,
            requestedQuantity: evaluation.requestedQuantity,
            referencePrice: evaluation.referencePrice,
            emittedTopic:
              evaluation.decision === RiskDecisionStatus.APPROVED
                ? KAFKA_TOPICS.TRADES_APPROVED
                : KAFKA_TOPICS.TRADES_REJECTED,
            decidedAt: new Date(),
          },
          tx,
        );

        if (evaluation.decision === RiskDecisionStatus.APPROVED) {
          await this.reservationRepository.create(
            {
              riskDecisionId: decisionRecord.id,
              candidateIdempotencyKey: candidate.candidateIdempotencyKey,
              portfolioId: candidate.portfolioId,
              instrumentId: candidate.instrumentId,
              reservedNotional: evaluation.requestedNotional,
              reservedQuantity: evaluation.requestedQuantity,
            },
            tx,
          );
        }

        await this.candidateRepository.markDecided(candidate.id, tx);

        const event = this.tradeDecisionEventFactory.create(
          candidate,
          decisionRecord,
        );
        await this.eventDispatcher.enqueueEvent(tx, event.topic, event.message);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'candidateIdempotencyKey')) {
        return;
      }

      throw error;
    }
  }
}
