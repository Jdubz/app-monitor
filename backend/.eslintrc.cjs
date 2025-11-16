module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // TEMPORARY: Relaxed rules for test files during migration phase
      // Allows @ts-nocheck for legacy test files with extensive mocking that require refactoring
      // TODO: Create tracking issues to incrementally remove @ts-nocheck suppressions
      // See TYPESCRIPT_FIX_SUMMARY.md for context on this technical debt
      files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts', '**/test/**/*.ts', '**/__tests__/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/ban-ts-comment': 'off', // Allows @ts-nocheck in test files
      },
    },
  ],
};
