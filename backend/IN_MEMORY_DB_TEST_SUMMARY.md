# In-Memory Database Test Configuration Summary

## Overview

All tests in the backend have been configured to use in-memory SQLite databases (`:memory:`). This ensures:
- **No file system artifacts** - Tests don't create database files
- **Test isolation** - Each test gets a fresh database
- **CI/CD compatibility** - No file cleanup issues in CI environments
- **Performance** - In-memory databases are faster than file-based

## Changes Made

### 1. Updated Integration Tests

#### taskQueuePhase.integration.test.ts
- **Before**: Created temporary directory and file-based database
- **After**: Uses `:memory:` database
- **Impact**: No temp directory cleanup needed, faster test execution

#### phaseSystem.e2e.test.ts
- **Before**: Created temporary directory and file-based database
- **After**: Uses `:memory:` database
- **Impact**: Simplified cleanup, better test isolation

### 2. Existing In-Memory Database Usage

The following test utilities and patterns were already in place:

#### Test Utilities
- **`backend/src/__tests__/testDb.ts`**: Provides `createTestTaskQueue()` and `createTestDatabase()` helpers
- **`backend/src/services/context/__tests__/helpers/testDatabase.ts`**: Provides context-specific test database helpers

#### Test Files Already Using In-Memory DBs
- `tokenTracking.test.ts` - Uses `new DevBotsDatabase(':memory:')`
- `issueTriageService.test.ts` - Uses `new Database(':memory:')`
- `issueStorageService.test.ts` - Uses in-memory database
- `phaseExecution.service.test.ts` - Uses `:memory:` database
- All context system tests use `createTestDatabase()` helper

## Database Support for In-Memory Mode

### DevBotsDatabase
```typescript
constructor(dbPath: string = DB_PATH) {
  this.db = new Database(dbPath);
  // WAL mode doesn't work with in-memory databases
  if (dbPath !== ':memory:') {
    this.db.pragma('journal_mode = WAL');
  }
  this.initialize();
}
```

### TaskQueueService
```typescript
private initialize(): void {
  // Enable WAL mode for better concurrency (skip for in-memory databases)
  if (this.dbPath !== ':memory:') {
    this.db.pragma('journal_mode = WAL');
  }
  // ... rest of initialization
}
```

Both database classes properly handle in-memory mode by skipping WAL mode configuration.

## Test Patterns

### Pattern 1: Using Test Helpers (Recommended)
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

### Pattern 2: Direct Instantiation
```typescript
import { TaskQueueService } from './taskQueue.sqlite.js';

describe('My Service', () => {
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    taskQueue = new TaskQueueService(':memory:');
  });

  afterEach(() => {
    try {
      taskQueue.close();
    } catch (err) {
      // Ignore close errors in tests
    }
  });
});
```

### Pattern 3: DevBotsDatabase
```typescript
import { DevBotsDatabase } from './database.js';

describe('My Service', () => {
  let db: DevBotsDatabase;

  beforeEach(() => {
    db = new DevBotsDatabase(':memory:');
  });

  afterEach(() => {
    try {
      db.close();
    } catch (err) {
      // Ignore close errors in tests
    }
  });
});
```

## Verification

### Check for Database Files
```bash
# No database files should be created during test execution
find backend -name "*.db" -o -name "*.db-*"
# Should return empty
```

### Run Tests
```bash
# All tests should pass without creating files
npm test -- --run
```

### Test Isolation Check
```bash
# Run tests multiple times - no state should leak between runs
npm test -- --run && npm test -- --run
```

## Known Issues

### Segmentation Fault in Full Test Suite
- **Symptom**: Tests pass individually but full suite may segfault
- **Cause**: Likely related to SQLite database handle management when many tests run concurrently
- **Status**: Individual test files pass successfully
- **Workaround**: Run test files individually if encountering issues

## Best Practices

1. **Always use in-memory databases** for unit and integration tests
2. **Use test helpers** from `testDb.ts` for consistency
3. **Wrap database.close()** in try-catch to handle cleanup errors gracefully
4. **Reset singletons** in afterEach to ensure test isolation
5. **Avoid file-based databases** in tests to prevent cleanup issues

## Migration Checklist

When adding new tests that need a database:

- [ ] Use `:memory:` database path or test helpers
- [ ] Add proper cleanup in `afterEach` with try-catch
- [ ] Reset any singleton services
- [ ] Verify no database files are created after test run
- [ ] Ensure tests pass in isolation and in full suite

## References

- Task Queue Service: `backend/src/services/taskQueue.sqlite.ts`
- DevBots Database: `backend/src/services/database.ts`
- Test Utilities: `backend/src/__tests__/testDb.ts`
- Context Test DB: `backend/src/services/context/__tests__/helpers/testDatabase.ts`
