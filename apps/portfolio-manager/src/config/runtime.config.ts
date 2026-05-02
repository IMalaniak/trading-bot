import { registerAs } from '@nestjs/config';

export const portfolioManagerRuntimeConfig = registerAs(
  'portfolioManagerRuntime',
  () => ({
    enableOutboxInterval: true,
    enableRiskPipelineConsumers: true,
  }),
);
