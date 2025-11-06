# Task Queue System Analysis and Redesign

## Executive Summary

The current file-based JSON task queue system has multiple critical issues causing instability, unpredictability, and duplicate task execution. This document analyzes all observed problems and proposes a SQLite-based queue system that is stable, predictable, usable, and maintainable.

---

## Critical Issues Identified

### 1. **Race Conditions and Concurrent Access** ❌ CRITICAL
**Problem**: Multiple in-memory data structures (taskQueue, activeTasks, completedTasks) are modified without proper locking.

**Evidence**:
- Task executed 3+ times with different worker IDs (bot-backend-specialist-1762456608367, ...608713, ...622457)
- Tasks stuck in "assigned" status while execution logs show repeated attempts
- No synchronization between file writes and in-memory state

**Root Cause**:
```typescript
// devBotsManager.ts lines 560-566
private taskQueue: Task[] = [];
private activeTasks = new Map<string, Task>();
private completedTasks: Task[] = [];
private taskFingerprints = new Map<string, string>();
private fileModificationLocks = new Map<string, string>();
```
All operations on these structures are non-atomic and unprotected.

**Impact**: **SEVERE** - Duplicate task execution, resource waste, unpredictable behavior

---

### 2. **Persistence-Memory Desynchronization** ❌ CRITICAL
**Problem**: In-memory state and file-based persistence frequently diverge.

**Evidence**:
- Task status shows "assigned" in API response but execution logs show multiple attempts
- Commit f1a674f fixed one issue where completed tasks weren't saved to tasks.json
- Tasks reset from "assigned" to "pending" on server restart (line 770-773)

**Root Cause**:
```typescript
// devBotsManager.ts lines 770-773
} else if (task.status === 'assigned' || task.status === 'active') {
  // Reset assigned/active tasks to pending since workers are no longer running
  const oldStatus = task.status;
  task.status = 'pending';
```

This "helpful" reset logic causes the duplicate execution bug:
1. Task starts, status → 'assigned'
2. Docker spawn takes time (async operation)
3. Server restarts (nodemon)
4. Task reset to 'pending'
5. Task re-executed

**Impact**: **SEVERE** - Duplicate work, wasted resources, infinite retry loops

---

### 3. **No Transaction Support** ❌ CRITICAL
**Problem**: State changes span multiple operations without atomicity.

**Evidence**:
```typescript
// devBotsManager.ts lines 1209-1214
nextTask.status = 'assigned';
nextTask.assignedAt = new Date().toISOString();

this.activeTasks.set(nextTask.id, nextTask);
```

If server crashes after line 1211, task is in inconsistent state.

**Impact**: **HIGH** - Data corruption, orphaned tasks, inconsistent state

---

### 4. **Async spawn() Without Proper Awaiting** ❌ CRITICAL
**Problem**: Docker container spawn is async but system treats assignment as synchronous.

**Evidence**:
```typescript
// devBotsManager.ts lines 1414-1438
const dockerProcess = spawn('docker', dockerArgs, {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe']
});

// Wait for completion
const exitCode = await new Promise<number>((resolve, reject) => {
  dockerProcess.on('close', (code) => {
    resolve(code || 0);
  });
```

The promise waits for container COMPLETION, not START. Task shows "assigned" but container hasn't started yet.

**Impact**: **SEVERE** - Tasks appear stuck, status misleading, monitoring broken

---

### 5. **File-Based Storage Limitations** ❌ HIGH
**Problem**: JSON files cannot support concurrent operations, queries, or transactions.

**Limitations**:
- No ACID guarantees
- No concurrent read/write support
- No indexing for efficient queries
- No foreign key constraints
- Manual backup management
- Risk of file corruption on crash

**Evidence**:
- taskPersistence.ts has 540 lines just for basic file I/O
- Manual backup creation/rotation (lines 239-296)
- No way to query "pending tasks older than X hours"
- Cannot enforce referential integrity

**Impact**: **HIGH** - Scalability limits, maintenance burden, data integrity risks

---

### 6. **Inadequate State Machine** ❌ HIGH
**Problem**: Task status transitions are not validated or enforced.

**Current States**: `pending | assigned | active | completed | failed | retrying`

**Issues**:
- No validation of valid transitions (can go from 'completed' → 'pending')
- "assigned" and "active" are redundant
- No "cancelled" or "timeout" states
- State changes scattered across codebase

**Impact**: **MEDIUM** - Invalid state transitions, debugging difficulty

---

### 7. **No Idempotency for Task Assignment** ❌ HIGH
**Problem**: assignNextTask() can be called multiple times for the same task.

**Evidence**:
- Multiple worker IDs in logs for same task
- No distributed lock mechanism
- ephemeralWorkers Map registration happens AFTER assignment decision

**Impact**: **SEVERE** - Duplicate executions, wasted resources

---

### 8. **Missing Observability** ❌ MEDIUM
**Problem**: Cannot answer basic questions about queue health.

**Cannot Determine**:
- How many tasks are truly in progress vs stuck?
- Which tasks have been waiting longest?
- Average task completion time
- Retry patterns and failure rates
- Queue depth over time

**Impact**: **MEDIUM** - Debugging is difficult, no capacity planning

---

### 9. **Task Deduplication Issues** ⚠️ MEDIUM
**Problem**: Recent fix (commit a4e4954) uses in-memory Map for fingerprints.

**Issues**:
- taskFingerprints Map cleared on restart
- MD5 of title + files + 3 criteria is too loose (same file, different tasks)
- No historical tracking of similar tasks

**Impact**: **MEDIUM** - Deduplication doesn't survive restarts

---

### 10. **No Worker Lifecycle Management** ❌ HIGH
**Problem**: No tracking of worker health, heartbeats, or timeout detection.

**Evidence**:
- Task shows "assigned" forever with no container
- No timeout for docker spawn operation
- No heartbeat mechanism to detect stuck containers
- Cannot distinguish "working" from "hung"

**Impact**: **HIGH** - Tasks stuck forever, manual intervention required

---

## Root Cause Summary

The fundamental issue is **using in-memory data structures with file-based persistence in a concurrent, async environment without proper synchronization**.

### Why It Fails:

1. **No Single Source of Truth**: Memory and files disagree
2. **No Locking**: Concurrent modifications cause race conditions
3. **No Transactions**: Multi-step operations can partially fail
4. **Async Misunderstanding**: spawn() completion ≠ assignment completion
5. **Wrong Tool**: Files are not databases

---

## Proposed Solution: SQLite-Based Queue System

### Why SQLite?

✅ **ACID Transactions**: Atomic multi-step operations
✅ **Concurrent Access**: Built-in locking, WAL mode for concurrent reads
✅ **Queries**: Efficient filtering, sorting, aggregation
✅ **Indexes**: Fast lookups by status, priority, created_at
✅ **Foreign Keys**: Referential integrity
✅ **Zero Config**: Single file, no server, no setup
✅ **Reliable**: Battle-tested, industry standard
✅ **Portable**: Works everywhere Node.js runs

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      DevBotsManager                          │
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │   Task API   │────────>│ TaskQueue    │                 │
│  │  (REST/WS)   │         │   Service    │                 │
│  └──────────────┘         └──────┬───────┘                 │
│                                   │                          │
│                                   ▼                          │
│                         ┌─────────────────┐                 │
│                         │  SQLite Queue   │                 │
│                         │    Database     │                 │
│                         └─────────────────┘                 │
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │   Worker     │────────>│   Worker     │                 │
│  │   Manager    │         │  Heartbeat   │                 │
│  └──────────────┘         └──────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
-- Main tasks table
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  documentation TEXT,
  notes TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
  priority INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL, -- Unix timestamp in milliseconds
  assigned_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  assigned_agent TEXT NOT NULL,
  assigned_worker TEXT,
  prompt TEXT,
  output TEXT,
  error TEXT,
  can_retry BOOLEAN DEFAULT 1,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 600000, -- 10 minutes
  fingerprint TEXT, -- For deduplication

  -- Metadata
  estimated_hours REAL,
  complexity TEXT,

  -- Indexes for common queries
  created_at_idx DATETIME DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC, created_at ASC);
CREATE INDEX idx_tasks_fingerprint ON tasks(fingerprint);
CREATE INDEX idx_tasks_assigned_worker ON tasks(assigned_worker);

-- Worker tracking
CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('starting', 'running', 'stopping', 'stopped')),
  current_task_id TEXT,
  created_at INTEGER NOT NULL,
  last_heartbeat INTEGER NOT NULL,
  heartbeat_timeout_ms INTEGER DEFAULT 30000,

  FOREIGN KEY (current_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_workers_last_heartbeat ON workers(last_heartbeat);

-- Task execution history (for observability)
CREATE TABLE task_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  exit_code INTEGER,
  error TEXT,
  duration_ms INTEGER,

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

CREATE INDEX idx_executions_task_id ON task_executions(task_id);
CREATE INDEX idx_executions_worker_id ON task_executions(worker_id);

-- Task dependencies (future)
CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,

  PRIMARY KEY (task_id, depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Task files (for file locking)
CREATE TABLE task_files (
  task_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  lock_acquired_at INTEGER,

  PRIMARY KEY (task_id, file_path),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_task_files_path ON task_files(file_path);

-- Task acceptance criteria
CREATE TABLE task_criteria (
  task_id TEXT NOT NULL,
  criterion TEXT NOT NULL,
  sort_order INTEGER NOT NULL,

  PRIMARY KEY (task_id, sort_order),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Task architecture references
CREATE TABLE task_references (
  task_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  sort_order INTEGER NOT NULL,

  PRIMARY KEY (task_id, sort_order),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

### Core Operations

#### 1. Atomic Task Assignment

```typescript
async assignNextTask(): Promise<Task | null> {
  return await db.transaction(async (tx) => {
    // 1. Find next pending task (FOR UPDATE locks the row)
    const task = await tx.get(`
      SELECT * FROM tasks
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE
    `);

    if (!task) return null;

    // 2. Check for file conflicts
    const fileConflict = await tx.get(`
      SELECT tf.file_path, t.id as conflicting_task_id
      FROM task_files tf
      JOIN tasks t ON tf.task_id = t.id
      WHERE tf.file_path IN (
        SELECT file_path FROM task_files WHERE task_id = ?
      )
      AND t.status = 'running'
      AND t.id != ?
    `, [task.id, task.id]);

    if (fileConflict) {
      // Task needs to wait for file lock
      return null;
    }

    // 3. Assign task atomically
    const workerId = `bot-${task.assigned_agent}-${Date.now()}`;
    await tx.run(`
      UPDATE tasks
      SET status = 'running',
          assigned_at = ?,
          assigned_worker = ?,
          started_at = ?
      WHERE id = ?
    `, [Date.now(), workerId, Date.now(), task.id]);

    // 4. Create worker record
    await tx.run(`
      INSERT INTO workers (id, agent_id, status, current_task_id, created_at, last_heartbeat)
      VALUES (?, ?, 'running', ?, ?, ?)
    `, [workerId, task.assigned_agent, task.id, Date.now(), Date.now()]);

    // 5. Record execution attempt
    await tx.run(`
      INSERT INTO task_executions (task_id, worker_id, attempt_number, started_at)
      VALUES (?, ?, ?, ?)
    `, [task.id, workerId, task.retry_count + 1, Date.now()]);

    // Transaction commits automatically if no error
    return { ...task, status: 'running', assigned_worker: workerId };
  });
}
```

**Benefits**:
- ✅ Atomic: All-or-nothing assignment
- ✅ No race conditions: Row-level locking
- ✅ File conflict detection: Built-in
- ✅ Worker tracking: Automatic
- ✅ Audit trail: Execution history

#### 2. Worker Heartbeat System

```typescript
async updateWorkerHeartbeat(workerId: string): Promise<void> {
  await db.run(`
    UPDATE workers
    SET last_heartbeat = ?
    WHERE id = ?
  `, [Date.now(), workerId]);
}

async detectStalledWorkers(): Promise<string[]> {
  const timeout = Date.now() - 30000; // 30 seconds
  const stalledWorkers = await db.all(`
    SELECT id, current_task_id
    FROM workers
    WHERE status = 'running'
    AND last_heartbeat < ?
  `, [timeout]);

  // Mark tasks as failed and clean up workers
  for (const worker of stalledWorkers) {
    await db.transaction(async (tx) => {
      if (worker.current_task_id) {
        await tx.run(`
          UPDATE tasks
          SET status = 'failed',
              error = 'Worker heartbeat timeout',
              completed_at = ?
          WHERE id = ?
        `, [Date.now(), worker.current_task_id]);
      }

      await tx.run(`
        UPDATE workers
        SET status = 'stopped'
        WHERE id = ?
      `, [worker.id]);
    });
  }

  return stalledWorkers.map(w => w.id);
}
```

#### 3. Task Completion (Idempotent)

```typescript
async completeTask(taskId: string, output: string): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await tx.get('SELECT status FROM tasks WHERE id = ?', [taskId]);

    // Idempotency: Only complete if currently running
    if (task.status !== 'running') {
      logger.warn(`Task ${taskId} already in ${task.status} state, skipping completion`);
      return;
    }

    const now = Date.now();
    await tx.run(`
      UPDATE tasks
      SET status = 'completed',
          output = ?,
          completed_at = ?
      WHERE id = ?
    `, [output, now, taskId]);

    // Update execution record
    const execution = await tx.get(`
      SELECT id, started_at
      FROM task_executions
      WHERE task_id = ? AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `, [taskId]);

    if (execution) {
      await tx.run(`
        UPDATE task_executions
        SET ended_at = ?,
            duration_ms = ?,
            exit_code = 0
        WHERE id = ?
      `, [now, now - execution.started_at, execution.id]);
    }

    // Clean up worker
    await tx.run(`
      UPDATE workers
      SET status = 'stopped',
          current_task_id = NULL
      WHERE current_task_id = ?
    `, [taskId]);
  });
}
```

#### 4. Deduplication (Persistent)

```typescript
async checkDuplicateTask(fingerprint: string): Promise<Task | null> {
  return await db.get(`
    SELECT * FROM tasks
    WHERE fingerprint = ?
    AND status IN ('pending', 'running')
    ORDER BY created_at ASC
    LIMIT 1
  `, [fingerprint]);
}

async createTask(taskData: EnhancedTaskData): Promise<Task> {
  const fingerprint = crypto.createHash('md5')
    .update(JSON.stringify({
      title: taskData.title.toLowerCase().trim(),
      files: taskData.files?.sort() || [],
      type: taskData.type
    }))
    .digest('hex');

  // Check for duplicate
  const duplicate = await this.checkDuplicateTask(fingerprint);
  if (duplicate) {
    throw new Error(`Duplicate task: "${duplicate.title}" (${duplicate.id}) is already ${duplicate.status}`);
  }

  // Create task
  const task = {
    id: `task-${taskData.type}-${Date.now()}`,
    ...taskData,
    status: 'pending',
    created_at: Date.now(),
    fingerprint
  };

  await db.run(`INSERT INTO tasks (...) VALUES (...)`, [...]);

  return task;
}
```

### Key Features

#### 1. **Proper State Machine**

```
     ┌──────────┐
     │ pending  │
     └────┬─────┘
          │
          ▼
     ┌──────────┐     timeout      ┌──────────┐
     │ running  │─────────────────>│ timeout  │
     └────┬─────┘                   └──────────┘
          │
          ├──success────>┌───────────┐
          │              │ completed │
          │              └───────────┘
          │
          ├──failure────>┌──────────┐
          │              │  failed  │
          │              └──────────┘
          │
          └──cancel─────>┌───────────┐
                         │ cancelled │
                         └───────────┘
```

Valid transitions enforced by CHECK constraint.

#### 2. **Observability Queries**

```sql
-- Queue depth by status
SELECT status, COUNT(*) as count
FROM tasks
GROUP BY status;

-- Average completion time
SELECT AVG(duration_ms) / 1000.0 as avg_seconds
FROM task_executions
WHERE exit_code = 0
AND started_at > ?; -- last 24 hours

-- Stalled tasks (running > 10 minutes)
SELECT id, title, assigned_worker, started_at
FROM tasks
WHERE status = 'running'
AND started_at < ?; -- 10 minutes ago

-- Tasks waiting longest
SELECT id, title, created_at, priority
FROM tasks
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT 10;

-- Retry patterns
SELECT task_id, COUNT(*) as attempts,
       MAX(duration_ms) as longest_attempt_ms
FROM task_executions
GROUP BY task_id
HAVING COUNT(*) > 1;

-- File lock conflicts
SELECT tf.file_path, COUNT(DISTINCT tf.task_id) as conflicting_tasks
FROM task_files tf
JOIN tasks t ON tf.task_id = t.id
WHERE t.status IN ('pending', 'running')
GROUP BY tf.file_path
HAVING COUNT(DISTINCT tf.task_id) > 1;
```

#### 3. **Conservative Timeout Detection (Manual Only)**

**IMPORTANT**: We do NOT automatically timeout tasks. Complex tasks may take hours.

Instead, we provide monitoring and manual intervention:

```typescript
// WARNING ONLY - detect long-running tasks but don't auto-fail
setInterval(() => {
  const longRunning = taskQueue.detectLongRunningTasks(1800000); // 30 min warning

  if (longRunning.length > 0) {
    // Log warning for monitoring/alerting
    // Operator can investigate and manually timeout if needed
    logger.warn(`${longRunning.length} tasks running > 30 minutes`);
  }
}, 300000); // Check every 5 minutes

// Manual timeout (requires human verification)
async function timeoutStuckTask(taskId: string) {
  // Operator verifies task is truly stuck (e.g., container crashed)
  await taskQueue.manuallyTimeoutTask(taskId, 'Container crashed - verified by operator');
}
```

**Benefits**:
- ✅ No false positives from auto-timeout
- ✅ Complex tasks can complete naturally
- ✅ Monitoring alerts for investigation
- ✅ Manual intervention when needed
- ✅ Can adjust thresholds as we learn actual task durations

#### 4. **Learning Task Duration Baselines**

Over time, we can analyze actual task durations to set intelligent timeouts:

```sql
-- Analyze completion times by task type
SELECT type, complexity,
       COUNT(*) as completed_count,
       AVG(duration_ms) / 60000.0 as avg_minutes,
       MAX(duration_ms) / 60000.0 as max_minutes,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) / 60000.0 as p95_minutes
FROM task_executions te
JOIN tasks t ON te.task_id = t.id
WHERE exit_code = 0
AND ended_at > ? -- last 30 days
GROUP BY type, complexity
ORDER BY type, complexity;

-- After collecting baseline data, can enable smart timeouts:
-- Simple tasks: 2 * p95 duration
-- Medium tasks: 3 * p95 duration
-- Complex tasks: 5 * p95 duration or manual timeout only
```

**Recommendation**: Collect at least 50 completed tasks per type/complexity before enabling automatic timeouts.

#### 5. **WAL Mode for Concurrent Reads**

```typescript
// Enable WAL mode for better concurrency
await db.exec('PRAGMA journal_mode = WAL');
await db.exec('PRAGMA synchronous = NORMAL');
await db.exec('PRAGMA foreign_keys = ON');
```

Benefits:
- Multiple readers don't block each other
- Readers don't block writers
- Writers don't block readers
- Better crash recovery

---

## Migration Strategy

### Phase 1: Create SQLite Schema (Week 1)
1. Create database schema
2. Write migration script from JSON to SQLite
3. Add SQLite service class
4. Unit test all database operations

### Phase 2: Parallel Run (Week 2)
1. Run both systems side-by-side
2. Write to both JSON and SQLite
3. Compare results for consistency
4. Fix any discrepancies

### Phase 3: Cutover (Week 3)
1. Switch read operations to SQLite
2. Keep JSON as backup for 1 week
3. Monitor for issues
4. Remove JSON code after confidence period

### Phase 4: Optimize (Week 4)
1. Add missing indexes based on slow queries
2. Implement query result caching
3. Add database backup automation
4. Create monitoring dashboard

---

## Implementation Checklist

### Core Infrastructure
- [ ] Create SQLite database schema
- [ ] Implement TaskQueueService with sqlite3
- [ ] Add transaction support
- [ ] Enable WAL mode
- [ ] Create database migration tool

### Queue Operations
- [ ] Implement atomic task assignment
- [ ] Add task creation with deduplication
- [ ] Implement task completion (idempotent)
- [ ] Add task failure handling
- [ ] Implement task cancellation

### Worker Management
- [ ] Create worker registration
- [ ] Implement heartbeat system
- [ ] Add stalled worker detection
- [ ] Implement automatic cleanup

### Observability
- [ ] Add queue metrics endpoint
- [ ] Create task history queries
- [ ] Implement performance tracking
- [ ] Add alerting for stuck tasks

### Testing
- [ ] Unit tests for all operations
- [ ] Integration tests with real SQLite
- [ ] Concurrency tests
- [ ] Failure recovery tests
- [ ] Performance benchmarks

### Migration
- [ ] JSON to SQLite migration script
- [ ] Backward compatibility layer (temporary)
- [ ] Rollback procedure
- [ ] Production cutover plan

---

## Expected Benefits

### Reliability
✅ **Zero duplicate executions**: Row-level locking prevents race conditions
✅ **Consistent state**: ACID transactions ensure data integrity
✅ **Automatic recovery**: Heartbeat system detects and recovers from failures
✅ **Idempotent operations**: Safe to retry any operation

### Performance
✅ **Fast queries**: Indexes on status, priority, created_at
✅ **Concurrent operations**: WAL mode allows parallel reads
✅ **Efficient filtering**: SQL queries vs array iterations
✅ **Scalable**: Handles 10,000+ tasks without performance degradation

### Maintainability
✅ **Simple codebase**: Database handles complexity, not application code
✅ **Standard SQL**: Any developer can understand queries
✅ **Easy debugging**: Query execution history, visualize data with DB tools
✅ **Testable**: In-memory SQLite for fast unit tests

### Usability
✅ **Rich queries**: Find tasks by any criteria
✅ **Historical data**: Track task performance over time
✅ **Audit trail**: Complete execution history
✅ **Monitoring**: Real-time queue metrics

---

## Risk Mitigation

### Risk 1: SQLite File Corruption
**Mitigation**:
- WAL mode provides better crash recovery
- Automatic backups every hour
- Transaction logs for point-in-time recovery

### Risk 2: Database Lock Contention
**Mitigation**:
- WAL mode minimizes lock contention
- Busy timeout set to 5 seconds
- Connection pooling if needed

### Risk 3: Migration Issues
**Mitigation**:
- Parallel run phase validates correctness
- JSON backup kept for 1 week post-cutover
- Automated rollback script

### Risk 4: Query Performance
**Mitigation**:
- Indexes on all foreign keys and common filters
- Query performance tests in CI/CD
- EXPLAIN QUERY PLAN analysis for slow queries

---

## Conclusion

The current file-based queue system has fundamental design flaws that cause duplicate executions, race conditions, and unpredictable behavior. **Migrating to SQLite provides**:

1. **Atomic operations** via transactions
2. **Proper concurrency control** via row-level locking
3. **Persistent state** with ACID guarantees
4. **Rich querying** for observability
5. **Standard tooling** for debugging and monitoring

This is not over-engineering—this is using the right tool for the job. SQLite is specifically designed for embedded database use cases like task queues. The migration is low-risk and provides immediate stability improvements.

**Recommendation**: Proceed with SQLite migration. Estimated effort: 2-3 weeks for complete implementation and cutover.
