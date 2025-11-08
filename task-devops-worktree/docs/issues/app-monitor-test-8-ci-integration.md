# APP-MONITOR-TEST-8: CI Integration and Coverage Enforcement

**Priority:** P2 (Medium)  
**Type:** CI/CD  
**Effort:** 0.5 days  
**Parent:** APP-MONITOR-TEST-1  
**Depends On:** APP-MONITOR-TEST-2, APP-MONITOR-TEST-5  
**Repository:** job-finder-app-manager (app-monitor/)

## Problem Statement

App Monitor tests run locally but not in CI, providing no protection against regressions. Need GitHub Actions workflow to run tests on every PR and enforce coverage thresholds.

## Goal

Create GitHub Actions workflow for app-monitor that runs tests on both frontend and backend, enforces 50% coverage minimum, and blocks PRs that reduce coverage.

## Scope

### CI Workflow

- ✅ Run backend tests on every PR
- ✅ Run frontend tests on every PR
- ✅ Generate coverage reports
- ✅ Enforce coverage thresholds
- ✅ Upload coverage to artifacts
- ✅ Comment coverage report on PRs

### Pre-commit Hooks

- ✅ Run tests before commit (app-monitor changes only)
- ✅ Check coverage thresholds
- ✅ Run linting

### Coverage Reporting

- ✅ Generate HTML coverage reports
- ✅ Export coverage for PR comments
- ✅ Track coverage trends over time

## Acceptance Criteria

### Must Have

- [ ] GitHub Actions workflow created
- [ ] Tests run on every PR affecting app-monitor
- [ ] Coverage thresholds enforced (50% minimum)
- [ ] PRs blocked if tests fail
- [ ] PRs blocked if coverage decreases
- [ ] Coverage reports accessible in CI

### Should Have

- [ ] Coverage trends tracked
- [ ] PR comments with coverage summary
- [ ] Separate jobs for backend/frontend
- [ ] Parallel test execution

## Implementation Details

### GitHub Actions Workflow

**File:** `.github/workflows/app-monitor-tests.yml`

```yaml
name: App Monitor Tests

on:
  pull_request:
    paths:
      - "app-monitor/**"
      - ".github/workflows/app-monitor-tests.yml"
  push:
    branches:
      - staging
      - main
    paths:
      - "app-monitor/**"

jobs:
  test-backend:
    name: Test Backend
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: app-monitor/backend/package-lock.json

      - name: Install dependencies
        run: |
          cd app-monitor/backend
          npm ci

      - name: Run tests with coverage
        run: |
          cd app-monitor/backend
          npm run test:ci

      - name: Check coverage thresholds
        run: |
          cd app-monitor/backend
          npm run test:coverage -- --passWithNoTests

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: backend-coverage
          path: app-monitor/backend/coverage/

      - name: Comment coverage on PR
        if: github.event_name == 'pull_request'
        uses: romeovs/lcov-reporter-action@v0.3.1
        with:
          lcov-file: app-monitor/backend/coverage/lcov.info
          github-token: ${{ secrets.GITHUB_TOKEN }}

  test-frontend:
    name: Test Frontend
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: app-monitor/frontend/package-lock.json

      - name: Install dependencies
        run: |
          cd app-monitor/frontend
          npm ci

      - name: Run tests with coverage
        run: |
          cd app-monitor/frontend
          npm run test:ci

      - name: Check coverage thresholds
        run: |
          cd app-monitor/frontend
          npm run test:coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: frontend-coverage
          path: app-monitor/frontend/coverage/

      - name: Comment coverage on PR
        if: github.event_name == 'pull_request'
        uses: romeovs/lcov-reporter-action@v0.3.1
        with:
          lcov-file: app-monitor/frontend/coverage/lcov.info
          github-token: ${{ secrets.GITHUB_TOKEN }}

  build-check:
    name: Build Check
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Build backend
        run: |
          cd app-monitor/backend
          npm ci
          npm run build

      - name: Build frontend
        run: |
          cd app-monitor/frontend
          npm ci
          npm run build
```

### Pre-commit Hook

**File:** `.husky/pre-commit` (update existing)

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Check if app-monitor files were changed
if git diff --cached --name-only | grep -q '^app-monitor/'; then
  echo "🧪 Running app-monitor tests..."

  # Backend tests
  if git diff --cached --name-only | grep -q '^app-monitor/backend/'; then
    echo "  Backend..."
    cd app-monitor/backend
    npm test || {
      echo "❌ Backend tests failed"
      exit 1
    }
    cd ../..
  fi

  # Frontend tests
  if git diff --cached --name-only | grep -q '^app-monitor/frontend/'; then
    echo "  Frontend..."
    cd app-monitor/frontend
    npm test run || {
      echo "❌ Frontend tests failed"
      exit 1
    }
    cd ../..
  fi

  echo "✅ App Monitor tests passed"
fi
```

### Coverage Badge (Optional)

Add to `app-monitor/README.md`:

```markdown
## Test Coverage

![Backend Coverage](https://img.shields.io/badge/Backend%20Coverage-52%25-green)
![Frontend Coverage](https://img.shields.io/badge/Frontend%20Coverage-51%25-green)

- Backend: 52% (Target: ≥50%)
- Frontend: 51% (Target: ≥50%)
```

## Deliverables

- [ ] `.github/workflows/app-monitor-tests.yml` - CI workflow
- [ ] `.husky/pre-commit` - Updated with app-monitor checks
- [ ] Coverage enforcement in both test configs
- [ ] Coverage badges in README (optional)
- [ ] Documentation for running tests in CI

## Success Metrics

- ✅ CI workflow runs on every PR
- ✅ Coverage thresholds enforced (50% minimum)
- ✅ PRs blocked on test failures
- ✅ Coverage reports accessible
- ✅ Pre-commit hooks prevent broken commits

## Testing Commands

```bash
# Run tests like CI does
cd app-monitor/backend && npm run test:ci
cd app-monitor/frontend && npm run test:ci

# Check if tests would pass in CI
npm test -- --run

# Generate coverage report
npm run test:coverage
```

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vitest CI Documentation](https://vitest.dev/guide/coverage.html#coverage-on-ci)
- [Jest CI Documentation](https://jestjs.io/docs/cli#--ci)

---

**Labels:** `app-monitor`, `testing`, `ci-cd`, `priority-p2`, `infrastructure`  
**Estimated Points:** 2 (0.5 days)  
**Assignee:** TBD
