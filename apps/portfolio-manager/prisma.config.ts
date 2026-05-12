import { defineConfig, env } from 'prisma/config';

const datasource = process.argv.includes('generate')
  ? {}
  : {
      url: env('PORTFOLIO_MANAGER_DATABASE_URL'),
    };

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource,
});
