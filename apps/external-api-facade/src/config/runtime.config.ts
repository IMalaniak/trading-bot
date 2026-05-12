import { registerAs } from '@nestjs/config';

export const externalApiFacadeRuntimeConfig = registerAs(
  'externalApiFacadeRuntime',
  () => ({
    binanceTestnet: process.env['BINANCE_TESTNET'] === 'true',
    binanceApiKey: process.env['BINANCE_API_KEY'],
    binanceApiSecret: process.env['BINANCE_API_SECRET'],
    binanceDefaultIntervals: (process.env['BINANCE_DEFAULT_INTERVALS'] ?? '1m')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  }),
);

export type ExternalApiFacadeRuntimeConfig = ReturnType<
  typeof externalApiFacadeRuntimeConfig
>;
