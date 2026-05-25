import type {
  AssignStrategyToPortfolioRequest,
  CreateStrategyRequest,
  GetStrategyRequest,
  ListRiskConfigAuditLogRequest,
  ListRiskDecisionsRequest,
  UpdatePortfolioInstrumentConfigRequest,
  UpdatePortfolioRequest,
  UpdateStrategyRequest,
} from '@trading-bot/common/proto';
import {
  DECIMAL_STRING_PATTERN,
  HHMM_TIME_PATTERN,
} from '@trading-bot/common/validation';
import {
  IsArray,
  IsBoolean,
  IsIn,
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
  @IsIn(['APPROVED', 'REJECTED'])
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

export class CreateStrategyRequestDto implements CreateStrategyRequest {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsInt({ each: true })
  allowedSides: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minIntervalSecs?: number;

  @IsOptional()
  @IsString()
  @Matches(HHMM_TIME_PATTERN, {
    message: 'activeTimeStart must be in HH:MM format',
  })
  activeTimeStart?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM_TIME_PATTERN, {
    message: 'activeTimeEnd must be in HH:MM format',
  })
  activeTimeEnd?: string;
}

export class UpdateStrategyRequestDto implements UpdateStrategyRequest {
  @IsString()
  @IsNotEmpty()
  strategyId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsInt({ each: true })
  allowedSides: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minIntervalSecs?: number;

  @IsOptional()
  @IsString()
  @Matches(HHMM_TIME_PATTERN, {
    message: 'activeTimeStart must be in HH:MM format',
  })
  activeTimeStart?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM_TIME_PATTERN, {
    message: 'activeTimeEnd must be in HH:MM format',
  })
  activeTimeEnd?: string;
}

export class GetStrategyRequestDto implements GetStrategyRequest {
  @IsString()
  @IsNotEmpty()
  strategyId: string;
}
