import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
  ListRiskConfigAuditLogQueryDto,
  ListRiskDecisionsQueryDto,
  RiskConfigAuditLogListResponseDto,
  RiskDecisionListResponseDto,
} from './dto/portfolio-decisions.dto';
import {
  RegisterPortfolioInstrumentRequestDto,
  RegisterPortfolioInstrumentResponseDto,
} from './dto/portfolio-instrument.dto';
import {
  GetPortfolioParamsDto,
  GetPortfolioQueryDto,
  ListPortfoliosResponseDto,
  PortfolioInstrumentConfigDto,
  PortfolioReadResponseDto,
  PortfolioSummaryDto,
} from './dto/portfolio-read.dto';
import {
  UpdatePortfolioInstrumentConfigRestRequestDto,
  UpdatePortfolioRestRequestDto,
} from './dto/portfolio-write.dto';
import { PortfolioService } from './portfolio.service';

class PortfolioInstrumentParamsDto extends GetPortfolioParamsDto {
  instrumentId: string;
}

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

  @Patch(':portfolioId')
  @ApiOkResponse({ type: PortfolioSummaryDto })
  @ApiBadRequestResponse({ type: AppErrorResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  @ApiNotFoundResponse({ type: AppErrorResponseDto })
  updatePortfolio(
    @Param() params: GetPortfolioParamsDto,
    @Body() data: UpdatePortfolioRestRequestDto,
  ): Observable<PortfolioSummaryDto> {
    return this.portfolioService.updatePortfolio(params.portfolioId, data);
  }

  @Patch(':portfolioId/instrument/:instrumentId')
  @ApiOkResponse({ type: PortfolioInstrumentConfigDto })
  @ApiBadRequestResponse({ type: AppErrorResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  @ApiNotFoundResponse({ type: AppErrorResponseDto })
  updatePortfolioInstrumentConfig(
    @Param() params: PortfolioInstrumentParamsDto,
    @Body() data: UpdatePortfolioInstrumentConfigRestRequestDto,
  ): Observable<PortfolioInstrumentConfigDto> {
    return this.portfolioService.updatePortfolioInstrumentConfig(
      params.portfolioId,
      params.instrumentId,
      data,
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

  @Get(':portfolioId/decisions')
  @ApiOkResponse({ type: RiskDecisionListResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  @ApiNotFoundResponse({ type: AppErrorResponseDto })
  listRiskDecisions(
    @Param() params: GetPortfolioParamsDto,
    @Query() query: ListRiskDecisionsQueryDto,
  ): Observable<RiskDecisionListResponseDto> {
    return this.portfolioService.listRiskDecisions(params.portfolioId, query);
  }

  @Get(':portfolioId/audit')
  @ApiOkResponse({ type: RiskConfigAuditLogListResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  @ApiNotFoundResponse({ type: AppErrorResponseDto })
  listRiskConfigAuditLog(
    @Param() params: GetPortfolioParamsDto,
    @Query() query: ListRiskConfigAuditLogQueryDto,
  ): Observable<RiskConfigAuditLogListResponseDto> {
    return this.portfolioService.listRiskConfigAuditLog(
      params.portfolioId,
      query,
    );
  }
}
