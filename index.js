import preferSprinkles from './rules/prefer-sprinkles.js';

export default {
  rules: {
    'prefer-sprinkles': preferSprinkles,
  },
  configs: {
    recommended: {
      plugins: ['sprinkles-prefer'],
      rules: {
        'sprinkles-prefer/prefer-sprinkles': 'warn',
      },
    },
  },
};