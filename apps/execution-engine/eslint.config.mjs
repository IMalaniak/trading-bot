import baseConfig, { nestjsTypedConfigForProject } from '../../eslint.config.mjs';
import globals from 'globals';

export default [
  ...baseConfig,
  ...nestjsTypedConfigForProject('apps/execution-engine'),
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['apps/execution-engine/webpack.config.js'],
        },
      },
    },
  },
];
