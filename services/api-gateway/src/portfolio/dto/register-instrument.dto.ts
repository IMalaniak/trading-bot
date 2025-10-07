import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssetClass } from 'src/types/common/instrument';
import {
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from 'src/types/services/risk_manager';

import { InstrumentDto } from './instrument.dto';

export class RegisterInstrumentRequestDto implements RegisterInstrumentRequest {
  @IsString()
  symbol: string;

  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsString()
  venue: string;

  @IsOptional()
  @IsString()
  externalSymbol: string;
}

export class RegisterInstrumentResponseDto
  implements RegisterInstrumentResponse
{
  instrument: InstrumentDto;
}
