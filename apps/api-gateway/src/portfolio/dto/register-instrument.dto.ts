import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RegisterInstrumentRequest } from '@trading-bot/common/proto';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { assetClassNameToAssetClass } from '../mapper/enum.mapper';
import { AssetClassName } from './asset-class-name.enum';
import { InstrumentDto } from './instrument.dto';

export class RegisterInstrumentRequestDto implements Omit<
  RegisterInstrumentRequest,
  'assetClass'
> {
  @ApiProperty({ example: 'BTC/USDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: AssetClassName, example: AssetClassName.CRYPTO })
  @IsEnum(AssetClassName)
  assetClass: AssetClassName;

  @ApiProperty({ example: 'Binance' })
  @IsString()
  venue: string;

  @ApiPropertyOptional({ example: 'BTC/USDT' })
  @IsOptional()
  @IsString()
  externalSymbol: string;

  toGRPC(): RegisterInstrumentRequest {
    return {
      symbol: this.symbol,
      assetClass: assetClassNameToAssetClass(this.assetClass),
      venue: this.venue,
      externalSymbol: this.externalSymbol,
    };
  }
}

export class RegisterInstrumentResponseDto extends InstrumentDto {}
