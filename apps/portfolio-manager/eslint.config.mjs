import baseConfig from '../../eslint.config.mjs';
import globals from 'globals';

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['apps/portfolio-manager/webpack.config.js', 'apps/portfolio-manager/prisma/seed.ts'],
        },
      },
    },
  },
];
