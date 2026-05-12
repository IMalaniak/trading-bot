import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  StartMarketDataSubscriptionRequest,
  StartMarketDataSubscriptionResponse,
  StopMarketDataSubscriptionRequest,
  StopMarketDataSubscriptionResponse,
} from '@trading-bot/common/proto';

import { FacadeService } from './facade.service';

@Controller()
export class ExternalApiFacadeController {
  constructor(private readonly facadeService: FacadeService) {}

  @GrpcMethod('ExternalApiFacade', 'StartMarketDataSubscription')
  async startMarketDataSubscription(
    data: StartMarketDataSubscriptionRequest,
  ): Promise<StartMarketDataSubscriptionResponse> {
    const started = await this.facadeService.startSubscription(
      data.instrumentId,
      data.symbol,
      data.venue,
      data.intervals,
    );
    return { started };
  }

  @GrpcMethod('ExternalApiFacade', 'StopMarketDataSubscription')
  async stopMarketDataSubscription(
    data: StopMarketDataSubscriptionRequest,
  ): Promise<StopMarketDataSubscriptionResponse> {
    const stopped = await this.facadeService.stopSubscription(
      data.instrumentId,
    );
    return { stopped };
  }
}
