import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GetMarketDataBarsQueryDto {
  @ApiProperty({ description: 'Internal instrument identifier' })
  @IsString()
  instrumentId: string;

  @ApiProperty({ description: 'Kline interval, e.g. "1m", "5m", "1h"' })
  @IsString()
  interval: string;

  @ApiProperty({
    description: 'Start of range — Unix epoch milliseconds (inclusive)',
  })
  @Type(() => Number)
  @IsInt()
  from: number;

  @ApiProperty({
    description: 'End of range — Unix epoch milliseconds (inclusive)',
  })
  @Type(() => Number)
  @IsInt()
  to: number;

  @ApiPropertyOptional({
    description: 'Maximum bars to return. Defaults to 500.',
    default: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  limit?: number;
}

export class MarketDataBarDto {
  @ApiProperty() instrumentId: string;
  @ApiProperty() symbol: string;
  @ApiProperty() venue: string;
  @ApiProperty() interval: string;
  @ApiProperty() openTimeMs: number;
  @ApiProperty() closeTimeMs: number;
  @ApiProperty() open: string;
  @ApiProperty() high: string;
  @ApiProperty() low: string;
  @ApiProperty() close: string;
  @ApiProperty() volume: string;
  @ApiProperty() quoteVolume: string;
  @ApiProperty() tradeCount: number;
}

export class GetMarketDataBarsResponseDto {
  @ApiProperty({ type: [MarketDataBarDto] })
  bars: MarketDataBarDto[];
}
