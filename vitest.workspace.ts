import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      '!dist/**',
      '**/vite.config.{mjs,js,ts,mts}',
      '**/vitest.config.{mjs,js,ts,mts}',
      '**/vitest.integration.config.{mjs,js,ts,mts}',
    ],
  },
});
