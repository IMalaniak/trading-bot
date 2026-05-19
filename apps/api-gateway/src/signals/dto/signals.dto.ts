import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { type Signal } from '@trading-bot/common/proto';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

import { SignalSideName } from '../../portfolio/dto/signal-side-name.enum';
import { signalSideToSignalSideName } from '../../portfolio/mapper/enum.mapper';

export class GetLatestSignalsQueryDto {
  @ApiPropertyOptional({
    description: 'Optional internal instrument identifier',
  })
  @IsString()
  @IsOptional()
  instrumentId?: string;

  @ApiPropertyOptional({
    description: 'Maximum signals to return. 0 means service default.',
    default: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  limit?: number;
}

export class SignalDto {
  @ApiProperty({ example: 'sig_abc123' })
  id: string;

  @ApiProperty({ example: 'seed-instrument-btc-usdt' })
  instrumentId: string;

  @ApiProperty({ enum: SignalSideName, example: SignalSideName.BUY })
  side: SignalSideName;

  @ApiProperty({ example: 100.5 })
  price: number;

  @ApiProperty({ example: 1775044800000 })
  timestamp: number;

  static fromGRPC(signal: Signal): SignalDto {
    return {
      id: signal.id,
      instrumentId: signal.instrumentId,
      side: signalSideToSignalSideName(signal.side),
      price: signal.price,
      timestamp: signal.timestamp,
    };
  }
}

export class GetLatestSignalsResponseDto {
  @ApiProperty({ type: [SignalDto] })
  signals: SignalDto[];
}
