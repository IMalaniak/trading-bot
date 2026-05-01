import { Signal, SignalSide } from '@trading-bot/common/proto';

import {
  RiskDecisionReasonCode,
  RiskDecisionStatus,
  SignalReceiptStatus,
} from '../../prisma/generated/enums';
import { PrismaDecimal } from '../../prisma/prisma-decimal';

export interface SourceSignalContext {
  sourceEventId: string;
  kafkaKey: string;
  receivedAt: Date;
  signal: Signal;
}

export interface PortfolioRiskConfig {
  portfolioId: string;
  instrumentId: string;
  targetNotional: PrismaDecimal;
  maxTradeNotional: PrismaDecimal;
  maxPositionNotional: PrismaDecimal;
  portfolioExposureCapNotional: PrismaDecimal;
  enabled: boolean;
}

export interface SignalReceiptRecord {
  id: string;
  sourceEventId: string;
  status: SignalReceiptStatus;
  eligiblePortfolioCount: number;
}

export interface CandidateRecord {
  id: string;
  candidateIdempotencyKey: string;
  sourceEventId: string;
  portfolioId: string;
  instrumentId: string;
  signalId: string;
  side: SignalSide;
  referencePrice: PrismaDecimal;
  targetNotionalSnapshot: PrismaDecimal;
  signalTimestamp: Date;
  receivedAt: Date;
}

export interface SizedTrade {
  requestedNotional: PrismaDecimal;
  requestedQuantity: PrismaDecimal;
  referencePrice: PrismaDecimal;
}

export interface RiskEvaluationResult extends SizedTrade {
  decision: RiskDecisionStatus;
  reasonCodes: RiskDecisionReasonCode[];
}
