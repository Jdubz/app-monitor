# APP-MONITOR-FIX-1 — Fix Backend ESLint Configuration

- **Status**: To Do
- **Owner**: Worker B (or PM)
- **Priority**: P2 (Medium - Optional for Local Tool)
- **Labels**: priority-p2, app-monitor, type-bug, tooling, optional
- **Estimated Effort**: 30 minutes
- **Dependencies**: None
- **Related**: APP-MONITOR-SETUP (partially addresses)

## Important Context

⚠️ **App Monitor is a LOCAL DEVELOPMENT TOOL ONLY** - It will never be deployed. This makes linting less critical but still nice to have for code quality.

## What This Issue Covers

Create missing `.eslintrc.cjs` configuration file for the backend to fix broken `npm run lint` script. Currently the lint script exists but has no configuration file, making it non-functional. This is **optional** for a local dev tool but provides basic code quality.

## Context

The backend has ESLint listed as a devDependency and has lint scripts in package.json:

```json
"scripts": {
  "lint": "eslint src --ext .ts",
  "lint:fix": "eslint src --ext .ts --fix"
}
```

However, there is **no `.eslintrc.cjs` file**, causing the lint command to fail or use incorrect defaults.

**Current behavior:**

```bash
cd app-monitor/backend
npm run lint
# Error or uses wrong config
```

This is a **critical gap** because:

1. Backend code has no quality checks
2. Cannot enforce coding standards
3. TypeScript-specific linting rules not applied
4. Potential bugs/issues go undetected

## Tasks

### 1. Create Backend ESLint Configuration

- [ ] Create `app-monitor/backend/.eslintrc.cjs`
- [ ] Use Node.js/Express-appropriate rules
- [ ] Enable TypeScript linting
- [ ] Configure parser options for TypeScript
- [ ] Set environment to Node.js

### 2. Add Ignore Patterns

- [ ] Ignore `dist/` directory
- [ ] Ignore `node_modules/` (default)
- [ ] Ignore `*.js` files (allow config files)

### 3. Test Lint Script

- [ ] Run `npm run lint` - should pass
- [ ] Introduce an error - should catch it
- [ ] Run `npm run lint:fix` - should auto-fix
- [ ] Verify lint works on all source files

### 4. Add Type-Check Script

- [ ] Add `type-check` script to package.json
- [ ] Run `tsc --noEmit` to check types
- [ ] Verify it catches TypeScript errors

## Proposed Configuration

### backend/.eslintrc.cjs

```javascript
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "warn",
    "no-console": "off", // Allow console for backend logging
  },
  ignorePatterns: ["dist", "node_modules", "*.js"],
};
```

### Update package.json

```json
{
  "scripts": {
    "dev": "nodemon --exec tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "type-check": "tsc --noEmit" // ⭐ ADD THIS
  }
}
```

## Acceptance Criteria

- [ ] `.eslintrc.cjs` file exists in `app-monitor/backend/`
- [ ] `npm run lint` runs without errors
- [ ] Lint catches common issues (unused vars, missing types, etc.)
- [ ] `npm run lint:fix` auto-fixes fixable issues
- [ ] `npm run type-check` verifies TypeScript correctness
- [ ] All existing backend code passes linting

## Benefits

- **Code quality**: Catch bugs and issues early
- **Consistency**: Enforce coding standards
- **TypeScript safety**: Ensure types are used correctly
- **Developer experience**: Clear errors during development
- **CI ready**: Foundation for automated quality checks

## Testing Plan

1. Create `.eslintrc.cjs` with proposed config
2. Run `npm run lint` - should complete successfully
3. Add intentional error (unused variable):
   ```typescript
   const unusedVar = "test";
   ```
4. Run `npm run lint` - should catch the error
5. Remove error, verify lint passes
6. Add `type-check` script
7. Run `npm run type-check` - should pass
8. Add type error, verify it's caught

## Notes

- This is the **minimum viable setup** to fix broken linting
- Frontend already has `.eslintrc.cjs` - use similar structure
- Matches pattern from APP-MONITOR-SETUP issue Part 1.1
- After this, backend will have same quality level as frontend

## Related Issues

- APP-MONITOR-SETUP: Original comprehensive infrastructure issue (deferred)
- APP-MONITOR-FIX-2: CI/CD workflow (depends on this working)
- APP-MONITOR-FIX-3: Git hooks (depends on this working)
