import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Instrument } from '@trading-bot/common/proto';

import { assetClassToAssetClassName } from '../mapper/enum.mapper';
import { AssetClassName } from './asset-class-name.enum';

export class InstrumentDto implements Omit<Instrument, 'assetClass'> {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BTC/USDT' })
  symbol: string;

  @ApiProperty({ enum: AssetClassName, example: AssetClassName.CRYPTO })
  assetClass: AssetClassName;

  @ApiProperty({ example: 'Binance' })
  venue: string;

  @ApiPropertyOptional({ example: 'BTC/USDT' })
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
