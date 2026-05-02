import { Injectable } from '@nestjs/common';
import { Signal } from '@trading-bot/common/proto';

import { EventDispatcherService } from '../../event-dispatcher/event-dispatcher.service';
import { Prisma, SignalReceiptStatus } from '../../prisma/generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PortfolioSignalCandidateEventFactory } from '../events/portfolio-signal-candidate-event.factory';
import { CandidateRepository } from '../repositories/candidate.repository';
import { RiskConfigRepository } from '../repositories/risk-config.repository';
import { SignalReceiptRepository } from '../repositories/signal-receipt.repository';
import { SourceSignalContext } from '../types/risk-types';

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
export class InstrumentStageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riskConfigRepository: RiskConfigRepository,
    private readonly signalReceiptRepository: SignalReceiptRepository,
    private readonly candidateRepository: CandidateRepository,
    private readonly portfolioSignalCandidateEventFactory: PortfolioSignalCandidateEventFactory,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  async handleSignal(context: SourceSignalContext): Promise<void> {
    const existingReceipt =
      await this.signalReceiptRepository.findBySourceEventId(
        context.sourceEventId,
      );

    if (existingReceipt) {
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const instrumentExists =
          await this.riskConfigRepository.instrumentExists(
            context.signal.instrumentId,
            tx,
          );

        if (!instrumentExists) {
          await this.signalReceiptRepository.create(
            {
              sourceEventId: context.sourceEventId,
              signalId: context.signal.id,
              instrumentId: context.signal.instrumentId,
              kafkaKey: context.kafkaKey,
              receivedAt: context.receivedAt,
              status: SignalReceiptStatus.UNKNOWN_INSTRUMENT,
              eligiblePortfolioCount: 0,
            },
            tx,
          );
          return;
        }

        const eligibleConfigs =
          await this.riskConfigRepository.findConfigsByInstrumentId(
            context.signal.instrumentId,
            tx,
          );

        const receipt = await this.signalReceiptRepository.create(
          {
            sourceEventId: context.sourceEventId,
            signalId: context.signal.id,
            instrumentId: context.signal.instrumentId,
            kafkaKey: context.kafkaKey,
            receivedAt: context.receivedAt,
            status:
              eligibleConfigs.length > 0
                ? SignalReceiptStatus.FANNED_OUT
                : SignalReceiptStatus.NO_ELIGIBLE_PORTFOLIOS,
            eligiblePortfolioCount: eligibleConfigs.length,
          },
          tx,
        );

        if (eligibleConfigs.length === 0) {
          return;
        }

        for (const config of eligibleConfigs) {
          const candidate = await this.candidateRepository.create(
            {
              signalReceiptId: receipt.id,
              sourceEventId: context.sourceEventId,
              portfolioId: config.portfolioId,
              targetNotionalSnapshot: config.targetNotional,
              signal: Signal.fromPartial(context.signal),
              receivedAt: context.receivedAt,
            },
            tx,
          );

          const event = this.portfolioSignalCandidateEventFactory.create(
            candidate,
            context.signal,
          );

          await this.eventDispatcher.enqueueEvent(
            tx,
            event.topic,
            event.message,
          );
        }
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'sourceEventId')) {
        return;
      }

      throw error;
    }
  }
}
