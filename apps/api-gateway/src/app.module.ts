import { Module } from '@nestjs/common';
import { CommonModule, TradingBotMetricsModule } from '@trading-bot/common';
import { join } from 'path';

import { validate } from './env.validation';
import { MetricsController } from './metrics/metrics.controller';
import { PortfolioModule } from './portfolio/portfolio.module';

const rootEnvPath = join(process.cwd(), '.env');

@Module({
  imports: [
    CommonModule.forRoot({
      config: {
        envFilePath: [rootEnvPath],
        validate,
      },
    }),
    TradingBotMetricsModule.forRoot('api-gateway'),
    PortfolioModule,
  ],
  controllers: [MetricsController],
})
export class AppModule {}
