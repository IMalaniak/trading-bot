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
  cacheDir: '../../node_modules/.vite/libs/common',
  plugins: [nxViteTsPaths(), nestSwcPlugin],
  test: {
    name: 'common',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/common',
      provider: 'v8' as const,
    },
  },
}));
