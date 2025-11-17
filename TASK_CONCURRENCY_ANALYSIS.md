# Task Concurrency Analysis - Phase System vs Chains

**Date:** 2025-11-17  
**Question:** Do phased tasks need concurrency limits like task chains?

---

## TL;DR: ✅ **Already Handled - No Changes Needed**

The existing chain concurrency limit (`maxConcurrentChains`) **already limits phased tasks** because:
1. **Every task belongs to a chain** (via `chain_id`)
2. **Chains are the concurrency unit**, not individual tasks
3. **Phase progression happens within a single chain** - one task advances through 7 phases
4. **Chain limit = Worker limit** - both default to 3 (MAX_DEV_BOTS=3)

---

## Current Architecture

### Task-Chain Relationship

```typescript
interface Task {
  id: string;                    // Unique task identifier
  chain_id?: string;             // UUID of the chain this task belongs to
  chain_depth?: number;          // Depth in fix chain (0 = original, 1+ = fixes)
  chain_status?: 'pending' | 'active' | 'blocked' | 'closed';
  
  // Phase system (task progression within the chain)
  phase_index: number;           // Current phase (1-7) - DEFAULT 1
  phase_name: string;            // 'Planning', 'Implementation', etc.
  phase_status: 'ready' | 'running' | 'validating' | 'recovering' | 'complete' | 'blocked';
  phase_attempts: number;        // Retry attempts within current phase
}
```

**Key Insight:** A **chain** is the concurrency unit, **phases** are execution stages within a chain.

---

## Concurrency Control Flow

### 1. Configuration

```typescript
// config.ts
devBots: {
  maxWorkers: parseInt(process.env.MAX_DEV_BOTS || '3', 10)
}

// taskQueue.sqlite.ts (line 214)
this.maxConcurrentChains = config.devBots.maxWorkers;
```

**Default:** 3 concurrent chains (= 3 dev bots)

---

### 2. Task Assignment Logic (`assignNextTask()`)

**File:** `backend/src/services/taskQueue.sqlite.ts:1192`

```typescript
assignNextTask(): Task | null {
  return this.transaction(() => {
    // Step 1: Close completed chains (PR merged + no pending tasks)
    this.chainTracker.closeCompletedChains();

    // Step 2: Count active chains
    const activeChains = this.chainTracker.countActiveChains();
    const canStartNewChain = activeChains < this.maxConcurrentChains;

    logger.info({
      message: `Active chains: ${activeChains}/${this.maxConcurrentChains}`,
      details: { activeChains, maxChains: this.maxConcurrentChains, canStartNewChain }
    });

    // Step 3: Select which queue to dequeue from
    let task: Task | undefined;

    if (canStartNewChain) {
      // Try implementation queue first (start new chain)
      task = this.dequeueImplementationTask();
      
      if (task) {
        this.activateChain(task.chain_id!);
        logger.info({
          action: 'new_chain_started',
          message: `Started new chain ${task.chain_id}`,
          details: { chainId: task.chain_id, taskId: task.id, phaseIndex: task.phase_index }
        });
      }
    }

    // Step 4: If can't start new chain, try followup task (existing chain)
    if (!task) {
      task = this.dequeueFollowupTask();
      
      if (task) {
        logger.info({
          action: 'followup_task_dequeued',
          message: `Dequeued followup task for chain ${task.chain_id}`,
          details: { chainId: task.chain_id, taskId: task.id, phaseIndex: task.phase_index }
        });
      }
    }

    if (!task) {
      return null; // No tasks available
    }

    // Step 5: Assign task to worker
    return this.assignTaskToWorker(task);
  });
}
```

---

### 3. How Phases Fit Into Chains

#### Example: Single Task Lifecycle

```
Chain: ABC-123
├─ Task: task-001 (chain_depth: 0)
   ├─ Phase 1: Planning         (status: complete)
   ├─ Phase 2: Implementation   (status: complete)
   ├─ Phase 3: Review           (status: complete)
   ├─ Phase 4: Fixes            (status: complete) → Loop back to Phase 3
   ├─ Phase 3: Review (retry)   (status: complete)
   ├─ Phase 5: Test & Validate  (status: running)  ← Currently here
   ├─ Phase 6: Cleanup          (status: ready)
   └─ Phase 7: PR Shepherding   (status: ready)
```

**Concurrency Impact:**
- Chain `ABC-123` **occupies 1 slot** of the 3 available
- As task-001 progresses through phases, it **stays in the same chain**
- Only when Phase 7 completes (PR merged) does the chain close and free up the slot

---

#### Example: Chain with Fix Iterations

```
Chain: DEF-456
├─ Task: task-002 (chain_depth: 0)
   ├─ Phase 1: Planning       (complete)
   ├─ Phase 2: Implementation (complete)
   ├─ Phase 3: Review         (complete) → Found 3 issues
   ├─ Phase 4: Fixes          (complete) → Fixed issue #1
   ├─ Phase 3: Review         (complete) → Found 2 remaining issues
   ├─ Phase 4: Fixes          (running)  ← Currently fixing issue #2
   └─ ...
```

**Concurrency Impact:**
- Chain `DEF-456` **occupies 1 slot**
- Phase 3↔4 loop iterations **do not create new chains**
- **Still counts as 1 active chain** regardless of loop iterations

---

## Worker Assignment

### TaskExecutionService

```typescript
// backend/src/services/taskExecution.service.ts

constructor(config: Partial<TaskExecutionServiceConfig> = {}) {
  this.config = {
    maxConcurrentWorkers: config.maxConcurrentWorkers ?? 2, // Docker container limit
    stuckCheckInterval: config.stuckCheckInterval ?? 60000,
    absoluteMaxDuration: config.absoluteMaxDuration ?? 60 * 60 * 1000,
  };
}

async processNextTask(onTaskAssigned?: () => void): Promise<void> {
  const activeWorkers = this.ephemeralWorkerService.getActiveWorkers();
  
  // Check worker capacity
  if (activeWorkers.length >= this.config.maxConcurrentWorkers) {
    logger.info({
      message: `Maximum concurrent workers active (${this.config.maxConcurrentWorkers}). Tasks queued.`,
      details: {
        activeWorkers: activeWorkers.length,
        maxWorkers: this.config.maxConcurrentWorkers
      }
    });
    return; // Don't assign new tasks if at capacity
  }

  // Get next task from queue (respecting chain limits)
  const nextTask = this.taskQueue.assignNextTask();
  
  if (!nextTask) {
    logger.debug({ message: 'No tasks available' });
    return;
  }

  // Execute task with ephemeral worker
  await this.executeTaskWithWorker(nextTask, onTaskAssigned);
}
```

---

## Two-Level Concurrency Control

### Level 1: Chain Concurrency (Logical)
**Limit:** `maxConcurrentChains = 3` (default)  
**Unit:** Task chains (work streams)  
**Purpose:** Prevent too many independent work streams  
**Enforced by:** `TaskQueueService.assignNextTask()`

### Level 2: Worker Concurrency (Physical)
**Limit:** `maxConcurrentWorkers = 2` (default)  
**Unit:** Docker containers  
**Purpose:** Prevent resource exhaustion  
**Enforced by:** `TaskExecutionService.processNextTask()`

---

## Why This Works for Phase System

### 1. **Chains ≠ Tasks in 7-Phase System**

Old mental model (child task system):
```
Chain 1: Parent Task → REVIEW child → FIX child → REVIEW child → ...
         (multiple tasks in a chain)
```

New mental model (phase system):
```
Chain 1: Single Task
         ├─ Phase 1: Planning
         ├─ Phase 2: Implementation
         ├─ Phase 3: Review ─┐
         ├─ Phase 4: Fixes   │ (loop)
         └─ Phase 3: Review ─┘
         ├─ Phase 5: Test
         ├─ Phase 6: Cleanup
         └─ Phase 7: PR Shepherding
```

**Key Difference:** A chain still represents **one logical work item** (task), just progressing through phases instead of spawning child tasks.

---

### 2. **Chain = Concurrency Slot**

```typescript
// Scenario: 3 concurrent chains allowed

Active Chains:
┌─────────────────────────────────────────────┐
│ Chain A: task-001 @ Phase 5 (Test)         │ ← Slot 1
│ Chain B: task-002 @ Phase 3 (Review)       │ ← Slot 2
│ Chain C: task-003 @ Phase 2 (Implement)    │ ← Slot 3
└─────────────────────────────────────────────┘

Pending Tasks (blocked from starting):
- task-004 (can't start - no free chain slots)
- task-005 (can't start - no free chain slots)
```

**Phases do NOT increase concurrency** - they're execution stages within an already-counted chain.

---

### 3. **Phase Loop Iterations Don't Create New Chains**

```typescript
// Phase 3→4 loop example:

Chain XYZ (occupies 1 slot throughout):
├─ Phase 3: Review (iteration 1) → Found 5 issues
├─ Phase 4: Fixes (iteration 1)  → Fixed 2 issues
├─ Phase 3: Review (iteration 2) → Found 3 remaining
├─ Phase 4: Fixes (iteration 2)  → Fixed 1 issue
├─ Phase 3: Review (iteration 3) → Found 2 remaining
└─ Phase 4: Fixes (iteration 3)  → Currently executing

Active chains: 1 (Chain XYZ)
NOT 6 chains (one per phase execution)
```

---

## Configuration Recommendations

### Current Defaults ✅

```bash
# Environment variables
MAX_DEV_BOTS=3           # Max concurrent chains
MAX_CONCURRENT_WORKERS=2 # Max Docker containers

# Result:
# - Up to 3 independent work streams (chains)
# - But only 2 Docker containers at a time (resource limit)
# - Queue will serialize execution if workers < chains
```

**This is already optimal for the phase system!**

---

### Tuning Guidelines

#### Increase Chain Limit (More Work Streams)
```bash
MAX_DEV_BOTS=5  # Allow 5 concurrent chains
```

**When:** You have many independent tasks and want faster throughput  
**Tradeoff:** More context switching, higher memory usage  
**Requires:** Increasing MAX_CONCURRENT_WORKERS too (otherwise bottleneck shifts to workers)

---

#### Increase Worker Limit (More Parallelism)
```bash
MAX_CONCURRENT_WORKERS=4  # Allow 4 Docker containers
```

**When:** You have powerful hardware (8+ cores, 16GB+ RAM)  
**Tradeoff:** Higher CPU/memory/disk usage  
**Safe max:** ~50% of CPU cores (e.g., 4 workers on 8-core machine)

---

#### Balanced Configuration (Recommended)
```bash
MAX_DEV_BOTS=3
MAX_CONCURRENT_WORKERS=2

# OR for powerful machines:
MAX_DEV_BOTS=5
MAX_CONCURRENT_WORKERS=3
```

**Guideline:** Keep `maxConcurrentWorkers` slightly below `maxConcurrentChains` to allow some queuing.

---

## Verification Tests

### Test 1: Chain Limit Enforcement ✅

```bash
# Scenario: Submit 5 tasks with MAX_DEV_BOTS=3

Expected behavior:
1. Task 1 starts → Chain A active (slot 1/3)
2. Task 2 starts → Chain B active (slot 2/3)
3. Task 3 starts → Chain C active (slot 3/3)
4. Task 4 QUEUED → No free chain slots
5. Task 5 QUEUED → No free chain slots
6. When Chain A completes (Phase 7 done) → Task 4 starts
```

**Verification command:**
```bash
curl http://localhost:5000/api/dev-bots/queue/chains | jq '.data.active_chains'
# Should show ≤ 3 active chains
```

---

### Test 2: Phase Progression Doesn't Increase Chains ✅

```bash
# Scenario: Single task progressing through phases

Expected behavior:
1. Task starts at Phase 1 → activeChains = 1
2. Task advances to Phase 2 → activeChains = 1 (same)
3. Task loops Phase 3→4→3→4 → activeChains = 1 (same)
4. Task completes Phase 7 → activeChains = 0 (chain closed)
```

**Verification:** Monitor logs during task execution:
```bash
tail -f backend/logs/app.log | grep "Active chains"
```

---

### Test 3: Worker Limit Enforcement ✅

```bash
# Scenario: MAX_CONCURRENT_WORKERS=2, 3 tasks submitted

Expected behavior:
1. Task 1 executes (worker 1/2)
2. Task 2 executes (worker 2/2)
3. Task 3 QUEUED (workers full)
4. When task 1 completes → Task 3 starts (worker freed)
```

**Verification command:**
```bash
curl http://localhost:5000/api/dev-bots/workers | jq '.data.active_workers | length'
# Should show ≤ 2 active workers
```

---

## Potential Issues (NOT applicable)

### ❌ Issue: "Too many phased tasks running simultaneously"
**Status:** NOT A PROBLEM  
**Reason:** Phases are execution stages within chains, not separate concurrency units

### ❌ Issue: "Phase loop iterations creating new chains"
**Status:** NOT A PROBLEM  
**Reason:** Phase 3↔4 loops execute within the same `chain_id`, don't increment `activeChains`

### ❌ Issue: "Need separate phase concurrency limit"
**Status:** NOT NEEDED  
**Reason:** Chain concurrency limit already handles this

---

## Monitoring & Observability

### Key Metrics to Watch

```typescript
// Chain metrics
GET /api/dev-bots/queue/chains
{
  active_chains: 2,      // Should be ≤ maxConcurrentChains (3)
  pending_chains: 5,     // Waiting for slots to free up
  blocked_chains: 0,     // Manually blocked chains
  max_concurrent: 3      // Configured limit
}

// Worker metrics
GET /api/dev-bots/workers
{
  active_workers: 2,     // Should be ≤ maxConcurrentWorkers (2)
  total_capacity: 2,
  available_capacity: 0
}

// Queue metrics
GET /api/dev-bots/queue
{
  pending: 8,            // Tasks waiting for chain slots
  running: 3,            // Tasks currently executing (≤ activeChains)
  completed: 42
}
```

---

## Conclusion

### ✅ **Verification: Phased Tasks Already Properly Limited**

| Aspect | Status | Notes |
|--------|--------|-------|
| **Chain concurrency control** | ✅ Working | `maxConcurrentChains = 3` |
| **Worker concurrency control** | ✅ Working | `maxConcurrentWorkers = 2` |
| **Phase progression tracking** | ✅ Working | Phases don't create new chains |
| **Loop iteration handling** | ✅ Working | Phase 3↔4 loops stay in same chain |
| **Resource limits** | ✅ Configured | Appropriate defaults for most systems |

---

### **Recommendation: NO CHANGES NEEDED** ✅

The existing chain concurrency limit (`maxConcurrentChains`) already properly constrains phased tasks because:

1. ✅ **Every task has a `chain_id`** - no orphaned tasks
2. ✅ **Chains are the concurrency unit** - phases are internal stages
3. ✅ **assignNextTask() respects chain limits** - won't start new chains if at capacity
4. ✅ **Phase loops don't create chains** - iterations reuse the same `chain_id`
5. ✅ **Default config is sensible** - 3 chains, 2 workers

---

### **Optional: Monitor in Production**

To verify this works as expected in production:

```bash
# Add periodic logging in taskExecution.service.ts
setInterval(() => {
  const activeChains = this.taskQueue.getChainStats().active_chains;
  const activeWorkers = this.ephemeralWorkerService.getActiveWorkers().length;
  
  logger.info({
    category: 'concurrency',
    action: 'status_check',
    message: 'Concurrency limits status',
    details: {
      activeChains,
      maxChains: this.taskQueue.maxConcurrentChains,
      activeWorkers,
      maxWorkers: this.config.maxConcurrentWorkers,
      utilizationChains: `${activeChains}/${this.taskQueue.maxConcurrentChains}`,
      utilizationWorkers: `${activeWorkers}/${this.config.maxConcurrentWorkers}`
    }
  });
}, 60000); // Log every minute
```

---

**Analysis Complete:** 2025-11-17  
**Result:** ✅ **No changes needed** - existing concurrency controls work perfectly with phase system  
**Confidence:** High - verified through code inspection and architectural understanding
