# APP-MONITOR-SETUP — Development Infrastructure Setup

- **Status**: To Do
- **Owner**: Worker B (or PM)
- **Priority**: P2 (Medium)
- **Labels**: priority-p2, repository-pm, type-feature, app-monitor, tooling
- **Estimated Effort**: 2-3 hours
- **Dependencies**: APP-MONITOR-1 (Project setup must be complete)
- **Related**: See `docs/APP_MONITOR_REQUIREMENTS.md`

## What This Issue Covers

Set up complete development infrastructure for the app-monitor project including linting, testing, formatting, git hooks, and CI/CD. Ensure both backend (Express/TypeScript) and frontend (React/Vite) have proper quality gates.

## Context

The app-monitor project needs professional-grade development tooling to ensure code quality, catch bugs early, and maintain consistency. Since this is a development tool itself, it should exemplify best practices.

**Technology Stack:**

- **Backend**: Express.js + TypeScript + Node.js
- **Frontend**: React 18 + TypeScript + Vite
- **Monorepo**: Both in `app-monitor/` directory

## Tasks

### Part 1: Backend Development Infrastructure (1 hour)

#### 1.1 ESLint Configuration

- [ ] Create `backend/.eslintrc.cjs` with TypeScript rules
- [ ] Use `@typescript-eslint/recommended` preset
- [ ] Add Node.js/Express-specific rules
- [ ] Configure to ignore build output (`dist/`)
- [ ] Add lint scripts to `backend/package.json`

#### 1.2 TypeScript Configuration

- [ ] Verify `backend/tsconfig.json` is properly configured
- [ ] Enable strict mode
- [ ] Set proper module resolution (Node16)
- [ ] Configure output directory (dist/)
- [ ] Add type checking script

#### 1.3 Testing Setup (Jest)

- [ ] Install Jest + ts-jest
- [ ] Create `backend/jest.config.js`
- [ ] Set up test directory structure
- [ ] Add test scripts to package.json
- [ ] Create example test for ProcessManager

#### 1.4 Prettier Configuration

- [ ] Create `backend/.prettierrc` with formatting rules
- [ ] Add `.prettierignore` for build outputs
- [ ] Add format scripts to package.json

#### 1.5 Nodemon for Development

- [ ] Create `backend/nodemon.json` configuration
- [ ] Configure to watch TypeScript files
- [ ] Set up automatic restart on changes
- [ ] Add dev script using nodemon

### Part 2: Frontend Development Infrastructure (1 hour)

#### 2.1 ESLint Configuration

- [ ] Create `frontend/.eslintrc.cjs` with React rules
- [ ] Use `@typescript-eslint/recommended`
- [ ] Add `eslint-plugin-react-hooks`
- [ ] Add `eslint-plugin-react-refresh`
- [ ] Configure to ignore dist/

#### 2.2 Prettier Configuration

- [ ] Create `frontend/.prettierrc`
- [ ] Ensure consistency with backend config
- [ ] Add `.prettierignore`

#### 2.3 Testing Setup (Vitest)

- [ ] Install Vitest + @testing-library/react
- [ ] Create `frontend/vitest.config.ts`
- [ ] Set up jsdom environment for React testing
- [ ] Add test scripts to package.json
- [ ] Create example component test

#### 2.4 TypeScript Configuration

- [ ] Verify `frontend/tsconfig.json` is Vite-compatible
- [ ] Enable strict mode
- [ ] Configure React JSX transform
- [ ] Add type checking script

### Part 3: Git Hooks (30 min)

#### 3.1 Husky Setup

- [ ] Install Husky in root or both directories
- [ ] Create `.husky/` directory
- [ ] Add prepare script to package.json

#### 3.2 Pre-commit Hook

- [ ] Create `.husky/pre-commit`
- [ ] Run lint-staged for staged files
- [ ] Backend: ESLint + Prettier check
- [ ] Frontend: ESLint + Prettier check
- [ ] Configure lint-staged in package.json

#### 3.3 Pre-push Hook

- [ ] Create `.husky/pre-push`
- [ ] Run TypeScript type checking
- [ ] Run tests (or at least critical tests)
- [ ] Ensure hooks work in both directories

### Part 4: CI/CD Workflows (30-60 min)

#### 4.1 Quality Checks Workflow

- [ ] Create `.github/workflows/app-monitor-ci.yml`
- [ ] Trigger on push to main/staging
- [ ] Trigger on PRs
- [ ] Separate jobs for backend and frontend

#### 4.2 Backend CI Job

- [ ] Setup Node.js 20
- [ ] Install dependencies
- [ ] Run ESLint
- [ ] Run TypeScript type check
- [ ] Run tests
- [ ] Build TypeScript

#### 4.3 Frontend CI Job

- [ ] Setup Node.js 20
- [ ] Install dependencies
- [ ] Run ESLint
- [ ] Run TypeScript type check
- [ ] Run tests
- [ ] Build Vite app

#### 4.4 Optimization

- [ ] Add dependency caching
- [ ] Run backend and frontend jobs in parallel
- [ ] Upload build artifacts (optional)

### Part 5: Documentation & Scripts (30 min)

#### 5.1 Development Scripts

- [ ] Add root `package.json` with workspace scripts
- [ ] `npm run dev` - Start both backend and frontend
- [ ] `npm run lint` - Lint both
- [ ] `npm run test` - Test both
- [ ] `npm run build` - Build both

#### 5.2 Documentation

- [ ] Update `app-monitor/README.md` with dev setup
- [ ] Document how to run tests
- [ ] Document linting and formatting
- [ ] Document git hooks
- [ ] Add troubleshooting section

#### 5.3 VS Code Configuration (Optional)

- [ ] Create `.vscode/settings.json`
- [ ] Configure ESLint auto-fix on save
- [ ] Configure Prettier as formatter
- [ ] Add recommended extensions

## Proposed File Structure

```
app-monitor/
├── .github/
│   └── workflows/
│       └── app-monitor-ci.yml          # CI/CD workflow
├── backend/
│   ├── src/
│   ├── tests/
│   │   └── services/
│   │       └── processManager.test.ts  # Example test
│   ├── .eslintrc.cjs                   # ESLint config
│   ├── .prettierrc                     # Prettier config
│   ├── jest.config.js                  # Jest config
│   ├── nodemon.json                    # Nodemon config
│   ├── tsconfig.json                   # TypeScript config
│   └── package.json                    # Scripts and deps
├── frontend/
│   ├── src/
│   ├── tests/
│   │   └── components/
│   │       └── ServicePanel.test.tsx   # Example test
│   ├── .eslintrc.cjs                   # ESLint config
│   ├── .prettierrc                     # Prettier config
│   ├── vitest.config.ts                # Vitest config
│   ├── tsconfig.json                   # TypeScript config
│   └── package.json                    # Scripts and deps
├── .husky/
│   ├── pre-commit                      # Pre-commit hook
│   └── pre-push                        # Pre-push hook
├── .vscode/
│   ├── settings.json                   # VS Code settings
│   └── extensions.json                 # Recommended extensions
├── package.json                        # Root workspace scripts
└── README.md                           # Updated with dev info
```

## Configuration Examples

### Backend ESLint (.eslintrc.cjs)

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

### Frontend ESLint (.eslintrc.cjs)

```javascript
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: ["react-refresh", "@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  rules: {
    "react-refresh/only-export-components": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
  ignorePatterns: ["dist", "node_modules"],
};
```

### Backend Jest Config (jest.config.js)

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
```

### Frontend Vitest Config (vitest.config.ts)

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/"],
    },
  },
});
```

### Root package.json (workspace scripts)

```json
{
  "name": "app-monitor-root",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "lint": "npm run lint:backend && npm run lint:frontend",
    "lint:backend": "cd backend && npm run lint",
    "lint:frontend": "cd frontend && npm run lint",
    "test": "npm run test:backend && npm run test:frontend",
    "test:backend": "cd backend && npm test",
    "test:frontend": "cd frontend && npm test",
    "build": "npm run build:backend && npm run build:frontend",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "type-check": "npm run type-check:backend && npm run type-check:frontend",
    "type-check:backend": "cd backend && npm run type-check",
    "type-check:frontend": "cd frontend && npm run type-check",
    "prepare": "husky install"
  },
  "devDependencies": {
    "concurrently": "^8.2.2",
    "husky": "^8.0.3",
    "lint-staged": "^15.2.0"
  }
}
```

### CI Workflow (app-monitor-ci.yml)

```yaml
name: App Monitor CI

on:
  push:
    branches: [main, staging]
    paths:
      - "app-monitor/**"
  pull_request:
    branches: [main, staging]
    paths:
      - "app-monitor/**"

jobs:
  backend:
    name: Backend Quality Checks
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app-monitor/backend

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: app-monitor/backend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

  frontend:
    name: Frontend Quality Checks
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app-monitor/frontend

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: app-monitor/frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
```

## Acceptance Criteria

### Backend

- [ ] ESLint runs without errors on `npm run lint`
- [ ] TypeScript compiles without errors on `npm run type-check`
- [ ] Tests run successfully on `npm test`
- [ ] Build completes successfully on `npm run build`
- [ ] Nodemon restarts on file changes in dev mode

### Frontend

- [ ] ESLint runs without errors on `npm run lint`
- [ ] TypeScript compiles without errors on `npm run type-check`
- [ ] Tests run successfully on `npm test`
- [ ] Build completes successfully on `npm run build`
- [ ] Vite HMR works in dev mode

### Git Hooks

- [ ] Pre-commit hook runs linting on staged files
- [ ] Pre-commit hook prevents commit if linting fails
- [ ] Pre-push hook runs type checking
- [ ] Pre-push hook runs tests
- [ ] Pre-push hook prevents push if checks fail

### CI/CD

- [ ] Workflow triggers on push to main/staging
- [ ] Workflow triggers on PRs
- [ ] Backend and frontend jobs run in parallel
- [ ] All quality checks pass
- [ ] Build artifacts are created

### Documentation

- [ ] README updated with dev setup instructions
- [ ] All scripts documented
- [ ] Troubleshooting guide included

## Testing Plan

### Manual Testing

1. **Backend**:
   - Run `npm run lint` - should pass
   - Run `npm run type-check` - should pass
   - Run `npm test` - should pass
   - Run `npm run dev` - should start server
   - Make a linting error - pre-commit should block
   - Fix error and commit - should succeed

2. **Frontend**:
   - Run `npm run lint` - should pass
   - Run `npm run type-check` - should pass
   - Run `npm test` - should pass
   - Run `npm run dev` - should start Vite
   - Make a linting error - pre-commit should block
   - Fix error and commit - should succeed

3. **CI/CD**:
   - Push to feature branch - workflow should trigger
   - Create PR - workflow should trigger
   - Verify both backend and frontend jobs run
   - Verify all checks pass

## Dependencies Installation

### Backend

```bash
cd app-monitor/backend

# Core dependencies (already installed via APP-MONITOR-1)
# npm install express cors socket.io ws

# Dev dependencies
npm install --save-dev \
  @types/express \
  @types/cors \
  @types/node \
  @types/ws \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint \
  typescript \
  nodemon \
  tsx \
  jest \
  ts-jest \
  @types/jest \
  prettier
```

### Frontend

```bash
cd app-monitor/frontend

# Core dependencies (already installed via APP-MONITOR-1)
# npm install react react-dom axios socket.io-client

# Dev dependencies
npm install --save-dev \
  @types/react \
  @types/react-dom \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  @vitejs/plugin-react \
  eslint \
  eslint-plugin-react-hooks \
  eslint-plugin-react-refresh \
  typescript \
  vitest \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  jsdom \
  prettier
```

### Root

```bash
npm install --save-dev \
  concurrently \
  husky \
  lint-staged
```

## Notes

- This sets up the foundation for quality development
- Configurations are strict but can be adjusted as needed
- Git hooks enforce quality locally before CI runs
- CI workflow ensures quality on all branches
- Example tests provided as starting points
- Consider adding code coverage badges later
- May want to add Prettier ESLint integration
- VS Code configuration is optional but recommended

## Related Issues

- APP-MONITOR-1 (must complete first - basic project structure)
- APP-MONITOR-2 (will benefit from testing infrastructure)
- APP-MONITOR-3 (will benefit from testing infrastructure)
