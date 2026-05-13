import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiGatewayTimeoutResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { AppErrorResponseDto } from '../app-error-response.dto';
import {
  GetMarketDataBarsQueryDto,
  GetMarketDataBarsResponseDto,
} from './dto/market-data-bars.dto';
import { MarketDataService } from './market-data.service';

@ApiTags('market-data')
@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('bars')
  @ApiOkResponse({ type: GetMarketDataBarsResponseDto })
  @ApiBadRequestResponse({ type: AppErrorResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  getBars(
    @Query() query: GetMarketDataBarsQueryDto,
  ): Observable<GetMarketDataBarsResponseDto> {
    return this.marketDataService.getMarketDataBars(query);
  }
}
