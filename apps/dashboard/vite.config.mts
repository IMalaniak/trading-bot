/// <reference types='vitest' />
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const readPort = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port)) {
    throw new Error(`Expected ${name} to be an integer, received '${raw}'.`);
  }

  return port;
};

const dashboardHost = process.env['DASHBOARD_HOST'] ?? '127.0.0.1';
const dashboardPort = readPort('DASHBOARD_PORT', 4200);
const dashboardStrictPort = Boolean(process.env['DASHBOARD_PORT']);

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dashboard',
  server: {
    port: dashboardPort,
    host: dashboardHost,
    strictPort: dashboardStrictPort,
  },
  preview: {
    port: dashboardPort,
    host: dashboardHost,
    strictPort: dashboardStrictPort,
  },
  plugins: [
    react(),
    tailwindcss(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../dist/apps/dashboard',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'dashboard',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/dashboard',
      provider: 'v8' as const,
    },
  },
}));
