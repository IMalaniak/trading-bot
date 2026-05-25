import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AssetClassName,
  assetClassToAssetClassName,
} from '@trading-bot/common';
import { Instrument } from '@trading-bot/common/proto';

export class InstrumentDto implements Omit<Instrument, 'assetClass'> {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'AAPL' })
  symbol: string;

  @ApiProperty({ enum: AssetClassName, example: AssetClassName.CRYPTO })
  assetClass: AssetClassName;

  @ApiProperty({ example: 'NASDAQ' })
  venue: string;

  @ApiPropertyOptional({ example: 'AAPL' })
  externalSymbol?: string;

  static fromGRPC(instrument: Instrument): InstrumentDto {
    return {
      id: instrument.id,
      symbol: instrument.symbol,
      assetClass: assetClassToAssetClassName(instrument.assetClass),
      venue: instrument.venue,
      externalSymbol: instrument.externalSymbol,
    };
  }
}
