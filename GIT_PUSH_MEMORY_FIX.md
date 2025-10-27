# Git Push Memory Issue Fix

## Problem

The app-monitor was crashing with a heap out of memory error during `git push` operations:

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

## Root Cause

The pre-push hook was running `npm test` which executed tests for ALL workspaces:
- backend (unit tests)
- frontend (unit tests)  
- dev-bots (Playwright E2E tests)

Running all three test suites simultaneously, especially the memory-intensive Playwright E2E tests, exceeded the Node.js heap limit during the git push operation.

## Solution

Modified `.husky/pre-push` to run only backend and frontend tests, skipping the dev-bots E2E tests:

```bash
# Before (caused crash):
NODE_OPTIONS='--max-old-space-size=2048' npm test

# After (fixed):
NODE_OPTIONS='--max-old-space-size=2048' npm run test:backend
NODE_OPTIONS='--max-old-space-size=2048' npm run test:frontend
```

## Rationale

1. **E2E tests are not suitable for pre-push hooks:**
   - Too slow (can take minutes)
   - Too resource-intensive (memory, CPU)
   - Better suited for CI/CD pipelines

2. **Unit tests are ideal for pre-push hooks:**
   - Fast (seconds)
   - Lightweight (minimal memory)
   - Catch most issues early

3. **Separation of concerns:**
   - `npm test` - Runs ALL tests (for CI/CD)
   - `npm run test:quick` - Runs only backend + frontend (for local dev)
   - Pre-push hook - Uses `test:quick` approach

## Testing

After applying this fix, you can now safely push from the app-monitor directory:

```bash
cd /home/jdubz/Development/job-finder-app-manager/app-monitor
git push origin staging
```

The pre-push hook will run backend and frontend tests without causing memory issues.

## Additional Scripts

Added `test:quick` script to package.json for convenience:

```json
{
  "scripts": {
    "test": "npm run test --workspaces",         // All tests (including E2E)
    "test:quick": "npm run test:backend && npm run test:frontend",  // Quick tests
    "test:backend": "npm run test -w backend",
    "test:frontend": "npm run test -w frontend"
  }
}
```

## Date

2025-10-27
