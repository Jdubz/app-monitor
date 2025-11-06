# Dev-Monitor Development Tooling Setup

## Overview

This document describes the strict development tooling setup for the dev-monitor project, including linting and testing that runs on git hooks to ensure code quality.

## Tooling Components

### 1. ESLint Configuration

#### Backend ESLint (`.eslintrc.cjs`)

- **Location**: `dev-monitor/backend/.eslintrc.cjs`
- **Type**: CommonJS module (due to `"type": "module"` in package.json)
- **Features**:
  - TypeScript-specific rules with strict type checking
  - Code quality rules (complexity, max-lines, etc.)
  - Code style rules (quotes, semicolons, indentation)
  - Security rules (no-eval, no-implied-eval)
  - Test file overrides for relaxed rules

#### Frontend ESLint (`.eslintrc.cjs`)

- **Location**: `dev-monitor/frontend/.eslintrc.cjs`
- **Type**: CommonJS module
- **Features**:
  - React-specific rules
  - TypeScript strict type checking
  - Same quality and style rules as backend
  - Test file overrides

### 2. Git Hooks

#### Pre-commit Hook

- **Location**: `.git/hooks/pre-commit`
- **Purpose**: Runs strict linting on both frontend and backend
- **Behavior**: Blocks commits if linting fails
- **Scope**:
  - `dev-monitor/backend` - ESLint on TypeScript files
  - `dev-monitor/frontend` - ESLint on TypeScript/TSX files

#### Pre-push Hook

- **Location**: `.git/hooks/pre-push`
- **Purpose**: Runs unit tests on both frontend and backend
- **Behavior**: Blocks pushes if tests fail
- **Scope**:
  - `dev-monitor/backend` - Vitest unit tests
  - `dev-monitor/frontend` - Vitest unit tests

## ESLint Rules Configuration

### Strict Rules Applied

#### TypeScript Rules

- `@typescript-eslint/no-explicit-any`: Warn (allows `any` with warning)
- `@typescript-eslint/no-non-null-assertion`: Warn
- `@typescript-eslint/prefer-nullish-coalescing`: Warn
- `@typescript-eslint/prefer-optional-chain`: Warn
- `@typescript-eslint/no-floating-promises`: Error
- `@typescript-eslint/await-thenable`: Error
- `@typescript-eslint/no-misused-promises`: Error
- `@typescript-eslint/require-await`: Error
- `@typescript-eslint/consistent-type-imports`: Error
- `@typescript-eslint/consistent-type-exports`: Error

#### Code Quality Rules

- `no-console`: Warn (allows console with warning)
- `no-debugger`: Error
- `no-alert`: Error
- `max-len`: 120 characters
- `complexity`: 15 (warn)
- `max-depth`: 5 (warn)
- `max-lines-per-function`: 100 (warn)
- `max-params`: 6 (warn)
- `no-magic-numbers`: Warn (with common exceptions)

#### Code Style Rules

- `semi`: Always require semicolons
- `quotes`: Single quotes
- `indent`: 2 spaces
- `comma-dangle`: Always multiline
- `prefer-const`: Error
- `prefer-arrow-callback`: Error
- `prefer-template`: Error
- `object-shorthand`: Error

### Test File Overrides

- `@typescript-eslint/no-explicit-any`: Off
- `no-magic-numbers`: Off
- `max-lines-per-function`: Off
- `no-console`: Off (frontend only)
- `complexity`: Off

## Usage

### Running Linting Manually

```bash
# Backend linting
cd dev-monitor/backend
npm run lint

# Frontend linting
cd dev-monitor/frontend
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

### Running Tests Manually

```bash
# Backend tests
cd dev-monitor/backend
npm run test

# Frontend tests
cd dev-monitor/frontend
npm run test

# Test with coverage
npm run test:coverage
```

### Git Workflow

1. **Commit**: Pre-commit hook runs linting
   - If linting fails, commit is blocked
   - Fix linting issues and try again

2. **Push**: Pre-push hook runs tests
   - If tests fail, push is blocked
   - Fix failing tests and try again

## Benefits

### Code Quality

- **Consistency**: Enforced code style across the project
- **Type Safety**: Strict TypeScript rules prevent type errors
- **Best Practices**: Enforced modern JavaScript/TypeScript patterns
- **Maintainability**: Complexity and size limits prevent overly complex code

### Development Experience

- **Early Detection**: Issues caught before commit/push
- **Automated**: No manual linting/testing required
- **Fast Feedback**: Immediate feedback on code issues
- **Team Consistency**: All developers follow same standards

### CI/CD Integration

- **Pre-commit**: Catches issues before they enter the repository
- **Pre-push**: Ensures all tests pass before code reaches remote
- **Quality Gates**: Prevents broken code from being deployed

## Troubleshooting

### Common Issues

1. **ESLint Configuration Errors**
   - Ensure `.eslintrc.cjs` uses CommonJS syntax
   - Check that TypeScript ESLint packages are installed
   - Verify parser options match tsconfig.json

2. **Git Hook Issues**
   - Ensure hooks are executable: `chmod +x .git/hooks/pre-commit`
   - Check that npm scripts exist in package.json
   - Verify working directory in hook scripts

3. **Test Failures**
   - Run tests manually to identify issues
   - Check test file patterns in vitest.config.ts
   - Ensure test dependencies are installed

### Bypassing Hooks (Emergency Only)

```bash
# Skip pre-commit hook
git commit --no-verify -m "emergency commit"

# Skip pre-push hook
git push --no-verify origin staging
```

**Note**: Only use bypassing in emergencies. The hooks are there to maintain code quality.

## Maintenance

### Updating ESLint Rules

1. Modify `.eslintrc.cjs` files
2. Test with `npm run lint`
3. Update documentation if needed
4. Commit changes

### Updating Git Hooks

1. Modify hook files in `.git/hooks/`
2. Test with sample commits/pushes
3. Update documentation if needed
4. Commit changes

### Adding New Rules

1. Add rule to appropriate `.eslintrc.cjs`
2. Test with existing codebase
3. Fix any new violations
4. Update documentation
5. Commit changes

## Future Enhancements

- **Prettier Integration**: Add Prettier for code formatting
- **Husky Integration**: Use Husky for more robust git hooks
- **Lint-staged**: Run linting only on staged files
- **Commit Message Linting**: Enforce conventional commit format
- **Dependency Auditing**: Add security vulnerability scanning
