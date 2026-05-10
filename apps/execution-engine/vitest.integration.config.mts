/// <reference types="vitest" />
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const nestSwcPlugin = swc.vite({
  jsc: {
    parser: {
      syntax: 'typescript',
      decorators: true,
      dynamicImport: true,
    },
    transform: {
      legacyDecorator: true,
      decoratorMetadata: true,
    },
    target: 'es2023',
    keepClassNames: true,
  },
  module: {
    type: 'es6',
  },
  sourceMaps: true,
});

export default defineConfig(() => ({
  root: import.meta.dirname,
  oxc: false as const,
  cacheDir: '../../node_modules/.vite/apps/execution-engine-integration',
  plugins: [nxViteTsPaths(), nestSwcPlugin],
  test: {
    name: 'execution-engine-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    passWithNoTests: true,
    testTimeout: 20000,
    fileParallelism: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/execution-engine-integration',
      provider: 'v8' as const,
    },
  },
}));
