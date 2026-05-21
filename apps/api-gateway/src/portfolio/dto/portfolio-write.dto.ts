import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  UpdatePortfolioInstrumentConfigRequest,
  UpdatePortfolioRequest,
} from '@trading-bot/common/proto';
import { DECIMAL_STRING_PATTERN } from '@trading-bot/common/validation';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

export class UpdatePortfolioRestRequestDto implements Omit<
  UpdatePortfolioRequest,
  'portfolioId'
> {
  @ApiPropertyOptional({ example: '2000' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  exposureCapNotional?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  toGRPC(portfolioId: string): UpdatePortfolioRequest {
    return {
      portfolioId,
      ...(this.exposureCapNotional !== undefined && {
        exposureCapNotional: this.exposureCapNotional,
      }),
      ...(this.isActive !== undefined && { isActive: this.isActive }),
    };
  }
}

export class UpdatePortfolioInstrumentConfigRestRequestDto implements Omit<
  UpdatePortfolioInstrumentConfigRequest,
  'portfolioId' | 'instrumentId'
> {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: '100' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  targetNotional?: string;

  @ApiPropertyOptional({ example: '200' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  maxTradeNotional?: string;

  @ApiPropertyOptional({ example: '500' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  maxPositionNotional?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  maxOpenTrades?: number;

  @ApiPropertyOptional({ example: '10000' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  maxDailyTurnoverNotional?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  cooldownSeconds?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  maxConsecutiveRejections?: number;

  toGRPC(
    portfolioId: string,
    instrumentId: string,
  ): UpdatePortfolioInstrumentConfigRequest {
    return {
      portfolioId,
      instrumentId,
      ...(this.enabled !== undefined && { enabled: this.enabled }),
      ...(this.targetNotional !== undefined && {
        targetNotional: this.targetNotional,
      }),
      ...(this.maxTradeNotional !== undefined && {
        maxTradeNotional: this.maxTradeNotional,
      }),
      ...(this.maxPositionNotional !== undefined && {
        maxPositionNotional: this.maxPositionNotional,
      }),
      ...(this.maxOpenTrades !== undefined && {
        maxOpenTrades: this.maxOpenTrades,
      }),
      ...(this.maxDailyTurnoverNotional !== undefined && {
        maxDailyTurnoverNotional: this.maxDailyTurnoverNotional,
      }),
      ...(this.cooldownSeconds !== undefined && {
        cooldownSeconds: this.cooldownSeconds,
      }),
      ...(this.maxConsecutiveRejections !== undefined && {
        maxConsecutiveRejections: this.maxConsecutiveRejections,
      }),
    };
  }
}
