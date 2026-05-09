import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RegisterPortfolioInstrumentRequest } from '@trading-bot/common/proto';
import { DECIMAL_STRING_PATTERN } from '@trading-bot/common/validation';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

import { assetClassNameToAssetClass } from '../mapper/enum.mapper';
import { AssetClassName } from './asset-class-name.enum';
import { PortfolioInstrumentConfigDto } from './portfolio-read.dto';

export class RegisterPortfolioInstrumentRequestDto implements Omit<
  RegisterPortfolioInstrumentRequest,
  'portfolioId' | 'assetClass'
> {
  @ApiProperty({ example: 'AAPL' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ enum: AssetClassName, example: AssetClassName.STOCK })
  @IsEnum(AssetClassName)
  assetClass: AssetClassName;

  @ApiProperty({ example: 'NASDAQ' })
  @IsString()
  @IsNotEmpty()
  venue: string;

  @ApiPropertyOptional({ example: 'AAPL' })
  @IsOptional()
  @IsString()
  externalSymbol: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: '100' })
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  targetNotional: string;

  @ApiProperty({ example: '25' })
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  maxTradeNotional: string;

  @ApiProperty({ example: '400' })
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  maxPositionNotional: string;

  toGRPC(portfolioId: string): RegisterPortfolioInstrumentRequest {
    return {
      portfolioId,
      symbol: this.symbol,
      assetClass: assetClassNameToAssetClass(this.assetClass),
      venue: this.venue,
      externalSymbol: this.externalSymbol,
      enabled: this.enabled,
      targetNotional: this.targetNotional,
      maxTradeNotional: this.maxTradeNotional,
      maxPositionNotional: this.maxPositionNotional,
    };
  }
}

export class RegisterPortfolioInstrumentResponseDto extends PortfolioInstrumentConfigDto {}
