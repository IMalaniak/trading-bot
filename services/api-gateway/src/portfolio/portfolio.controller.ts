import { Body, Controller, Post } from '@nestjs/common';
import type { RegisterInstrumentResponse } from 'src/types/services/risk_manager';

import { RegisterInstrumentRequestDto } from './dto/register-instrument.dto';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post('register-instrument')
  async registerInstrument(
    @Body() data: RegisterInstrumentRequestDto,
  ): Promise<RegisterInstrumentResponse> {
    return await this.portfolioService.registerInstrument(data);
  }
}
