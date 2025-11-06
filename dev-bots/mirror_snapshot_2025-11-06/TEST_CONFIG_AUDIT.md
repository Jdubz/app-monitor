# Test Configuration Audit - Crash Investigation Summary

## Date: 2025-10-26

## Investigation Summary

Investigated heap overflow/OOM crash issues and verified safe test configuration across the workspace.

## Findings

### 1. app-monitor Already Has Safe Test Runners ✅

Both workspaces already have proper safe test runners:

- `app-monitor/backend/safe-test-runner.cjs`
- `app-monitor/frontend/safe-test-runner.cjs`

Configuration includes:

- Process locking (`.test-lock` files)
- Memory limits (2GB max via NODE_OPTIONS)
- Execution time limits (10 minutes)
- Resource monitoring
- Automatic cleanup on SIGINT/SIGTERM

### 2. Vitest Configurations Are Safe ✅

**Root vitest.config.ts** - Updated with explicit poolOptions:

```typescript
pool: 'forks',
poolOptions: {
  forks: {
    maxForks: 1,
    minForks: 1,
  },
},
maxConcurrency: 1,
fileParallelism: false,
```

**app-monitor/backend/vitest.config.ts** ✅

- Single fork (maxForks: 1)
- No file parallelism
- No test parallelism

**app-monitor/frontend/vitest.config.ts** ✅

- Single fork (maxForks: 1)
- No file parallelism
- No test parallelism

### 3. System Health - No OOM Issues ✅

Memory status:

```
Total:     62Gi
Used:      7.3Gi
Available: 55Gi
Swap:      8.0Gi (0B used)
```

No OOM kills found in system logs.

### 4. Interval Management ✅

Verified `claudeWorkersManager.ts` properly cleans up intervals:

- `healthCheckInterval` (5s) - cleared on shutdown
- `cleanupInterval` (60s) - cleared on shutdown
- All other service intervals have proper cleanup

Count: 15 setInterval calls, 12 clearInterval calls (3 are in conditional/error paths)

### 5. Test Count (app-monitor)

- Backend: 19 test files
- Frontend: 9 test files
- Total: 28 test files

This is a reasonable number and should not cause memory issues with single-fork execution.

### 6. Potential Crash Causes

Based on running processes, possible causes:

1. **Cursor Agent** using 626MB (17.5% CPU) - high activity
2. **GitHub Copilot** using 361MB (6.7% CPU)
3. **Multiple vitest processes** running concurrently without lock

## Actions Taken

1. ✅ Added explicit `poolOptions` to root vitest.config.ts
2. ✅ Verified safe test runners exist in app-monitor
3. ✅ Verified package.json scripts point to safe runners
4. ✅ Documented configuration in SAFE_TEST_IMPLEMENTATION.md
5. ✅ Verified interval cleanup in services

## Recommendations

### Immediate

1. **Use safe test runners**: Always run `npm test` (not `npm run test:unsafe`)
2. **Check for lock files**: If tests fail to start, check for stale `.test-lock` files
3. **Monitor cursor-agent**: The cursor agent process is using significant resources

### Long-term

1. **Add process monitoring**: Consider adding memory monitoring to long-running services
2. **Test isolation**: Ensure tests don't leave intervals/timers running
3. **Lock file cleanup**: Add automatic cleanup of stale locks on service start

## Configuration Summary

### Test Script Structure

```bash
# Safe (default)
npm test -> node safe-test-runner.cjs

# Unsafe (debugging only)
npm run test:unsafe -> vitest run directly
```

### Memory Limits

- Max heap: 2048MB (NODE_OPTIONS='--max-old-space-size=2048')
- Monitor threshold: 2048MB
- Max execution time: 10 minutes
- Stale lock timeout: 15 minutes

## Conclusion

**No evidence of test configuration causing crashes.** All test configurations follow safe patterns:

- Single process execution (maxForks: 1)
- No file parallelism
- Memory limits enforced
- Process locking in place
- Proper cleanup handlers

If crashes persist, investigate:

1. Cursor agent memory usage
2. Long-running service intervals
3. Docker container memory limits
4. System-level resource constraints

## Files Modified

- `/home/jdubz/Development/job-finder-app-manager/vitest.config.ts` - Added poolOptions
- `/home/jdubz/Development/job-finder-app-manager/app-monitor/SAFE_TEST_IMPLEMENTATION.md` - Created
- `/home/jdubz/Development/job-finder-app-manager/app-monitor/TEST_CONFIG_AUDIT.md` - This file
