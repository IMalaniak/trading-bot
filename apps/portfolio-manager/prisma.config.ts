import { defineConfig, env } from 'prisma/config';

const datasource = process.argv.includes('generate')
  ? {}
  : {
      url: env('DATABASE_URL'),
    };

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource,
});
