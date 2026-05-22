import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OrderStatusName,
  orderStatusToOrderStatusName,
  SignalSideName,
  signalSideToSignalSideName,
} from '@trading-bot/common';
import {
  ExecutionFill,
  ExecutionOrder,
  PortfolioInstrumentConfig,
  PortfolioSummary,
  Position,
} from '@trading-bot/common/proto';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { InstrumentDto } from './instrument.dto';

export const DEFAULT_RECENT_ORDER_LIMIT = 20;
export const MAX_RECENT_ORDER_LIMIT = 100;

export class GetPortfolioParamsDto {
  @ApiProperty({ example: 'portfolio-alpha' })
  @IsString()
  @IsNotEmpty()
  portfolioId: string;
}

export class GetPortfolioQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_RECENT_ORDER_LIMIT,
    maximum: MAX_RECENT_ORDER_LIMIT,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RECENT_ORDER_LIMIT)
  recentOrdersLimit: number = DEFAULT_RECENT_ORDER_LIMIT;
}

export class PortfolioSummaryDto implements PortfolioSummary {
  @ApiProperty({ example: 'portfolio-alpha' })
  portfolioId: string;

  @ApiProperty({ example: 'Alpha Portfolio' })
  name: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '1000' })
  exposureCapNotional: string;

  @ApiProperty({ example: '150.25' })
  aggregateExposureNotional: string;

  @ApiProperty({ example: 2 })
  openPositionCount: number;

  @ApiProperty({ example: '2026-03-25T12:00:05.000Z' })
  updatedAt: string;

  static fromGRPC(summary: PortfolioSummary): PortfolioSummaryDto {
    return { ...summary };
  }
}

export class ListPortfoliosResponseDto {
  @ApiProperty({ type: [PortfolioSummaryDto] })
  portfolios: PortfolioSummaryDto[];

  static fromGRPC(response: {
    portfolios: PortfolioSummary[];
  }): ListPortfoliosResponseDto {
    return {
      portfolios: response.portfolios.map((portfolio) =>
        PortfolioSummaryDto.fromGRPC(portfolio),
      ),
    };
  }
}

export class PortfolioInstrumentConfigDto implements Omit<
  PortfolioInstrumentConfig,
  'instrument'
> {
  @ApiProperty({ example: 'portfolio-alpha' })
  portfolioId: string;

  @ApiProperty({ type: InstrumentDto })
  instrument: InstrumentDto;

  @ApiProperty({ example: true })
  enabled: boolean;

  @ApiProperty({ example: '100' })
  targetNotional: string;

  @ApiProperty({ example: '150' })
  maxTradeNotional: string;

  @ApiProperty({ example: '400' })
  maxPositionNotional: string;

  @ApiProperty({ example: '2026-03-25T12:00:05.000Z' })
  updatedAt: string;

  static fromGRPC(
    config: PortfolioInstrumentConfig,
  ): PortfolioInstrumentConfigDto {
    if (!config.instrument) {
      throw new Error(
        `Portfolio instrument config for '${config.portfolioId}' is missing instrument details`,
      );
    }

    return {
      portfolioId: config.portfolioId,
      instrument: InstrumentDto.fromGRPC(config.instrument),
      enabled: config.enabled,
      targetNotional: config.targetNotional,
      maxTradeNotional: config.maxTradeNotional,
      maxPositionNotional: config.maxPositionNotional,
      updatedAt: config.updatedAt,
    };
  }
}

export class PortfolioPositionDto implements Omit<Position, 'instrument'> {
  @ApiProperty({ example: 'portfolio-alpha' })
  portfolioId: string;

  @ApiProperty({ type: InstrumentDto })
  instrument: InstrumentDto;

  @ApiProperty({ example: '0.5' })
  quantity: string;

  @ApiProperty({ example: '30000' })
  averageEntryPrice: string;

  @ApiProperty({ example: '15000' })
  exposureNotional: string;

  @ApiProperty({ example: 'ord_abc:fill:2' })
  lastFillId: string;

  @ApiProperty({ example: '2026-03-25T12:00:05.000Z' })
  updatedAt: string;

  static fromGRPC(position: Position): PortfolioPositionDto {
    if (!position.instrument) {
      throw new Error(
        `Portfolio position for '${position.portfolioId}' is missing instrument details`,
      );
    }

    return {
      portfolioId: position.portfolioId,
      instrument: InstrumentDto.fromGRPC(position.instrument),
      quantity: position.quantity,
      averageEntryPrice: position.averageEntryPrice,
      exposureNotional: position.exposureNotional,
      lastFillId: position.lastFillId,
      updatedAt: position.updatedAt,
    };
  }
}

export class ExecutionFillDto implements Omit<ExecutionFill, 'orderStatus'> {
  @ApiProperty({ example: 'ord_abc:fill:1' })
  fillId: string;

  @ApiProperty({ example: 'ord_abc' })
  orderId: string;

  @ApiProperty({ example: 'portfolio-alpha' })
  portfolioId: string;

  @ApiProperty({ example: 'seed-instrument-btc-usdt' })
  instrumentId: string;

  @ApiProperty({ example: 1 })
  sequence: number;

  @ApiProperty({ example: '50' })
  fillNotional: string;

  @ApiProperty({ example: '0.5' })
  fillQuantity: string;

  @ApiProperty({ example: '100' })
  fillPrice: string;

  @ApiProperty({ example: '50' })
  cumulativeFilledNotional: string;

  @ApiProperty({ example: '0.5' })
  cumulativeFilledQuantity: string;

  @ApiProperty({
    enum: OrderStatusName,
    example: OrderStatusName.PARTIALLY_FILLED,
  })
  orderStatus: OrderStatusName;

  @ApiProperty({ example: '2026-03-25T12:00:04.000Z' })
  filledAt: string;

  static fromGRPC(fill: ExecutionFill): ExecutionFillDto {
    return {
      fillId: fill.fillId,
      orderId: fill.orderId,
      portfolioId: fill.portfolioId,
      instrumentId: fill.instrumentId,
      sequence: fill.sequence,
      fillNotional: fill.fillNotional,
      fillQuantity: fill.fillQuantity,
      fillPrice: fill.fillPrice,
      cumulativeFilledNotional: fill.cumulativeFilledNotional,
      cumulativeFilledQuantity: fill.cumulativeFilledQuantity,
      orderStatus: orderStatusToOrderStatusName(fill.orderStatus),
      filledAt: fill.filledAt,
    };
  }
}

export class ExecutionOrderDto implements Omit<
  ExecutionOrder,
  'side' | 'status' | 'fills'
> {
  @ApiProperty({ example: 'ord_abc' })
  orderId: string;

  @ApiProperty({ example: 'approval-event-1' })
  approvalEventId: string;

  @ApiProperty({ example: 'source-event-1:portfolio-alpha' })
  candidateIdempotencyKey: string;

  @ApiProperty({ example: 'source-event-1' })
  sourceEventId: string;

  @ApiProperty({ example: 'portfolio-alpha' })
  portfolioId: string;

  @ApiProperty({ example: 'seed-instrument-btc-usdt' })
  instrumentId: string;

  @ApiPropertyOptional({ type: InstrumentDto })
  instrument?: InstrumentDto;

  @ApiProperty({ example: 'signal-1' })
  signalId: string;

  @ApiProperty({ enum: SignalSideName, example: SignalSideName.BUY })
  side: SignalSideName;

  @ApiProperty({ example: '100' })
  requestedNotional: string;

  @ApiProperty({ example: '1' })
  requestedQuantity: string;

  @ApiProperty({ example: '100' })
  referencePrice: string;

  @ApiProperty({ enum: OrderStatusName, example: OrderStatusName.FILLED })
  status: OrderStatusName;

  @ApiProperty({ example: '2026-03-25T12:00:02.000Z' })
  approvedAt: string;

  @ApiProperty({ example: '2026-03-25T12:00:03.000Z' })
  placedAt: string;

  @ApiProperty({ example: '2026-03-25T12:00:05.000Z' })
  lastActivityAt: string;

  @ApiProperty({ type: [ExecutionFillDto] })
  fills: ExecutionFillDto[];

  static fromGRPC(
    order: ExecutionOrder,
    instrument?: InstrumentDto,
  ): ExecutionOrderDto {
    return {
      orderId: order.orderId,
      approvalEventId: order.approvalEventId,
      candidateIdempotencyKey: order.candidateIdempotencyKey,
      sourceEventId: order.sourceEventId,
      portfolioId: order.portfolioId,
      instrumentId: order.instrumentId,
      instrument,
      signalId: order.signalId,
      side: signalSideToSignalSideName(order.side),
      requestedNotional: order.requestedNotional,
      requestedQuantity: order.requestedQuantity,
      referencePrice: order.referencePrice,
      status: orderStatusToOrderStatusName(order.status),
      approvedAt: order.approvedAt,
      placedAt: order.placedAt,
      lastActivityAt: order.lastActivityAt,
      fills: order.fills.map((fill) => ExecutionFillDto.fromGRPC(fill)),
    };
  }
}

export class PortfolioReadResponseDto {
  @ApiProperty({ type: PortfolioSummaryDto })
  summary: PortfolioSummaryDto;

  @ApiProperty({ type: [PortfolioPositionDto] })
  positions: PortfolioPositionDto[];

  @ApiProperty({ type: [PortfolioInstrumentConfigDto] })
  configuredInstruments: PortfolioInstrumentConfigDto[];

  @ApiProperty({ type: [ExecutionOrderDto] })
  recentOrders: ExecutionOrderDto[];
}
