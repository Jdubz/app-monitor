# Task Queue & Chain Architecture

**Purpose:** Comprehensive architecture of the staged task queue, chain tracking, and concurrency control system.

**Status:** Production (v0.2.0)

---

## Overview

The task queue is an SQLite-backed authoritative system that manages all development work through the app-monitor. It implements staged queue management, task chains with depth limits, and concurrency control to prevent PR explosion.

**Key Principles:**
- **Single source of truth** - Database is authoritative
- **Chain-aware concurrency** - Limit concurrent chains, not tasks
- **ACID compliance** - SQLite transactions for consistency
- **Event-driven** - No polling, all updates via events

---

## Database Schema

### Core Tables

**`tasks` - Task Definitions**
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,  -- 'implementation', 'review', 'fix', 'complete', 'analysis'
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,  -- 'pending', 'active', 'completed', 'failed', 'blocked'
  priority INTEGER DEFAULT 0,
  parent_task_id TEXT,  -- For chain relationships
  chain_id TEXT,        -- Identifies task chain
  chain_depth INTEGER DEFAULT 0,  -- Depth in chain (0 = root)
  agent TEXT,           -- 'claude', 'codex', 'gemini', 'copilot'
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  metadata TEXT,        -- JSON blob for task-specific data
  context_bundle_id TEXT,
  context_cache_key TEXT,
  pr_url TEXT,
  pr_number INTEGER,
  branch_name TEXT,
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);
```

**`task_chains` - Chain Metadata**
```sql
CREATE TABLE task_chains (
  chain_id TEXT PRIMARY KEY,
  root_task_id TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'active', 'blocked', 'completed', 'failed'
  depth INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (root_task_id) REFERENCES tasks(id)
);
```

**`task_executions` - Execution Attempts**
```sql
CREATE TABLE task_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  exit_code INTEGER,
  stdout_log TEXT,
  stderr_log TEXT,
  container_id TEXT,
  agent TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

**`pr_metadata` - Pull Request Tracking**
```sql
CREATE TABLE pr_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'open', 'merged', 'closed'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

---

## Task Lifecycle

### State Machine

```
PENDING → ACTIVE → COMPLETED
   ↓         ↓         ↓
BLOCKED   FAILED   (triggers chain)
```

### State Transitions

**PENDING → ACTIVE**
- Triggered by: `TaskExecutionService.pullNextTask()`
- Conditions: 
  - Task not blocked by chain
  - Concurrency limit not exceeded
  - Agent available
- Action: Update status, create execution record

**ACTIVE → COMPLETED**
- Triggered by: `TaskCompletionService.completeTask()`
- Conditions:
  - Container exited successfully
  - Quality gates passed
  - PR created (if implementation)
- Action: Update status, trigger chain tasks

**ACTIVE → FAILED**
- Triggered by: Container failure, timeout, or scope violation
- Conditions: Execution failed
- Action: Update status, create retry task (if attempts < 3)

**PENDING → BLOCKED**
- Triggered by: Chain concurrency control
- Conditions: Another chain has pending REVIEW
- Action: Mark status as blocked

---

## Task Types & Chains

### Task Type Hierarchy

```
IMPLEMENTATION (root)
  ├─> REVIEW (auto-created)
  │    └─> FIX (if issues found)
  │         └─> REVIEW (re-verify)
  │              └─> COMPLETE (success)
  └─> COMPLETE (if review passes first time)
```

### Task Type Definitions

**IMPLEMENTATION**
- **Purpose:** Create new feature or make code changes
- **Triggers:** User-submitted or plan-generated
- **Agent:** Claude (primary) or Gemini (frontend)
- **Chain:** Always creates REVIEW task
- **Concurrency:** Blocked if any chain has pending REVIEW

**REVIEW**
- **Purpose:** Verify implementation outcome
- **Triggers:** Auto-created after IMPLEMENTATION completes
- **Agent:** Codex or Claude
- **Chain:** Creates FIX if issues found, COMPLETE if passes
- **Blocking:** Blocks new IMPLEMENTATION tasks while pending

**FIX**
- **Purpose:** Correct issues identified in REVIEW
- **Triggers:** REVIEW finds problems
- **Agent:** Same as parent IMPLEMENTATION
- **Chain:** Triggers new REVIEW after completion
- **Depth Limit:** Max 4 FIX attempts (5th escalates to human)

**COMPLETE**
- **Purpose:** Finalize task chain
- **Triggers:** REVIEW passes
- **Agent:** N/A (no execution)
- **Chain:** Ends chain, releases concurrency slot
- **Action:** Merge PR, archive artifacts, log completion

**ANALYSIS**
- **Purpose:** Code analysis, investigation, documentation
- **Triggers:** User-submitted or bot-generated
- **Agent:** Codex or Gemini
- **Chain:** Standalone (no follow-ups)
- **Concurrency:** Does not block IMPLEMENTATION tasks

---

## Chain Management

### Chain ID Generation

```typescript
function generateChainId(rootTaskId: string): string {
  return `chain-${rootTaskId}`;
}
```

**Properties:**
- One chain per root IMPLEMENTATION task
- Chain ID inherited by all descendants
- Used for concurrency control and artifact sharing

### Chain Depth Limits

**Rule:** Maximum 10 tasks per chain

**Rationale:** Prevents infinite review/fix loops

**Enforcement:**
```typescript
function canCreateChildTask(parentTaskId: string): boolean {
  const chain = getChainByTaskId(parentTaskId);
  return chain.depth < 10;
}
```

**Escalation:** 10th task triggers human review with summary

### Chain Concurrency Control

**Rule:** Maximum 3 concurrent active chains

**Implementation:**
```typescript
function canStartNewChain(): boolean {
  const activeChains = db.query(
    'SELECT COUNT(*) FROM task_chains WHERE status = "active"'
  );
  return activeChains < 3;
}
```

**Blocking Logic:**
- New IMPLEMENTATION tasks check `canStartNewChain()`
- If false, task status set to BLOCKED
- Unblocked when active chain completes

### Chain Blocking Specifics

**Blocking Condition:** Any chain has pending REVIEW task

**Rationale:** Force completion of in-flight work before starting new features

**Implementation:**
```typescript
function hasPendingReviews(): boolean {
  const pendingReviews = db.query(
    'SELECT COUNT(*) FROM tasks WHERE type = "review" AND status = "pending"'
  );
  return pendingReviews > 0;
}

function canStartImplementation(): boolean {
  return !hasPendingReviews() && canStartNewChain();
}
```

**Unblocking:**
- Triggered when REVIEW task completes
- All BLOCKED tasks re-evaluated
- First eligible task transitions to PENDING

---

## Staged Queue Management

### Queue Stages

**Stage 1: Submission**
- Task created with status PENDING
- Validation performed (schema, required fields)
- Chain ID assigned (if part of chain)
- Priority calculated

**Stage 2: Scheduling**
- Concurrency check
- Chain blocking check
- Agent availability check
- If all pass: PENDING → ACTIVE

**Stage 3: Execution**
- Container provisioned
- Agent starts work
- Heartbeat monitoring begins
- Logs streamed

**Stage 4: Completion**
- Quality gates evaluated
- PR created (if applicable)
- Chain tasks triggered
- Status updated to COMPLETED

**Stage 5: Chain Continuation**
- REVIEW task auto-created
- Artifacts passed to REVIEW
- Chain depth incremented
- Concurrency slot held until chain complete

### Queue Operations

**Pull Next Task:**
```typescript
interface PullNextTaskOptions {
  excludeTypes?: TaskType[];
  agentFilter?: AgentType;
  priorityMin?: number;
}

async function pullNextTask(options?: PullNextTaskOptions): Promise<Task | null> {
  // 1. Filter by options
  // 2. Order by priority DESC, created_at ASC
  // 3. Check concurrency limits
  // 4. Check chain blocking
  // 5. Return first eligible task
}
```

**Block Task:**
```typescript
async function blockTask(taskId: string, reason: string): Promise<void> {
  await db.run(
    'UPDATE tasks SET status = "blocked" WHERE id = ?',
    taskId
  );
  await emit('task:blocked', { taskId, reason });
}
```

**Unblock Tasks:**
```typescript
async function unblockTasks(): Promise<void> {
  const blockedTasks = await db.all(
    'SELECT * FROM tasks WHERE status = "blocked" ORDER BY priority DESC, created_at ASC'
  );
  
  for (const task of blockedTasks) {
    if (canStartTask(task)) {
      await db.run('UPDATE tasks SET status = "pending" WHERE id = ?', task.id);
      await emit('task:unblocked', { taskId: task.id });
    }
  }
}
```

---

## Concurrency Control

### Limits

**Concurrent Chains:** Maximum 3 active chains  
**Concurrent Tasks:** No limit (constrained by chains)  
**Concurrent Bots:** Maximum 3 Docker containers  

**Rationale:**
- Chain limit prevents PR explosion
- Bot limit prevents resource exhaustion
- Task limit unnecessary (chains control work)

### Worker Pool

**Architecture:** Fixed pool of 3 worker slots

**Worker Lifecycle:**
1. Worker claims task from queue
2. Worker provisions container
3. Worker monitors execution
4. Worker completes task
5. Worker returns to pool

**Worker Assignment:**
```typescript
class WorkerPool {
  private workers: Worker[] = [];
  private maxWorkers = 3;
  
  async assignTask(task: Task): Promise<Worker | null> {
    const availableWorker = this.workers.find(w => w.isIdle());
    if (availableWorker) {
      await availableWorker.execute(task);
      return availableWorker;
    }
    
    if (this.workers.length < this.maxWorkers) {
      const newWorker = new Worker();
      this.workers.push(newWorker);
      await newWorker.execute(task);
      return newWorker;
    }
    
    return null; // No workers available
  }
}
```

---

## Priority System

### Priority Levels

**P0 - Critical:** Production issues, security fixes  
**P1 - High:** Current phase work, unblocking issues  
**P2 - Normal:** Standard features, improvements  
**P3 - Low:** Nice-to-haves, polish  

### Priority Calculation

**Base Priority:** User-assigned (P0-P3)

**Adjustments:**
- Chain depth: -5 per level (deeper = lower priority)
- Retry count: -10 per retry
- Age: +1 per day waiting
- Blocking others: +20

**Formula:**
```typescript
function calculatePriority(task: Task): number {
  let priority = task.basePriority;
  priority -= task.chainDepth * 5;
  priority -= task.retryCount * 10;
  priority += Math.floor(task.ageInDays);
  if (task.isBlocking) priority += 20;
  return priority;
}
```

---

## Event-Driven Updates

### Event Types

**Task Events:**
- `task:created` - New task added
- `task:started` - Task execution began
- `task:completed` - Task finished successfully
- `task:failed` - Task failed
- `task:blocked` - Task blocked by concurrency
- `task:unblocked` - Task unblocked

**Chain Events:**
- `chain:created` - New chain started
- `chain:blocked` - Chain hit depth limit
- `chain:completed` - All chain tasks done
- `chain:failed` - Chain failed permanently

**Queue Events:**
- `queue:task_added` - Task added to queue
- `queue:task_pulled` - Task pulled for execution
- `queue:concurrency_limit` - Hit concurrency limit

### Event Subscribers

**Frontend (Socket.IO):**
- Listens to all task/chain events
- Updates UI in real-time
- No polling required

**DevBotsManager:**
- Listens to task completion
- Triggers chain tasks
- Manages worker pool

**ChainTracker:**
- Listens to chain events
- Updates chain metadata
- Enforces depth limits

---

## Metrics & Monitoring

### Queue Metrics

**Queue Depth:**
- Pending tasks by priority
- Blocked tasks count
- Active tasks count

**Throughput:**
- Tasks completed per hour
- Average task duration by type
- Queue wait time (pending → active)

**Chain Metrics:**
- Active chains count
- Average chain depth
- Chain completion rate

### Health Checks

**Queue Health:**
```typescript
interface QueueHealth {
  pendingTasks: number;
  activeTasks: number;
  blockedTasks: number;
  activeChains: number;
  availableWorkers: number;
  healthy: boolean;
}

function getQueueHealth(): QueueHealth {
  // Query database for current state
  // healthy = pendingTasks < 100 && blockedTasks < 50
}
```

---

## Error Handling

### Transaction Safety

**All queue operations wrapped in transactions:**
```typescript
async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', 
      [status, new Date().toISOString(), taskId]);
    
    if (status === 'completed') {
      await triggerChainTasks(tx, taskId);
    }
  });
}
```

**Benefits:**
- ACID compliance
- No partial updates
- Consistent state

### Deadlock Prevention

**Rule:** Always acquire locks in same order

**Implementation:**
- Tasks locked by ID (ascending order)
- Chains locked before tasks
- Never hold multiple chain locks

### Stale Task Detection

**Hung Tasks:** Active >60 seconds with no heartbeat

**Detection:**
```typescript
async function detectStaleTasks(): Promise<Task[]> {
  const cutoff = new Date(Date.now() - 60000).toISOString();
  return db.all(
    'SELECT * FROM tasks WHERE status = "active" AND started_at < ?',
    cutoff
  );
}
```

**Recovery:**
- Mark task as failed
- Create diagnostic task
- Log error for investigation

---

## Configuration

### Queue Settings

**Environment Variables:**
- `TASK_QUEUE_MAX_CHAINS` - Max concurrent chains (default: 3)
- `TASK_QUEUE_MAX_WORKERS` - Max concurrent workers (default: 3)
- `TASK_QUEUE_MAX_CHAIN_DEPTH` - Max chain depth (default: 10)
- `TASK_QUEUE_STALE_TIMEOUT` - Stale task timeout seconds (default: 60)

### Database Location

**Development:** `backend/data/app-monitor.db`  
**Production:** `/opt/app-monitor/shared/backend/data/app-monitor.db`  
**Controlled by:** `DATABASE_PATH` environment variable  

---

## Performance Optimizations

### Indexing

**Critical Indexes:**
```sql
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_chain ON tasks(chain_id);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC, created_at ASC);
CREATE INDEX idx_chains_status ON task_chains(status);
```

### Caching

**In-Memory Cache:**
- Active tasks (refreshed every 5s)
- Chain metadata (invalidated on update)
- Queue depth counters (updated on event)

**Benefits:**
- Reduces database queries
- Fast queue status checks
- Lower latency for UI updates

---

## Related Documentation

- **Dev-Bots Architecture:** `docs/architecture/dev-bots-architecture.md`
- **PR Tracking:** `docs/architecture/pr-tracking-architecture.md`
- **Error Recovery:** `docs/technicalDesigns/error-detection-and-recovery-design.md`
- **System Overview:** `docs/architecture/system-overview.md`
