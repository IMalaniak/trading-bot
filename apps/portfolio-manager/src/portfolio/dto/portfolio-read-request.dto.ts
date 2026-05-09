import type {
  GetPortfolioRequest,
  ListInstrumentsRequest,
  ListPortfoliosRequest,
  RegisterPortfolioInstrumentRequest,
} from '@trading-bot/common/proto';
import { AssetClass } from '@trading-bot/common/proto';
import { DECIMAL_STRING_PATTERN } from '@trading-bot/common/validation';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class ListPortfoliosRequestDto implements ListPortfoliosRequest {}

export class GetPortfolioRequestDto implements GetPortfolioRequest {
  @IsString()
  @IsNotEmpty()
  portfolioId: string;
}

export class RegisterPortfolioInstrumentRequestDto implements RegisterPortfolioInstrumentRequest {
  @IsString()
  @IsNotEmpty()
  portfolioId: string;

  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsString()
  @IsNotEmpty()
  venue: string;

  @IsOptional()
  @IsString()
  externalSymbol = '';

  @IsBoolean()
  enabled: boolean;

  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  targetNotional: string;

  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  maxTradeNotional: string;

  @IsString()
  @Matches(DECIMAL_STRING_PATTERN)
  maxPositionNotional: string;
}

export class ListInstrumentsRequestDto implements ListInstrumentsRequest {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  instrumentIds: string[] = [];
}
