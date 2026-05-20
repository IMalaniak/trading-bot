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
  GetLatestSignalsQueryDto,
  GetLatestSignalsResponseDto,
} from './dto/signals.dto';
import { SignalsService } from './signals.service';

@ApiTags('signals')
@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  @ApiOkResponse({ type: GetLatestSignalsResponseDto })
  @ApiBadRequestResponse({ type: AppErrorResponseDto })
  @ApiBadGatewayResponse({ type: AppErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: AppErrorResponseDto })
  getLatestSignals(
    @Query() query: GetLatestSignalsQueryDto,
  ): Observable<GetLatestSignalsResponseDto> {
    return this.signalsService.getLatestSignals(query);
  }
}
