import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiGatewayTimeoutResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { AppErrorResponseDto } from '../app-error-response.dto';
import {
  RegisterPortfolioInstrumentRequestDto,
  RegisterPortfolioInstrumentResponseDto,
} from './dto/portfolio-instrument.dto';
import {
  GetPortfolioParamsDto,
  GetPortfolioQueryDto,
  ListPortfoliosResponseDto,
  PortfolioReadResponseDto,
} from './dto/portfolio-read.dto';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolios')
@Controller('portfolios')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get()
  @ApiOkResponse({ type: ListPortfoliosResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  listPortfolios(): Observable<ListPortfoliosResponseDto> {
    return this.portfolioService.listPortfolios();
  }

  @Get(':portfolioId')
  @ApiOkResponse({ type: PortfolioReadResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  @ApiNotFoundResponse({ type: AppErrorResponseDto })
  getPortfolio(
    @Param() params: GetPortfolioParamsDto,
    @Query() query: GetPortfolioQueryDto,
  ): Observable<PortfolioReadResponseDto> {
    return this.portfolioService.getPortfolio(
      params.portfolioId,
      query.recentOrdersLimit,
    );
  }

  @Post(':portfolioId/instrument')
  @ApiOkResponse({ type: RegisterPortfolioInstrumentResponseDto })
  @ApiBadRequestResponse({ type: AppErrorResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiConflictResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  @ApiNotFoundResponse({ type: AppErrorResponseDto })
  registerPortfolioInstrument(
    @Param() params: GetPortfolioParamsDto,
    @Body() data: RegisterPortfolioInstrumentRequestDto,
  ): Observable<RegisterPortfolioInstrumentResponseDto> {
    return this.portfolioService.registerPortfolioInstrument(
      params.portfolioId,
      data,
    );
  }
}
