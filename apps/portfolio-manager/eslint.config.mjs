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
      sourceType: 'commonjs',
      parserOptions: {
        projectService: {
          allowDefaultProject: ['webpack.config.js', 'apps/portfolio-manager/prisma/seed.ts'],
        },
      },
    },
  },
];
