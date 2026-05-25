import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RiskConfigAuditLogEntry,
  RiskDecisionEntry,
} from '@trading-bot/common/proto';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const DEFAULT_DECISIONS_LIMIT = 50;
export const MAX_DECISIONS_LIMIT = 200;

export class ListRiskDecisionsQueryDto {
  @ApiPropertyOptional({
    example: 'REJECTED',
    description: 'APPROVED | REJECTED',
  })
  @IsOptional()
  @IsIn(['APPROVED', 'REJECTED'])
  decisionFilter?: string;

  @ApiPropertyOptional({
    default: DEFAULT_DECISIONS_LIMIT,
    maximum: MAX_DECISIONS_LIMIT,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DECISIONS_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor from previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class RiskDecisionDto implements RiskDecisionEntry {
  @ApiProperty({ example: 'uuid-1' })
  id: string;

  @ApiProperty({ example: 'portfolio-alpha' })
  portfolioId: string;

  @ApiProperty({ example: 'instrument-1' })
  instrumentId: string;

  @ApiProperty({ example: 'REJECTED' })
  decision: string;

  @ApiProperty({ type: [String], example: ['TRADE_CAP_EXCEEDED'] })
  reasonCodes: string[];

  @ApiProperty({ example: '500' })
  requestedNotional: string;

  @ApiProperty({ example: '10000' })
  referencePrice: string;

  @ApiProperty({ example: '2026-05-21T10:00:00.000Z' })
  decidedAt: string;

  @ApiProperty({ example: 'evt-1' })
  sourceEventId: string;

  static fromGRPC(entry: RiskDecisionEntry): RiskDecisionDto {
    return { ...entry };
  }
}

export class RiskDecisionListResponseDto {
  @ApiProperty({ type: [RiskDecisionDto] })
  decisions: RiskDecisionDto[];

  @ApiPropertyOptional({
    description: 'Opaque cursor to pass for the next page',
  })
  nextCursor?: string;
}

export class ListRiskConfigAuditLogQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_DECISIONS_LIMIT,
    maximum: MAX_DECISIONS_LIMIT,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DECISIONS_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor from previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class RiskConfigAuditLogEntryDto implements RiskConfigAuditLogEntry {
  @ApiProperty({ example: 'uuid-1' })
  id: string;

  @ApiProperty({ example: 'INSTRUMENT_CONFIG' })
  entityType: string;

  @ApiProperty({ example: 'portfolio-alpha' })
  portfolioId: string;

  @ApiPropertyOptional({ example: 'config-uuid' })
  portfolioInstrumentConfigId?: string;

  @ApiProperty({ example: 'enabled' })
  field: string;

  @ApiPropertyOptional({ example: 'true' })
  oldValue?: string;

  @ApiPropertyOptional({ example: 'false' })
  newValue?: string;

  @ApiProperty({ example: '2026-05-21T10:00:00.000Z' })
  changedAt: string;

  static fromGRPC(entry: RiskConfigAuditLogEntry): RiskConfigAuditLogEntryDto {
    return { ...entry };
  }
}

export class RiskConfigAuditLogListResponseDto {
  @ApiProperty({ type: [RiskConfigAuditLogEntryDto] })
  entries: RiskConfigAuditLogEntryDto[];

  @ApiPropertyOptional({
    description: 'Opaque cursor to pass for the next page',
  })
  nextCursor?: string;
}
