import { Controller, Get, Header } from '@nestjs/common';
import {
  InjectTradingBotMetrics,
  TradingBotMetrics,
} from '@trading-bot/common';

@Controller()
export class MetricsController {
  constructor(
    @InjectTradingBotMetrics()
    private readonly metrics: TradingBotMetrics,
  ) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metrics.metrics();
  }
}
