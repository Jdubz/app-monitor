# Safe Test Runner Implementation - app-monitor

## Summary

Implemented safe test runner pattern for app-monitor workspace to prevent OOM/heap overflow issues.

## Changes Made

### 1. Created Safe Test Runners (Already Existed as .cjs)

**app-monitor/backend/safe-test-runner.cjs** ✅

- Process locking to prevent concurrent test runs
- Memory monitoring (2GB max)
- Execution time limits (10 minutes)
- Automatic cleanup on SIGINT/SIGTERM
- Resource monitoring every 30 seconds

**app-monitor/frontend/safe-test-runner.cjs** ✅

- Same pattern as backend
- Includes `--no-isolate` flag for frontend tests

### 2. Verified Package.json Scripts (Already Configured)

**app-monitor/backend/package.json** ✅

```json
"test": "node safe-test-runner.cjs",
"test:unsafe": "NODE_OPTIONS='--max-old-space-size=2048' vitest run --no-coverage --reporter=verbose"
```

**app-monitor/frontend/package.json** ✅

```json
"test": "node safe-test-runner.cjs",
"test:unsafe": "NODE_OPTIONS='--max-old-space-size=2048' vitest run --no-coverage --reporter=verbose --no-isolate"
```

### 3. Updated Root vitest.config.ts

Added explicit `poolOptions` configuration:

```typescript
poolOptions: {
  forks: {
    maxForks: 1,  // ONLY 1 process at a time
    minForks: 1,
  },
}
```

## Existing Configurations (Already Safe)

### app-monitor/backend/vitest.config.ts ✅

- pool: 'forks'
- maxForks: 1
- minForks: 1
- fileParallelism: false
- testTimeout: 30000

### app-monitor/frontend/vitest.config.ts ✅

- pool: 'forks'
- maxForks: 1
- minForks: 1
- fileParallelism: false
- testTimeout: 30000

## No Memory Issues Found

System check shows healthy memory state:

- Total: 62Gi
- Used: 7.3Gi
- Available: 55Gi
- No OOM kills in recent logs

## Interval Management ✅

Verified that `claudeWorkersManager.ts` properly cleans up intervals:

- `healthCheckInterval` - cleared on shutdown
- `cleanupInterval` - cleared on shutdown
- All other intervals have proper cleanup

## Usage

```bash
# Safe (default)
cd app-monitor/backend && npm test
cd app-monitor/frontend && npm test

# Unsafe (for debugging only)
cd app-monitor/backend && npm run test:unsafe
cd app-monitor/frontend && npm run test:unsafe
```

## Lock Files

Lock files prevent concurrent test runs:

- `app-monitor/backend/.test-lock`
- `app-monitor/frontend/.test-lock`

Lock files automatically removed:

- On successful completion
- After 15 minutes (stale lock)
- On SIGINT/SIGTERM

## Crash Analysis

No evidence of OOM/heap issues:

- System memory healthy (55Gi available)
- No OOM kills in system logs
- All intervals properly cleaned up
- Test parallelism properly limited
- Memory limits enforced (2GB max)

The safe test runner implementation matches the pattern used in other repos (job-finder-BE, job-finder-FE, job-finder-worker) and should prevent any future test explosion issues.
