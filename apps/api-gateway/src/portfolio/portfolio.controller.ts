import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';

import {
  GetPortfolioParamsDto,
  GetPortfolioQueryDto,
  PortfolioReadResponseDto,
} from './dto/portfolio-read.dto';
import {
  RegisterInstrumentRequestDto,
  RegisterInstrumentResponseDto,
} from './dto/register-instrument.dto';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolio')
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get(':portfolioId')
  @ApiOkResponse({ type: PortfolioReadResponseDto })
  getPortfolio(
    @Param() params: GetPortfolioParamsDto,
    @Query() query: GetPortfolioQueryDto,
  ): Observable<PortfolioReadResponseDto> {
    return this.portfolioService.getPortfolio(
      params.portfolioId,
      query.recentOrdersLimit,
    );
  }

  @Post('register-instrument')
  registerInstrument(
    @Body() data: RegisterInstrumentRequestDto,
  ): Observable<RegisterInstrumentResponseDto> {
    return this.portfolioService.registerInstrument(data);
  }
}
