import preferSprinkles from './rules/prefer-sprinkles.js';

const plugin = {
  meta: {
    name: 'eslint-plugin-sprinkles-prefer',
    version: '2.0.0'
  },
  rules: {
    'prefer-sprinkles': preferSprinkles,
  },
};

// Legacy config support
plugin.configs = {
  recommended: {
    plugins: ['sprinkles-prefer'],
    rules: {
      'sprinkles-prefer/prefer-sprinkles': 'warn',
    },
  },
};

// Flat config support
plugin.configs['flat/recommended'] = {
  plugins: {
    'sprinkles-prefer': plugin,
  },
  rules: {
    'sprinkles-prefer/prefer-sprinkles': 'warn',
  },
};

export default plugin;