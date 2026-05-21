import type {
  AssignStrategyToPortfolioRequest,
  ListRiskConfigAuditLogRequest,
  ListRiskDecisionsRequest,
  UpdatePortfolioInstrumentConfigRequest,
  UpdatePortfolioRequest,
} from '@trading-bot/common/proto';
import { DECIMAL_STRING_PATTERN } from '@trading-bot/common/validation';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class UpdatePortfolioInstrumentConfigRequestDto implements UpdatePortfolioInstrumentConfigRequest {
  @IsString()
  @IsNotEmpty()
  portfolioId: string;

  @IsString()
  @IsNotEmpty()
  instrumentId: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  targetNotional?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  maxTradeNotional?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  maxPositionNotional?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxOpenTrades?: number;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  maxDailyTurnoverNotional?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxConsecutiveRejections?: number;
}

export class UpdatePortfolioRequestDto implements UpdatePortfolioRequest {
  @IsString()
  @IsNotEmpty()
  portfolioId: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  exposureCapNotional?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListRiskDecisionsRequestDto implements ListRiskDecisionsRequest {
  @IsString()
  @IsNotEmpty()
  portfolioId: string;

  @IsOptional()
  @IsString()
  decisionFilter?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ListRiskConfigAuditLogRequestDto implements ListRiskConfigAuditLogRequest {
  @IsString()
  @IsNotEmpty()
  portfolioId: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class AssignStrategyToPortfolioRequestDto implements AssignStrategyToPortfolioRequest {
  @IsString()
  @IsNotEmpty()
  portfolioId: string;

  @IsOptional()
  @IsString()
  strategyId?: string;
}
