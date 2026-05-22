import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

import { URLS } from './src/support/e2e-env';

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src/e2e' }),
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  timeout: 120_000,
  use: {
    baseURL: URLS.dashboard,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
