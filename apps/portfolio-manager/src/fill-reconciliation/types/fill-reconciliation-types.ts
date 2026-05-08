import { KafkaEventContext } from '@trading-bot/common';
import { OrderFill, SignalSide } from '@trading-bot/common/proto';

import { PortfolioOrderStatus } from '../../prisma/generated/enums';
import { PrismaDecimal } from '../../prisma/prisma-decimal';

export interface SourceFillContext {
  kafkaEventId: string;
  kafkaKey: string;
  receivedAt: Date;
  fill: OrderFill;
  eventContext?: KafkaEventContext;
}

export interface NormalizedOrderFill {
  id: string;
  kafkaEventId: string;
  orderId: string;
  approvalEventId: string;
  sourceEventId: string;
  candidateIdempotencyKey: string;
  portfolioId: string;
  instrumentId: string;
  signalId: string;
  side: SignalSide;
  sequence: number;
  fillNotional: PrismaDecimal;
  fillQuantity: PrismaDecimal;
  fillPrice: PrismaDecimal;
  cumulativeFilledNotional: PrismaDecimal;
  cumulativeFilledQuantity: PrismaDecimal;
  orderStatus: PortfolioOrderStatus;
  filledAt: Date;
  receivedAt: Date;
}

export interface PositionAccountingFill {
  id: string;
  side: SignalSide;
  sequence: number;
  fillQuantity: PrismaDecimal;
  fillPrice: PrismaDecimal;
  filledAt: Date;
}

export interface PositionState {
  quantity: PrismaDecimal;
  averageEntryPrice: PrismaDecimal;
  exposureNotional: PrismaDecimal;
}

export interface PortfolioSummarySnapshotRecord {
  id: string;
  portfolioId: string;
  sourceFillId: string;
  orderId: string;
  instrumentId: string;
  aggregateExposureNotional: PrismaDecimal;
  openPositionCount: number;
  changedPositionQuantity: PrismaDecimal;
  changedPositionAverageEntryPrice: PrismaDecimal;
  changedPositionExposureNotional: PrismaDecimal;
  updatedAt: Date;
}
