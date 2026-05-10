/* eslint-disable */
const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

const {
  ConfigureSwcLoaderPlugin,
} = require('../../tools/webpack/configure-swc-loader');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api-gateway'),
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'swc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMaps: true,
    }),
    new ConfigureSwcLoaderPlugin(),
  ],
};
