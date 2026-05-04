import { registerAs } from '@nestjs/config';

export const executionEngineRuntimeConfig = registerAs(
  'executionEngineRuntime',
  () => ({
    enableOutboxInterval: true,
    enableApprovedTradesConsumer: true,
  }),
);
