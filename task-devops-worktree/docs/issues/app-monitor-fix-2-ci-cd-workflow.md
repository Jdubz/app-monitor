# APP-MONITOR-FIX-2 — Add CI/CD Workflow (OPTIONAL)

- **Status**: To Do
- **Owner**: Worker B (or PM)
- **Priority**: P3 (Low - Optional for Local Tool)
- **Labels**: priority-p3, app-monitor, type-feature, ci-cd, optional
- **Estimated Effort**: 1 hour
- **Dependencies**: APP-MONITOR-FIX-1 (backend ESLint must work first)
- **Related**: APP-MONITOR-SETUP Part 4 (partially addresses)

## Important Context

⚠️ **App Monitor is a LOCAL DEVELOPMENT TOOL ONLY** - It will never be deployed to staging or production. This is for running local development processes only.

Given this context, **CI/CD is OPTIONAL** and low priority. It provides some value for code quality but is not critical for a local-only tool.

## What This Issue Covers

Create GitHub Actions workflow to run automated quality checks on app-monitor code. This is **optional** for a local development tool but can help maintain code quality if multiple developers work on it.

## Context

**Current State**: Zero automated checks

- No workflow file exists (`.github/workflows/app-monitor-ci.yml`)
- Can push broken code without detection
- Can merge PRs with TypeScript errors
- No quality gates before deployment

**Risk**: High

- Can break app-monitor with no warning
- No verification that changes work
- TypeScript errors slip through
- Lint violations go unnoticed

**Solution**: Add workflow that runs:

- ESLint (backend + frontend)
- TypeScript type checking
- Build verification
- (Tests when added later)

## Tasks

### 1. Create Workflow File

- [ ] Create `.github/workflows/app-monitor-ci.yml`
- [ ] Configure triggers (push to main/staging, PRs)
- [ ] Add path filtering (only run when app-monitor changes)

### 2. Backend Quality Job

- [ ] Setup Node.js 20
- [ ] Install backend dependencies
- [ ] Run ESLint
- [ ] Run TypeScript type-check
- [ ] Build TypeScript (verify compilation)
- [ ] Cache dependencies for faster runs

### 3. Frontend Quality Job

- [ ] Setup Node.js 20
- [ ] Install frontend dependencies
- [ ] Run ESLint
- [ ] Run TypeScript type-check
- [ ] Build with Vite
- [ ] Cache dependencies for faster runs

### 4. Optimize Workflow

- [ ] Run backend and frontend jobs in parallel
- [ ] Use npm caching for speed
- [ ] Add job summaries for visibility
- [ ] Test workflow on feature branch

## Proposed Workflow

### .github/workflows/app-monitor-ci.yml

```yaml
name: App Monitor CI

on:
  push:
    branches: [main, staging]
    paths:
      - "app-monitor/**"
      - ".github/workflows/app-monitor-ci.yml"
  pull_request:
    branches: [main, staging]
    paths:
      - "app-monitor/**"
      - ".github/workflows/app-monitor-ci.yml"

jobs:
  backend:
    name: Backend Quality Checks
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app-monitor/backend

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
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Build
        run: npm run build

      - name: Quality Summary
        if: always()
        run: |
          echo "## Backend Quality Checks ✅" >> $GITHUB_STEP_SUMMARY
          echo "- ESLint passed" >> $GITHUB_STEP_SUMMARY
          echo "- TypeScript type-check passed" >> $GITHUB_STEP_SUMMARY
          echo "- Build succeeded" >> $GITHUB_STEP_SUMMARY

  frontend:
    name: Frontend Quality Checks
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app-monitor/frontend

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
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Build
        run: npm run build

      - name: Quality Summary
        if: always()
        run: |
          echo "## Frontend Quality Checks ✅" >> $GITHUB_STEP_SUMMARY
          echo "- ESLint passed" >> $GITHUB_STEP_SUMMARY
          echo "- TypeScript type-check passed" >> $GITHUB_STEP_SUMMARY
          echo "- Build succeeded" >> $GITHUB_STEP_SUMMARY
```

## Additional Scripts Needed

### Frontend package.json

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "type-check": "tsc --noEmit" // ⭐ ADD THIS
  }
}
```

## Acceptance Criteria

- [ ] Workflow file exists at `.github/workflows/app-monitor-ci.yml`
- [ ] Workflow triggers on push to main/staging
- [ ] Workflow triggers on PRs to main/staging
- [ ] Workflow only runs when app-monitor files change
- [ ] Backend job runs ESLint, type-check, and build
- [ ] Frontend job runs ESLint, type-check, and build
- [ ] Both jobs run in parallel
- [ ] Dependencies are cached for speed
- [ ] Failed checks block PR merges
- [ ] Workflow completes in < 5 minutes

## Benefits

- **Quality gates**: Cannot merge broken code
- **Early detection**: Catch issues before review
- **Consistency**: Same checks every time
- **Confidence**: Know changes don't break build
- **Documentation**: CI logs show what passed/failed
- **Speed**: Parallel jobs + caching = fast feedback

## Testing Plan

1. Create feature branch: `feature/add-app-monitor-ci`
2. Add workflow file with proposed config
3. Add `type-check` scripts to both package.json files
4. Push to feature branch
5. Verify workflow triggers
6. Check both jobs run in parallel
7. Verify all checks pass
8. Intentionally break linting:
   - Add unused variable to backend
   - Push and verify CI fails
9. Fix error, verify CI passes
10. Create PR to staging
11. Verify PR shows CI status
12. Merge to staging

## Performance Expectations

| Phase                  | Time         | Notes                 |
| ---------------------- | ------------ | --------------------- |
| Checkout               | ~5s          | Fast                  |
| Setup Node + cache hit | ~10s         | With npm cache        |
| Install dependencies   | ~20s         | First run, ~5s cached |
| Lint                   | ~5s          | Both jobs             |
| Type check             | ~10s         | Both jobs             |
| Build                  | ~15s         | Both jobs             |
| **Total**              | **~1-2 min** | In parallel           |

## Notes

- This is the **minimum viable CI/CD** for app-monitor
- No tests yet (will add in APP-MONITOR-FIX-5)
- Path filtering prevents unnecessary runs
- Mirrors pattern from FE/BE/Worker repos
- After this, app-monitor has same safety as other repos

## Future Enhancements (Separate Issues)

- Add test job when tests are written
- Add coverage reporting
- Add artifact upload for build outputs
- Add deployment workflow (if needed)

## Related Issues

- APP-MONITOR-FIX-1: Backend ESLint config (prerequisite)
- APP-MONITOR-FIX-3: Git hooks (will complement CI)
- APP-MONITOR-FIX-5: Testing (will extend CI)
- APP-MONITOR-SETUP: Original comprehensive infrastructure issue
