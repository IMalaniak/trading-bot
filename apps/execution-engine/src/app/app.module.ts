import { join } from 'node:path';

import { Module } from '@nestjs/common';
import { CommonModule } from '@trading-bot/common';

import { executionEngineRuntimeConfig } from '../config/runtime.config';
import { validate } from '../env.validation';
import { ExecutionModule } from '../execution/execution.module';

const rootEnvPath = join(process.cwd(), '.env');
const appEnvPath = join(__dirname, '../../.env');

@Module({
  imports: [
    CommonModule.forRoot({
      config: {
        envFilePath: [rootEnvPath, appEnvPath],
        load: [executionEngineRuntimeConfig],
        validate,
      },
    }),
    ExecutionModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
