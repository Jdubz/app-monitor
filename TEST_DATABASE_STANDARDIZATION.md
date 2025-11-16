# Test Database Standardization

**Date:** 2025-11-16  
**Status:** ✅ Complete

## Problem

Tests were using inconsistent database approaches:
- Some used `new Database(':memory:')` directly
- Some used `new TaskQueueService(':memory:')`
- Some used custom helpers
- Some didn't properly clean up database connections
- Risk of tests creating file-based databases

## Solution

### 1. Global Test Environment Configuration

Added `DATABASE_PATH: ':memory:'` to `vitest.config.ts`:
```typescript
env: {
  NODE_ENV: 'test',
  DATABASE_PATH: ':memory:',  // NEW: All tests use in-memory DB by default
},
```

**Impact:** ANY code that uses `getDatabase()` or `new DevBotsDatabase()` will automatically use in-memory database in test environment.

### 2. Standard Test Helpers

All tests should use helpers from `backend/src/__tests__/testDb.ts`:

```typescript
import { createTestTaskQueue, closeTestDatabase } from '../__tests__/testDb.js';

describe('My Service', () => {
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    taskQueue = createTestTaskQueue();
  });

  afterEach(() => {
    closeTestDatabase(taskQueue);
  });
});
```

**Available Helpers:**
- `createTestDatabase()` - Raw Database instance with `:memory:`
- `createTestTaskQueue()` - TaskQueueService with `:memory:`
- `closeTestDatabase(db)` - Safe cleanup (catches errors)
- `setupTestSchema(db, schema)` - Apply custom schema
- `TEST_SCHEMAS` - Common schemas for reuse

### 3. Tests Updated

Updated to use standard helpers:
- ✅ `backend/src/services/__tests__/prSync.integration.test.ts`
- ✅ `backend/src/services/workerHeartbeat.test.ts`

### 4. Specialized Helpers

Some tests need specialized helpers (these are fine):
- `context/__tests__/helpers/testDatabase.ts` - Runs context-specific migrations
- Tests using mocks instead of real DB (also fine)

## Benefits

1. **No File Cleanup**: In-memory databases disappear when closed
2. **Faster Tests**: No disk I/O
3. **CI/CD Safe**: Works in any environment
4. **Test Isolation**: Each test gets fresh database
5. **Consistent**: All tests use same approach
6. **Automatic**: Environment variable makes it default

## Verification

All 1492 tests passing after changes:
```bash
npm test
# Test Files  73 passed (73)
# Tests  1492 passed | 5 skipped (1497)
```

## Guidelines for New Tests

1. **Always use helpers from `__tests__/testDb.ts`**
2. **Never manually create file-based databases in tests**
3. **Always cleanup with `closeTestDatabase()`**
4. **If you need custom schema, use `createTestDatabaseWithSchema()`**
5. **Trust the environment variable - tests automatically use :memory:**

## Files Changed

- `backend/vitest.config.ts` - Added `DATABASE_PATH: ':memory:'` to env
- `backend/src/services/__tests__/prSync.integration.test.ts` - Use helper
- `backend/src/services/workerHeartbeat.test.ts` - New test using helper
