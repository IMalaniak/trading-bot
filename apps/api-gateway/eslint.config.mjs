import baseConfig, { nestjsTypedConfigForProject } from '../../eslint.config.mjs';
import globals from 'globals';

export default [
  ...baseConfig,
  ...nestjsTypedConfigForProject('apps/api-gateway', { swagger: true }),
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['apps/api-gateway/webpack.config.js'],
        },
      },
    },
  },
];
