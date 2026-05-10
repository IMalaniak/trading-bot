const swcLoaderPath = require.resolve('swc-loader');

function configureSwcLoaderRule(rule) {
  if (!rule || typeof rule !== 'object') {
    return;
  }

  if (Array.isArray(rule.oneOf)) {
    rule.oneOf.forEach(configureSwcLoaderRule);
  }

  if (Array.isArray(rule.rules)) {
    rule.rules.forEach(configureSwcLoaderRule);
  }

  if (Array.isArray(rule.use)) {
    rule.use.forEach(configureSwcLoaderRule);
  }

  const loader =
    typeof rule.loader === 'string'
      ? rule.loader
      : typeof rule === 'string'
        ? rule
        : undefined;

  if (loader !== swcLoaderPath) {
    return;
  }

  rule.options = {
    ...rule.options,
    jsc: {
      ...rule.options?.jsc,
      target: 'es2023',
      loose: false,
    },
  };
}

class ConfigureSwcLoaderPlugin {
  apply(compiler) {
    compiler.options.module?.rules?.forEach(configureSwcLoaderRule);
  }
}

module.exports = { ConfigureSwcLoaderPlugin };
