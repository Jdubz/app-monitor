import globals from "globals";
import tseslint from "typescript-eslint";
import localRules from "./eslint-local-rules.cjs";

const localRulesPlugin = {
  rules: localRules,
};

export default [
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "local-rules": localRulesPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      "local-rules/no-direct-db-in-routes": "error",
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts', '**/test/**/*.ts', '**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    ignores: ["node_modules/", "dist/", "build/", "*.config.js", "src/utils/repoPaths.d.ts", "eslint-local-rules.cjs", "eslint-local-rules/index.cjs", "safe-test-runner.mjs"],
  }
];
