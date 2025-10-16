import { Body, Controller, Post } from '@nestjs/common';
import { Observable } from 'rxjs';

import {
  RegisterInstrumentRequestDto,
  RegisterInstrumentResponseDto,
} from './dto/register-instrument.dto';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post('register-instrument')
  registerInstrument(
    @Body() data: RegisterInstrumentRequestDto,
  ): Observable<RegisterInstrumentResponseDto> {
    return this.portfolioService.registerInstrument(data);
  }
}
