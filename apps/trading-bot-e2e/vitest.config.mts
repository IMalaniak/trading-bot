/// <reference types="vitest" />
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/trading-bot-e2e',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'trading-bot-e2e',
    watch: false,
    globals: true,
    environment: 'node',
    exclude: ['src/e2e/**'],
    include: ['src/**/*.spec.ts'],
    passWithNoTests: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/trading-bot-e2e',
      provider: 'v8' as const,
    },
  },
}));
