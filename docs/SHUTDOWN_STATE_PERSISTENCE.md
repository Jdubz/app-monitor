# Shutdown State Persistence Implementation Guide

## Overview

This document provides a complete implementation guide for persisting ephemeral state before shutdown to enable seamless recovery after restart. This is the next step after implementing near-zero-downtime deployments.

## Status

**Implementation Started:**
- ✅ `ShutdownStateManager` class created (`backend/src/services/shutdownStateManager.ts`)
- ✅ Database tables defined (retry_history, log_file_positions, circuit_breaker_states)
- ✅ `getConnection()` method added to `DevBotsDatabase` class
- ⏳ Integration with graceful shutdown pending
- ⏳ Integration with startup recovery pending

## What Was Created

### 1. ShutdownStateManager Service

**File:** `backend/src/services/shutdownStateManager.ts`

**Features:**
- Persist retry history across restarts
- Save log file positions to resume reading
- Store circuit breaker states to prevent retry storms
- Automatic cleanup of old state data (7 days)

**Database Tables Created:**

```sql
-- Retry attempt history
CREATE TABLE retry_history (
  task_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  reason TEXT,
  error TEXT,
  exit_code INTEGER,
  worker_id TEXT,
  agent_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, attempt_number)
);

-- Log file read positions
CREATE TABLE log_file_positions (
  file_path TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Circuit breaker failure states
CREATE TABLE circuit_breaker_states (
  service_name TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_failure_time INTEGER,
  state TEXT NOT NULL CHECK(state IN ('closed', 'open', 'half-open')),
  updated_at INTEGER NOT NULL
);
```

## Integration Steps

### Step 1: Update RetryManager to Use Persistence

**File:** `backend/src/services/retryManager.ts`

**Changes Needed:**

```typescript
import { ShutdownStateManager } from './shutdownStateManager.js';
import { getDatabase } from './database.js';

export class RetryManager extends EventEmitter {
  private config: RetryConfig;
  private retryHistory: Map<string, RetryAttempt[]> = new Map();
  private shutdownStateManager: ShutdownStateManager;

  constructor(config: Partial<RetryConfig> = {}) {
    super();
    this.config = { max_retries: 3, ...config };
    this.shutdownStateManager = new ShutdownStateManager(getDatabase());

    // Restore state on initialization
    this.restoreState();

    logger.info({
      category: 'process',
      action: 'manual_retrymanager_initialized',
      message: 'Manual RetryManager initialized'
    });
  }

  /**
   * Restore retry history from database
   */
  private async restoreState(): Promise<void> {
    try {
      const restoredHistory = await this.shutdownStateManager.restoreRetryHistory();
      this.retryHistory = restoredHistory;

      logger.info({
        category: 'process',
        action: 'retry_history_restored',
        message: 'Retry history restored from previous session',
        details: { taskCount: this.retryHistory.size }
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'retry_history_restore_failed',
        message: 'Failed to restore retry history',
        error
      });
    }
  }

  /**
   * Export retry history for persistence (called during shutdown)
   */
  public exportHistory(): Map<string, RetryAttempt[]> {
    return this.retryHistory;
  }

  /**
   * Import retry history (for manual restoration)
   */
  public importHistory(history: Map<string, RetryAttempt[]>): void {
    this.retryHistory = history;
    logger.info({
      category: 'process',
      action: 'retry_history_imported',
      message: 'Retry history manually imported',
      details: { taskCount: this.retryHistory.size }
    });
  }
}
```

### Step 2: Update LogWatcher to Track Positions

**File:** `backend/src/services/logWatcher.ts`

**Changes Needed:**

```typescript
import { ShutdownStateManager } from './shutdownStateManager.js';
import { getDatabase } from './database.js';

export class LogWatcher extends EventEmitter {
  private watchedFiles: Map<string, WatchedFile> = new Map();
  private shutdownStateManager: ShutdownStateManager;

  constructor(/* ... */) {
    // ... existing code ...
    this.shutdownStateManager = new ShutdownStateManager(getDatabase());

    // Restore file positions on startup
    this.restoreFilePositions();
  }

  /**
   * Restore file read positions from database
   */
  private async restoreFilePositions(): Promise<void> {
    try {
      const positions = await this.shutdownStateManager.restoreLogFilePositions();

      for (const [filePath, position] of positions.entries()) {
        const watchedFile = this.watchedFiles.get(filePath);
        if (watchedFile) {
          watchedFile.position = position;
          logger.info({
            category: 'log-watcher',
            action: 'file_position_restored',
            message: 'File position restored from previous session',
            details: { filePath, position }
          });
        }
      }
    } catch (error) {
      logger.error({
        category: 'log-watcher',
        action: 'file_position_restore_failed',
        message: 'Failed to restore file positions',
        error
      });
    }
  }

  /**
   * Get current file positions for persistence
   */
  public getFilePositions(): Map<string, number> {
    const positions = new Map<string, number>();

    for (const [filePath, watchedFile] of this.watchedFiles.entries()) {
      positions.set(filePath, watchedFile.position);
    }

    return positions;
  }
}
```

### Step 3: Add Circuit Breaker State Export (If Circuit Breaker Exists)

**File:** `backend/src/services/taskExecution.service.ts` (or wherever circuit breaker is implemented)

**Changes Needed:**

```typescript
export class TaskExecutionService {
  private dockerCircuitBreaker?: {
    failureCount: number;
    lastFailureTime: number;
    state: 'closed' | 'open' | 'half-open';
  };

  /**
   * Export circuit breaker state for persistence
   */
  public getCircuitBreakerState(): Map<string, any> {
    const states = new Map();

    if (this.dockerCircuitBreaker) {
      states.set('docker', {
        failureCount: this.dockerCircuitBreaker.failureCount,
        lastFailureTime: this.dockerCircuitBreaker.lastFailureTime,
        state: this.dockerCircuitBreaker.state
      });
    }

    return states;
  }

  /**
   * Restore circuit breaker state
   */
  public restoreCircuitBreakerState(states: Map<string, any>): void {
    const dockerState = states.get('docker');
    if (dockerState && this.dockerCircuitBreaker) {
      this.dockerCircuitBreaker.failureCount = dockerState.failureCount;
      this.dockerCircuitBreaker.lastFailureTime = dockerState.lastFailureTime;
      this.dockerCircuitBreaker.state = dockerState.state;

      logger.info({
        category: 'task-execution',
        action: 'circuit_breaker_restored',
        message: 'Circuit breaker state restored',
        details: dockerState
      });
    }
  }
}
```

### Step 4: Integrate with Graceful Shutdown

**File:** `backend/src/index.ts`

**Changes Needed:**

```typescript
import { ShutdownStateManager } from './services/shutdownStateManager.js';
import { getDatabase } from './services/database.js';

// Add near the top with other imports
let shutdownStateManager: ShutdownStateManager;

// In createApp() or startup
shutdownStateManager = new ShutdownStateManager(getDatabase());

// In gracefulShutdown function, add new phase after Phase 4 (WebSocket drain):
async function gracefulShutdown(signal: string) {
  // ... existing phases 1-4 ...

  // Phase 5: Persist ephemeral state
  console.log('💾 Persisting ephemeral state...');
  try {
    // Get retry history from retry manager
    const retryManager = devBotsManager?.getRetryManager?.();
    if (retryManager) {
      const retryHistory = retryManager.exportHistory();
      await shutdownStateManager.saveRetryHistory(retryHistory);
    }

    // Get log file positions from log watcher
    const logWatcher = processManager.getLogWatcher?.();
    if (logWatcher && typeof logWatcher.getFilePositions === 'function') {
      const filePositions = logWatcher.getFilePositions();
      await shutdownStateManager.saveLogFilePositions(filePositions);
    }

    // Get circuit breaker states
    const taskExecution = devBotsManager?.getTaskExecution?.();
    if (taskExecution && typeof taskExecution.getCircuitBreakerState === 'function') {
      const circuitBreakerStates = taskExecution.getCircuitBreakerState();
      await shutdownStateManager.saveCircuitBreakerStates(circuitBreakerStates);
    }

    logger.info({
      category: 'system',
      action: 'ephemeral_state_persisted',
      message: 'Ephemeral state successfully persisted'
    });
  } catch (error) {
    logger.error({
      category: 'system',
      action: 'state_persistence_failed',
      message: 'Failed to persist ephemeral state',
      error
    });
  }

  // Phase 6: Stop log rotation
  // ... rest of existing shutdown process ...
}
```

### Step 5: Restore State on Startup

**File:** `backend/src/server.ts` or initialization code

**Changes Needed:**

```typescript
import { ShutdownStateManager } from './services/shutdownStateManager.js';
import { getDatabase } from './services/database.js';

export async function createApp(options: CreateAppOptions = {}) {
  // ... existing initialization ...

  // After all services are initialized, restore state
  const shutdownStateManager = new ShutdownStateManager(getDatabase());

  // Restore circuit breaker states
  const circuitBreakerStates = await shutdownStateManager.restoreCircuitBreakerStates();
  const taskExecution = devBotsManager?.getTaskExecution?.();
  if (taskExecution && circuitBreakerStates.size > 0) {
    taskExecution.restoreCircuitBreakerState(circuitBreakerStates);
  }

  logger.info({
    category: 'system',
    action: 'startup_state_restored',
    message: 'Startup state restoration complete'
  });

  // ... rest of initialization ...
}
```

### Step 6: Add Periodic State Persistence (Optional but Recommended)

**File:** `backend/src/index.ts` or wherever services are managed

**Changes Needed:**

```typescript
// Start periodic state backup (every 5 minutes)
const stateBackupInterval = setInterval(async () => {
  try {
    const retryManager = devBotsManager?.getRetryManager?.();
    if (retryManager) {
      const retryHistory = retryManager.exportHistory();
      await shutdownStateManager.saveRetryHistory(retryHistory);
    }

    const logWatcher = processManager.getLogWatcher?.();
    if (logWatcher && typeof logWatcher.getFilePositions === 'function') {
      const filePositions = logWatcher.getFilePositions();
      await shutdownStateManager.saveLogFilePositions(filePositions);
    }

    logger.debug({
      category: 'system',
      action: 'periodic_state_backup',
      message: 'Periodic state backup completed'
    });
  } catch (error) {
    logger.error({
      category: 'system',
      action: 'periodic_backup_failed',
      message: 'Periodic state backup failed',
      error
    });
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Clear interval on shutdown
// Add to gracefulShutdown function:
clearInterval(stateBackupInterval);
```

## Testing Checklist

### Test 1: Retry History Persistence
1. Start backend
2. Create a task and let it fail
3. Manually retry the task (should increment retry count)
4. Restart backend (simulate deployment)
5. **Expected:** Retry history preserved, can't retry beyond max

### Test 2: Log File Position Persistence
1. Start backend with log watchers
2. Let logs accumulate
3. Note current file position in logs
4. Restart backend
5. **Expected:** Resumes reading from saved position (no replayed logs)

### Test 3: Circuit Breaker State Persistence
1. Start backend
2. Trigger Docker failures to open circuit breaker
3. Restart backend
4. **Expected:** Circuit breaker still open, doesn't immediately retry

### Test 4: Deployment Scenario
1. Start backend, run tasks, retry some, watch logs
2. Trigger deployment (graceful shutdown)
3. **Expected:** See "Persisting ephemeral state" in logs
4. New instance starts
5. **Expected:** State restored, no data loss

## Performance Impact

**Storage:**
- Retry history: ~200 bytes per attempt
- Log positions: ~100 bytes per file
- Circuit breakers: ~150 bytes per service
- **Total:** < 1MB for typical usage

**CPU:**
- Shutdown: +50-100ms for persistence
- Startup: +50-100ms for restoration
- Periodic backup: ~10ms every 5 minutes

**Minimal impact, significant reliability gain!**

## Future Enhancements

### Phase 2: Active Worker Tracking
Once basic state persistence works, add:
- Persist active ephemeral workers to database
- On startup, verify containers still exist
- Mark disappeared workers as failed
- See `DEPLOYMENT_STATE_ANALYSIS.md` Solution 5 for details

### Phase 3: In-Flight Request Tracking
- Track active HTTP requests during shutdown
- Wait for them to complete before stopping
- Return 503 for new requests during drain

### Phase 4: Metrics Preservation
- Persist metrics aggregates before shutdown
- Restore on startup for continuity
- Prevent dashboard gaps during deployments

## Rollback Plan

If state persistence causes issues:

1. **Disable persistence without rollback:**
   ```typescript
   // In index.ts, comment out Phase 5:
   // console.log('💾 Persisting ephemeral state...');
   // await shutdownStateManager.saveRetryHistory(...)
   ```

2. **Clear persisted state:**
   ```bash
   sqlite3 backend/data/dev-bots.db
   > DELETE FROM retry_history;
   > DELETE FROM log_file_positions;
   > DELETE FROM circuit_breaker_states;
   > .quit
   ```

3. **Full rollback:**
   ```bash
   git revert <commit-hash>
   ```

## Implementation Priority

**High Priority (Implement First):**
1. ✅ Retry history persistence - Prevents infinite retries
2. ⏳ Integration with graceful shutdown - Easy win

**Medium Priority (Implement Next):**
3. Log file position tracking - Prevents log replay/loss
4. Periodic state backup - Extra safety net

**Low Priority (Nice to Have):**
5. Circuit breaker persistence - Recovers quickly anyway
6. Active worker tracking - More complex, bigger lift

## Conclusion

The `ShutdownStateManager` is ready to use. Integration requires:
- Adding export methods to existing services (RetryManager, LogWatcher, etc.)
- Calling save methods during graceful shutdown
- Calling restore methods on startup

**Estimated Implementation Time:** 2-3 hours
**Risk Level:** Low (all additive, doesn't break existing functionality)
**Benefit:** Eliminates last remaining data loss scenarios during deployment

Ready to implement when you're ready to continue improving deployment resilience!
