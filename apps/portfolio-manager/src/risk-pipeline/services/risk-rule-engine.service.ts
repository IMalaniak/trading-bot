import { Injectable } from '@nestjs/common';

import {
  RiskDecisionReasonCode,
  RiskDecisionStatus,
} from '../../prisma/generated/enums';
import {
  PortfolioRiskConfig,
  RiskEvaluationResult,
  SizedTrade,
} from '../types/risk-types';

interface EvaluateRiskInput {
  config: PortfolioRiskConfig;
  trade: SizedTrade;
  activeInstrumentReservedNotional: SizedTrade['requestedNotional'];
  activePortfolioReservedNotional: SizedTrade['requestedNotional'];
}

@Injectable()
export class RiskRuleEngine {
  evaluate(input: EvaluateRiskInput): RiskEvaluationResult {
    const {
      config,
      trade,
      activeInstrumentReservedNotional,
      activePortfolioReservedNotional,
    } = input;

    if (!config.enabled) {
      return {
        ...trade,
        decision: RiskDecisionStatus.REJECTED,
        reasonCodes: [RiskDecisionReasonCode.SUBSCRIPTION_DISABLED],
      };
    }

    if (trade.requestedNotional.gt(config.maxTradeNotional)) {
      return {
        ...trade,
        decision: RiskDecisionStatus.REJECTED,
        reasonCodes: [RiskDecisionReasonCode.TRADE_CAP_EXCEEDED],
      };
    }

    if (
      activeInstrumentReservedNotional
        .plus(trade.requestedNotional)
        .gt(config.maxPositionNotional)
    ) {
      return {
        ...trade,
        decision: RiskDecisionStatus.REJECTED,
        reasonCodes: [RiskDecisionReasonCode.INSTRUMENT_EXPOSURE_CAP_EXCEEDED],
      };
    }

    if (
      activePortfolioReservedNotional
        .plus(trade.requestedNotional)
        .gt(config.portfolioExposureCapNotional)
    ) {
      return {
        ...trade,
        decision: RiskDecisionStatus.REJECTED,
        reasonCodes: [RiskDecisionReasonCode.PORTFOLIO_EXPOSURE_CAP_EXCEEDED],
      };
    }

    return {
      ...trade,
      decision: RiskDecisionStatus.APPROVED,
      reasonCodes: [],
    };
  }
}
