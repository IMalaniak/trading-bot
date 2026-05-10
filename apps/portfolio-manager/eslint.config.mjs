import baseConfig, {
  nestjsTypedConfigForProject,
} from '../../eslint.config.mjs';
import globals from 'globals';

export default [
  ...baseConfig,
  ...nestjsTypedConfigForProject('apps/portfolio-manager'),
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'apps/portfolio-manager/webpack.config.js',
            'apps/portfolio-manager/prisma/seed.ts',
          ],
        },
      },
    },
  },
];
