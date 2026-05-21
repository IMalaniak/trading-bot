import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGatewayTimeoutResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { AppErrorResponseDto } from '../app-error-response.dto';
import {
  CreateStrategyBodyDto,
  ListStrategiesResponseDto,
  StrategyDto,
  UpdateStrategyBodyDto,
} from './dto/strategy.dto';
import { PortfolioService } from './portfolio.service';

class StrategyParamsDto {
  strategyId: string;
}

@ApiTags('strategies')
@Controller('strategies')
export class StrategiesController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post()
  @ApiCreatedResponse({ type: StrategyDto })
  @ApiBadRequestResponse({ type: AppErrorResponseDto })
  @ApiConflictResponse({ type: AppErrorResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  createStrategy(@Body() body: CreateStrategyBodyDto): Observable<StrategyDto> {
    return this.portfolioService.createStrategy(body);
  }

  @Get()
  @ApiOkResponse({ type: ListStrategiesResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  listStrategies(): Observable<ListStrategiesResponseDto> {
    return this.portfolioService.listStrategies();
  }

  @Get(':strategyId')
  @ApiOkResponse({ type: StrategyDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  @ApiNotFoundResponse({ type: AppErrorResponseDto })
  getStrategy(@Param() params: StrategyParamsDto): Observable<StrategyDto> {
    return this.portfolioService.getStrategy(params.strategyId);
  }

  @Patch(':strategyId')
  @ApiOkResponse({ type: StrategyDto })
  @ApiBadRequestResponse({ type: AppErrorResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  @ApiNotFoundResponse({ type: AppErrorResponseDto })
  updateStrategy(
    @Param() params: StrategyParamsDto,
    @Body() body: UpdateStrategyBodyDto,
  ): Observable<StrategyDto> {
    return this.portfolioService.updateStrategy(params.strategyId, body);
  }
}
