import { Injectable } from '@nestjs/common';

import {
  RiskDecisionReasonCode,
  RiskDecisionStatus,
} from '../../prisma/generated/enums';
import {
  CandidateRecord,
  RiskEvaluationResult,
  SizedTrade,
} from '../types/risk-types';

export interface PortfolioStrategyConfig {
  allowedSides: number[];
  minIntervalSecs?: number | null;
  activeTimeStart?: string | null;
  activeTimeEnd?: string | null;
}

interface FilterInput {
  candidate: CandidateRecord;
  strategy: PortfolioStrategyConfig | null;
  trade: SizedTrade;
  lastApprovedAt?: Date | null;
}

@Injectable()
export class StrategyFilterService {
  evaluate(input: FilterInput): RiskEvaluationResult | null {
    const { candidate, strategy, trade } = input;

    if (!strategy) {
      return null;
    }

    if (
      strategy.allowedSides.length > 0 &&
      !strategy.allowedSides.includes(candidate.side)
    ) {
      return {
        ...trade,
        decision: RiskDecisionStatus.REJECTED,
        reasonCodes: [RiskDecisionReasonCode.STRATEGY_SIDE_FILTER],
      };
    }

    if (strategy.activeTimeStart && strategy.activeTimeEnd) {
      const signalTime = this.toTimeString(candidate.signalTimestamp);
      if (
        !this.isWithinTimeWindow(
          signalTime,
          strategy.activeTimeStart,
          strategy.activeTimeEnd,
        )
      ) {
        return {
          ...trade,
          decision: RiskDecisionStatus.REJECTED,
          reasonCodes: [RiskDecisionReasonCode.STRATEGY_TIME_FILTER],
        };
      }
    }

    if (strategy.minIntervalSecs && strategy.minIntervalSecs > 0) {
      const { lastApprovedAt } = input;
      if (lastApprovedAt) {
        const elapsedMs =
          candidate.receivedAt.getTime() - lastApprovedAt.getTime();
        const elapsedSecs = elapsedMs / 1000;
        if (elapsedSecs < strategy.minIntervalSecs) {
          return {
            ...trade,
            decision: RiskDecisionStatus.REJECTED,
            reasonCodes: [RiskDecisionReasonCode.STRATEGY_COOLDOWN_FILTER],
          };
        }
      }
    }

    return null;
  }

  private toTimeString(date: Date): string {
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private isWithinTimeWindow(
    time: string,
    start: string,
    end: string,
  ): boolean {
    if (start <= end) {
      return time >= start && time <= end;
    }
    // overnight window
    return time >= start || time <= end;
  }
}
