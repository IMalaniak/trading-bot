import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HHMM_TIME_PATTERN } from '@trading-bot/common';
import type { PortfolioSummary } from '@trading-bot/common/proto';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class StrategyDto {
  @ApiProperty({ example: 'strategy-abc' })
  id: string;

  @ApiProperty({ example: 'Momentum Only' })
  name: string;

  @ApiPropertyOptional({ example: 'A momentum-based strategy' })
  description?: string;

  @ApiProperty({ example: [1, 2] })
  allowedSides: number[];

  @ApiPropertyOptional({ example: 300 })
  minIntervalSecs?: number;

  @ApiPropertyOptional({ example: '09:00' })
  activeTimeStart?: string;

  @ApiPropertyOptional({ example: '17:00' })
  activeTimeEnd?: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt: string;
}

export class ListStrategiesResponseDto {
  @ApiProperty({ type: [StrategyDto] })
  strategies: StrategyDto[];
}

export class CreateStrategyBodyDto {
  @ApiProperty({ example: 'Momentum Only' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'A momentum-based strategy' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: [1, 2] })
  @IsArray()
  @IsInt({ each: true })
  allowedSides: number[];

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minIntervalSecs?: number;

  @ApiPropertyOptional({ example: '09:00', description: 'HH:MM UTC' })
  @IsOptional()
  @IsString()
  @Matches(HHMM_TIME_PATTERN, {
    message: 'activeTimeStart must be in HH:MM format',
  })
  activeTimeStart?: string;

  @ApiPropertyOptional({ example: '17:00', description: 'HH:MM UTC' })
  @IsOptional()
  @IsString()
  @Matches(HHMM_TIME_PATTERN, {
    message: 'activeTimeEnd must be in HH:MM format',
  })
  activeTimeEnd?: string;
}

export class UpdateStrategyBodyDto {
  @ApiPropertyOptional({ example: 'Momentum Only v2' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: [1] })
  @IsArray()
  @IsInt({ each: true })
  allowedSides: number[];

  @ApiPropertyOptional({ example: 600 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minIntervalSecs?: number;

  @ApiPropertyOptional({ example: '10:00', description: 'HH:MM UTC' })
  @IsOptional()
  @IsString()
  @Matches(HHMM_TIME_PATTERN, {
    message: 'activeTimeStart must be in HH:MM format',
  })
  activeTimeStart?: string;

  @ApiPropertyOptional({ example: '16:00', description: 'HH:MM UTC' })
  @IsOptional()
  @IsString()
  @Matches(HHMM_TIME_PATTERN, {
    message: 'activeTimeEnd must be in HH:MM format',
  })
  activeTimeEnd?: string;
}

export class AssignStrategyBodyDto {
  @ApiPropertyOptional({
    example: 'strategy-abc',
    description: 'Omit or set null to clear assignment',
  })
  @IsOptional()
  @IsString()
  strategyId?: string;
}

export interface AssignStrategyToPortfolioResponseDto {
  summary?: PortfolioSummary;
  strategy?: StrategyDto;
}
