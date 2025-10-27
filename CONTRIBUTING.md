# Contributing to App Monitor

## Development Setup

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Initial Setup
```bash
npm install
npm run install:all
```

## Git Hooks

This repository uses [Husky](https://typicode.github.io/husky/) for git hooks to maintain code quality.

### Pre-commit Hook
Automatically runs **linting** on staged files before each commit:
- Backend TypeScript files are linted with ESLint
- Frontend TypeScript/TSX files are linted with ESLint
- Linting errors will prevent the commit

### Pre-push Hook
Automatically runs **all unit tests** before pushing:
- Backend tests (vitest)
- Frontend tests (vitest)
- Test failures will prevent the push

### Bypassing Hooks
If you need to bypass hooks (use sparingly):
```bash
# Skip pre-commit hook
git commit --no-verify

# Skip pre-push hook
git push --no-verify
```

## CI/CD Pipeline

GitHub Actions automatically runs on:
- Pull requests to `main` branch

### CI Jobs
1. **Frontend Tests** - Linting, unit tests (Node 18.x, 20.x)
2. **Backend Tests** - Linting, unit tests (Node 18.x, 20.x)

## Scripts

### Development
```bash
npm run dev              # Start both frontend and backend
npm run dev:frontend     # Start frontend only
npm run dev:backend      # Start backend only
```

### Testing
```bash
npm test                 # Run all tests
npm run test:frontend    # Frontend unit tests
npm run test:backend     # Backend unit tests
```

### Linting
```bash
npm run lint             # Lint all workspaces
npm run lint:fix         # Auto-fix linting issues
```

### Building
```bash
npm run build            # Build all workspaces
npm run build:frontend   # Build frontend only
npm run build:backend    # Build backend only
```

## Code Style

- TypeScript for all code
- ESLint for linting
- Functional programming patterns preferred
- Write tests for new features
