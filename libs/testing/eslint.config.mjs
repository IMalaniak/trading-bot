import baseConfig, {
  nestjsTypedConfigForProject,
} from '../../eslint.config.mjs';
import globals from 'globals';

export default [
  ...baseConfig,
  ...nestjsTypedConfigForProject('libs/testing'),
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
      parserOptions: {
        projectService: true,
      },
    },
  },
];
