import type {
  GetPortfolioRequest,
  ListInstrumentsRequest,
} from '@trading-bot/common/proto';
import { ArrayUnique, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class GetPortfolioRequestDto implements GetPortfolioRequest {
  @IsString()
  @IsNotEmpty()
  portfolioId: string;
}

export class ListInstrumentsRequestDto implements ListInstrumentsRequest {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  instrumentIds: string[] = [];
}
