import { join } from 'node:path';

import { Module } from '@nestjs/common';
import {
  CommonModule,
  KAFKA_EVENT_PRODUCERS,
  TradingBotMetricsModule,
} from '@trading-bot/common';

import { externalApiFacadeRuntimeConfig } from './config/runtime.config';
import { validate } from './env.validation';
import { FacadeModule } from './facade/facade.module';

const rootEnvPath = join(process.cwd(), '.env');
const appEnvPath = join(process.cwd(), 'apps/external-api-facade/.env');

@Module({
  imports: [
    CommonModule.forRoot({
      config: {
        envFilePath: [rootEnvPath, appEnvPath],
        load: [externalApiFacadeRuntimeConfig],
        validate,
      },
    }),
    TradingBotMetricsModule.forRoot(KAFKA_EVENT_PRODUCERS.EXTERNAL_API_FACADE),
    FacadeModule,
  ],
})
export class AppModule {}
