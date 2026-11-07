import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/dev-dist/**', 'coverage/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
    },
  },
  {
    files: ['client/**/*.js'],
    ignores: ['client/vite.config.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['client/src/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  prettier,
];
