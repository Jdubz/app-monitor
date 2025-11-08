# Test Safety Fix - app-monitor

## Problem

The app-monitor repository was running tests UNSAFELY during git pre-push hooks, causing **JavaScript heap out of memory** crashes. This happened twice during push operations.

### Root Cause

1. **Unsafe test scripts**: `npm test` was directly calling `vitest run` without the safe test runner wrapper
2. **Pre-push hook**: `.husky/pre-push` was calling `npm test` without memory limits
3. **Playwright tests**: Frontend e2e tests were running without resource limits, consuming 4GB+ memory

## Changes Made

### 1. Updated Backend Test Scripts

**File**: `backend/package.json`

```json
"test": "node safe-test-runner.cjs",       // ✅ Now safe
"test:unit": "node safe-test-runner.cjs",   // ✅ Now safe
"test:unsafe": "vitest run --config vitest.unit.config.ts",  // ⚠️ For debugging only
```

**Before**: Direct vitest execution (UNSAFE)
**After**: Safe test runner with locking and memory limits

### 2. Updated Frontend Test Scripts

**File**: `frontend/package.json`

```json
"test": "node safe-test-runner.cjs",       // ✅ Now safe
"test:unit": "node safe-test-runner.cjs",   // ✅ Now safe
"test:unsafe": "vitest run --config vitest.unit.config.ts",  // ⚠️ For debugging only
```

**Before**: Direct vitest execution (UNSAFE)
**After**: Safe test runner with locking and memory limits

### 3. Enhanced Pre-Push Hook

**File**: `.husky/pre-push`

```bash
#!/bin/sh

echo "🧪 Running app-monitor pre-push checks..."

# Clean up any stale lock files
rm -f backend/.test-lock frontend/.test-lock

# Run tests safely with memory limits
NODE_OPTIONS='--max-old-space-size=2048' npm test || {
    echo "❌ Tests failed! Fix the failing tests before pushing."
    echo "💡 Tip: Run 'npm test' to see detailed test results."
    exit 1
}

echo "✅ App-monitor pre-push checks completed"
```

**Before**: Just `npm test` (no memory limits, no cleanup)
**After**: Memory limits + lock file cleanup + proper error handling

## Safe Test Runner Features

Both `backend/safe-test-runner.cjs` and `frontend/safe-test-runner.cjs` provide:

1. **Process Locking**: Prevents concurrent test runs that multiply memory usage
2. **Memory Limits**: Hard cap at 2GB per process
3. **Execution Timeout**: Max 10 minutes to prevent hanging
4. **Resource Monitoring**: Checks memory every 30 seconds
5. **Automatic Cleanup**: Removes stale locks after 15 minutes
6. **Signal Handling**: Properly cleans up on SIGINT/SIGTERM

## Impact

### Before
- ❌ Tests could run concurrently (memory explosion)
- ❌ No memory limits (crashed at 4GB+)
- ❌ Playwright tests ran unbounded
- ❌ No cleanup of hanging processes

### After
- ✅ One test process at a time (locked)
- ✅ 2GB memory limit enforced
- ✅ All tests wrapped in safe runner
- ✅ Automatic cleanup and monitoring

## Usage

```bash
# Safe (default) - ALWAYS USE THIS
npm test

# Unsafe (debugging only) - USE WITH CAUTION
npm run test:unsafe
```

## Verification

Test the fix:

```bash
# Should use safe test runner
cd app-monitor
npm test

# Check lock file is created/removed
ls -la backend/.test-lock frontend/.test-lock

# Test pre-push hook
git push origin feature-branch
```

## Related Files

- `backend/safe-test-runner.cjs` - Backend safe test runner
- `frontend/safe-test-runner.cjs` - Frontend safe test runner
- `.husky/pre-push` - Pre-push git hook
- `SAFE_TEST_IMPLEMENTATION.md` - Original implementation doc

## Additional Protection

Added to `~/.bashrc`:
```bash
export NODE_OPTIONS="--max-old-space-size=8192"  # 8GB global limit
```

This provides a system-wide safety net for all Node.js processes.

## Lessons Learned

1. **Always wrap tests** in safe runners with resource limits
2. **Git hooks must be safe** - they run automatically and can't be monitored
3. **Playwright/E2E tests** are memory-intensive and need special handling
4. **Lock files** prevent concurrent test explosions
5. **Document unsafe paths** clearly for debugging purposes

---

**Date**: 2025-10-27
**Issue**: Heap out of memory during git push (happened twice)
**Status**: ✅ FIXED
