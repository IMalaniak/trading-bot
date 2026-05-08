import { join } from 'node:path';

import { Module } from '@nestjs/common';
import {
  CommonModule,
  KAFKA_EVENT_PRODUCERS,
  TradingBotMetricsModule,
} from '@trading-bot/common';

import { executionEngineRuntimeConfig } from '../config/runtime.config';
import { validate } from '../env.validation';
import { ExecutionModule } from '../execution/execution.module';

const rootEnvPath = join(process.cwd(), '.env');
const appEnvPath = join(process.cwd(), 'apps/execution-engine/.env');

@Module({
  imports: [
    CommonModule.forRoot({
      config: {
        envFilePath: [rootEnvPath, appEnvPath],
        load: [executionEngineRuntimeConfig],
        validate,
      },
    }),
    TradingBotMetricsModule.forRoot(KAFKA_EVENT_PRODUCERS.EXECUTION_ENGINE),
    ExecutionModule,
  ],
  controllers: [],
})
export class AppModule {}
