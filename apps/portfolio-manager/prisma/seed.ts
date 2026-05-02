import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/prisma/generated/client';

const loadEnvFiles = (): void => {
  if (typeof process.loadEnvFile !== 'function') {
    return;
  }

  const envCandidates = [
    resolve(__dirname, '../.env'),
    resolve(__dirname, '../../../.env'),
  ];

  for (const envFile of envCandidates) {
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile);
    }
  }
};

loadEnvFiles();

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const createPrismaClient = (): PrismaClient => {
  const adapter = new PrismaPg({
    connectionString: requireEnv('DATABASE_URL'),
  });

  return new PrismaClient({ adapter });
};

const main = async (): Promise<void> => {
  const prisma = createPrismaClient();

  try {
    await prisma.instrument.upsert({
      where: { id: 'seed-instrument-btc-usdt' },
      update: {
        assetClass: 1,
        symbol: 'BTC/USDT',
        venue: 'BINANCE',
        externalSymbol: 'BTCUSDT',
      },
      create: {
        id: 'seed-instrument-btc-usdt',
        assetClass: 1,
        symbol: 'BTC/USDT',
        venue: 'BINANCE',
        externalSymbol: 'BTCUSDT',
      },
    });

    await prisma.instrument.upsert({
      where: { id: 'seed-instrument-eth-usdt' },
      update: {
        assetClass: 1,
        symbol: 'ETH/USDT',
        venue: 'BINANCE',
        externalSymbol: 'ETHUSDT',
      },
      create: {
        id: 'seed-instrument-eth-usdt',
        assetClass: 1,
        symbol: 'ETH/USDT',
        venue: 'BINANCE',
        externalSymbol: 'ETHUSDT',
      },
    });

    await prisma.portfolio.upsert({
      where: { id: 'portfolio-alpha' },
      update: {
        name: 'Alpha Portfolio',
        exposureCapNotional: 1_000,
        isActive: true,
      },
      create: {
        id: 'portfolio-alpha',
        name: 'Alpha Portfolio',
        exposureCapNotional: 1_000,
        isActive: true,
      },
    });

    await prisma.portfolio.upsert({
      where: { id: 'portfolio-beta' },
      update: {
        name: 'Beta Portfolio',
        exposureCapNotional: 60,
        isActive: true,
      },
      create: {
        id: 'portfolio-beta',
        name: 'Beta Portfolio',
        exposureCapNotional: 60,
        isActive: true,
      },
    });

    await prisma.portfolioInstrumentConfig.upsert({
      where: {
        portfolioId_instrumentId: {
          portfolioId: 'portfolio-alpha',
          instrumentId: 'seed-instrument-btc-usdt',
        },
      },
      update: {
        enabled: true,
        targetNotional: 100,
        maxTradeNotional: 150,
        maxPositionNotional: 400,
      },
      create: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'seed-instrument-btc-usdt',
        enabled: true,
        targetNotional: 100,
        maxTradeNotional: 150,
        maxPositionNotional: 400,
      },
    });

    await prisma.portfolioInstrumentConfig.upsert({
      where: {
        portfolioId_instrumentId: {
          portfolioId: 'portfolio-beta',
          instrumentId: 'seed-instrument-btc-usdt',
        },
      },
      update: {
        enabled: true,
        targetNotional: 100,
        maxTradeNotional: 120,
        maxPositionNotional: 150,
      },
      create: {
        portfolioId: 'portfolio-beta',
        instrumentId: 'seed-instrument-btc-usdt',
        enabled: true,
        targetNotional: 100,
        maxTradeNotional: 120,
        maxPositionNotional: 150,
      },
    });

    await prisma.portfolioInstrumentConfig.upsert({
      where: {
        portfolioId_instrumentId: {
          portfolioId: 'portfolio-alpha',
          instrumentId: 'seed-instrument-eth-usdt',
        },
      },
      update: {
        enabled: false,
        targetNotional: 50,
        maxTradeNotional: 75,
        maxPositionNotional: 150,
      },
      create: {
        portfolioId: 'portfolio-alpha',
        instrumentId: 'seed-instrument-eth-usdt',
        enabled: false,
        targetNotional: 50,
        maxTradeNotional: 75,
        maxPositionNotional: 150,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
