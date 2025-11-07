# Recovery Queue Management

**Critical Design Decisions for Repair Bot Execution**

## Key Requirements

### 1. Repair Bots Count Towards Concurrency Limit ✅

**Rule:** Cleanup and follow-up bots count as regular tasks towards the maximum concurrent bot limit.

**Why:** Prevents resource exhaustion and maintains system stability.

**Implementation:**
```typescript
const cleanupTask = await this.devBotsManager.addTask({
  // ... task config ...
  metadata: {
    countsTowardsConcurrencyLimit: true // Explicitly tracked
  }
});
```

**Example Scenario:**
```
Max Concurrent Bots: 3
Currently Running: 2 regular tasks

Task fails → Cleanup bot launches
Running: 2 regular + 1 cleanup = 3 (at limit)

No new tasks can start until one completes
```

### 2. Priority Queue Jumping ✅

**Rule:** Repair bots (cleanup and follow-up) jump to the front of the queue.

**Why:** Fix issues immediately before attempting more work that might also fail.

**Implementation:**
```typescript
const cleanupTask = await this.devBotsManager.addTask({
  // ... task config ...
  priority: 100 // HIGH PRIORITY - jumps to front
});
```

**Queue Behavior:**
```
BEFORE failure:
Queue: [Task A, Task B, Task C, Task D]
Running: [Task E, Task F]

Task F fails → Cleanup bot created

AFTER failure (queue reordered):
Queue: [CLEANUP BOT for F, Task A, Task B, Task C, Task D]
Running: [Task E] (Task F removed)

Next assignment:
Running: [Task E, CLEANUP BOT for F]
```

### 3. Serial Execution (Critical!) ✅

**Rule:** Cleanup bot MUST complete before follow-up bot is even created.

**Why:** The follow-up bot depends on the cleanup bot's fix being applied.

**Implementation:**
```typescript
// Stage 1: Launch cleanup bot
const cleanupResult = await this.runCleanupBot(context, attempt);

// WAIT for cleanup to finish (blocking)
if (cleanupResult.status !== 'success') {
  // DO NOT launch follow-up bot!
  return this.handleCleanupFailure(attempt, cleanupResult);
}

// Stage 2: Only launch follow-up if cleanup succeeded
const followupResult = await this.runFollowupBot(context, cleanupResult, attempt);
```

**Flow:**
```
┌─────────────────┐
│ Task Fails      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Create Cleanup Bot      │
│ Priority: 100           │
│ Counts: Yes             │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Add to Queue (front)    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Wait for Assignment     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Execute Cleanup Bot     │
│ (Counts towards limit)  │
└────────┬────────────────┘
         │
    ┌────┴─────┐
    │ Success? │
    └────┬─────┘
         │
   ┌─────┴─────┐
   │ Yes       │ No
   ▼           ▼
┌─────────┐  ┌──────────────────┐
│ Create  │  │ Hard Fail        │
│ Followup│  │ Do NOT create    │
│ Bot     │  │ follow-up bot    │
└────┬────┘  └──────────────────┘
     │
     ▼
┌─────────────────────────┐
│ Add to Queue (front)    │
│ Priority: 100           │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Wait for Assignment     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Execute Follow-up Bot   │
│ (Counts towards limit)  │
└────────┬────────────────┘
         │
    ┌────┴─────┐
    │ Success? │
    └────┬─────┘
         │
   ┌─────┴─────┐
   │ Yes       │ No
   ▼           ▼
┌─────────┐  ┌──────────────┐
│ Original│  │ Hard Fail    │
│ Task    │  │ For Manual   │
│ Recovered│  │ Review       │
└─────────┘  └──────────────┘
```

## Concurrency Management

### How Repair Bots Affect the Queue

**Scenario: Max 3 Concurrent, All Slots Full**

```
Time: T0
Queue: [Task A, Task B, Task C]
Running: [Task 1, Task 2, Task 3]
Status: Queue full, tasks waiting

Time: T1 - Task 2 fails
Queue: [CLEANUP BOT for 2, Task A, Task B, Task C]
Running: [Task 1, Task 3]
Status: Slot available (Task 2 failed)

Time: T2 - Next assignment
Queue: [Task A, Task B, Task C]
Running: [Task 1, Task 3, CLEANUP BOT for 2]
Status: Queue full again (cleanup bot running)

Time: T3 - Cleanup bot succeeds
Queue: [FOLLOWUP BOT for 2, Task A, Task B, Task C]
Running: [Task 1, Task 3]
Status: Slot available (cleanup completed)

Time: T4 - Next assignment
Queue: [Task A, Task B, Task C]
Running: [Task 1, Task 3, FOLLOWUP BOT for 2]
Status: Queue full (follow-up bot running)

Time: T5 - Follow-up bot succeeds
Queue: [Task A, Task B, Task C]
Running: [Task 1, Task 3]
Status: Task 2 RECOVERED, slot available for Task A

Time: T6 - Next assignment
Queue: [Task B, Task C]
Running: [Task 1, Task 3, Task A]
Status: Back to normal operation
```

### Priority Queue Implementation

The task queue needs to support priority ordering:

```typescript
interface TaskQueuePriority {
  // Higher number = higher priority
  priority: number;
  createdAt: number; // Tie-breaker for same priority
}

// Queue ordering logic
function compareTaskPriority(a: Task, b: Task): number {
  // Higher priority first
  if (a.priority !== b.priority) {
    return b.priority - a.priority;
  }
  // Same priority - FIFO by creation time
  return a.createdAt - b.createdAt;
}

// Priority levels
const TASK_PRIORITIES = {
  REPAIR_BOT: 100,      // Cleanup and follow-up bots
  HIGH: 50,             // User-flagged urgent tasks
  NORMAL: 0,            // Regular tasks (default)
  LOW: -50              // Background maintenance
};
```

### Preventing Starvation

**Problem:** If failures happen frequently, repair bots could monopolize the queue.

**Solution:** Track repair bot count and limit:

```typescript
const MAX_CONCURRENT_REPAIR_BOTS = Math.ceil(MAX_CONCURRENT_BOTS / 2);

// Before launching repair bot
const currentRepairBots = this.countRunningRepairBots();
if (currentRepairBots >= MAX_CONCURRENT_REPAIR_BOTS) {
  logger.warn({
    category: 'recovery',
    action: 'repair_bot_limit_reached',
    message: 'Too many repair bots running, deferring recovery',
    details: {
      currentRepairBots,
      limit: MAX_CONCURRENT_REPAIR_BOTS
    }
  });
  // Don't launch repair bot - let task fail for now
  return { status: 'not_recoverable', reason: 'Too many concurrent repairs' };
}
```

**Example with limit:**
```
Max Concurrent: 3
Max Repair Bots: 1 (ceil(3/2))

Running: [Task A, Task B, Task C]
Task B fails → Cleanup bot launches
Running: [Task A, CLEANUP BOT for B, Task C]

Task C fails → Check repair bot count
Current repair bots: 1 (already at limit)
Action: Do NOT launch cleanup bot for C
Result: Task C fails normally, queued for manual review
```

## Database Schema Updates

### Task Table Changes

```sql
ALTER TABLE tasks ADD COLUMN priority INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN is_repair_bot BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN original_task_id TEXT;
ALTER TABLE tasks ADD COLUMN repair_stage TEXT; -- 'cleanup' | 'followup'

CREATE INDEX idx_tasks_priority ON tasks(priority DESC, created_at ASC);
CREATE INDEX idx_tasks_repair_bots ON tasks(is_repair_bot, status);
```

### Queue Query Updates

```sql
-- Get next pending task (with priority)
SELECT * FROM tasks
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT 1;

-- Count running repair bots
SELECT COUNT(*) FROM tasks
WHERE status = 'running'
  AND is_repair_bot = true;

-- Get all repair bots for a task
SELECT * FROM tasks
WHERE original_task_id = ?
  AND is_repair_bot = true
ORDER BY created_at ASC;
```

## Testing Scenarios

### Test 1: Serial Execution Enforcement

```typescript
test('follow-up bot only launches after cleanup succeeds', async () => {
  // 1. Create failing task
  const task = await createFailingTask();

  // 2. Trigger recovery
  const recovery = orchestrator.attemptRecovery(context);

  // 3. Verify cleanup bot launched
  await waitForTask((tasks) =>
    tasks.some(t => t.metadata.isCleanupBot)
  );

  // 4. Verify follow-up NOT YET launched
  const followupExists = taskQueue.findTask(t => t.metadata.isFollowupBot);
  expect(followupExists).toBe(null);

  // 5. Complete cleanup bot successfully
  await completeTask(cleanupBotId, 'success');

  // 6. NOW verify follow-up launches
  await waitForTask((tasks) =>
    tasks.some(t => t.metadata.isFollowupBot)
  );
});
```

### Test 2: Cleanup Failure Skips Follow-up

```typescript
test('follow-up bot not launched if cleanup fails', async () => {
  // 1. Create failing task
  const task = await createFailingTask();

  // 2. Trigger recovery
  const recovery = orchestrator.attemptRecovery(context);

  // 3. Complete cleanup bot with FAILURE
  await completeTask(cleanupBotId, 'failed');

  // 4. Wait a reasonable time
  await sleep(5000);

  // 5. Verify follow-up NEVER launched
  const followupExists = taskQueue.findTask(t => t.metadata.isFollowupBot);
  expect(followupExists).toBe(null);

  // 6. Verify recovery marked as hard failed
  expect(recovery.status).toBe('hard_failed');
});
```

### Test 3: Priority Queue Jump

```typescript
test('repair bots jump to front of queue', async () => {
  // 1. Fill queue with normal tasks
  await addTask({ title: 'Task A', priority: 0 });
  await addTask({ title: 'Task B', priority: 0 });
  await addTask({ title: 'Task C', priority: 0 });

  // Queue: [A, B, C]

  // 2. Trigger failure and recovery
  await failTask('Task X');

  // 3. Verify cleanup bot at front
  const queue = await taskQueue.getPendingTasks();
  expect(queue[0].metadata.isCleanupBot).toBe(true);
  expect(queue[0].title).toContain('Task X');

  // Queue: [CLEANUP for X, A, B, C]
});
```

### Test 4: Concurrency Limits Respected

```typescript
test('repair bots count towards concurrency limit', async () => {
  const MAX_CONCURRENT = 3;

  // 1. Start 3 normal tasks (at limit)
  await startTask('Task A');
  await startTask('Task B');
  await startTask('Task C');

  expect(countRunningTasks()).toBe(3);

  // 2. Fail Task B
  await failTask('Task B');

  // 3. Verify cleanup bot waits (queue still full)
  const running = await taskQueue.getRunningTasks();
  expect(running.some(t => t.metadata.isCleanupBot)).toBe(false);

  // 4. Complete Task A
  await completeTask('Task A');

  // 5. Now cleanup bot can start
  await waitForTask(t => t.metadata.isCleanupBot && t.status === 'running');

  // 6. Verify still at limit
  expect(countRunningTasks()).toBe(3);
});
```

## Integration Checklist

- [ ] Add `priority` field to Task interface
- [ ] Add `is_repair_bot` field to Task interface
- [ ] Update task queue to sort by priority
- [ ] Implement repair bot counting
- [ ] Add repair bot limit enforcement
- [ ] Update concurrency checker to include repair bots
- [ ] Add serial execution enforcement (await cleanup before launching follow-up)
- [ ] Add logging for queue position changes
- [ ] Update metrics to track repair bot usage
- [ ] Add tests for all scenarios above

## Summary

✅ **Repair bots count towards max concurrent limit**
- Prevents resource exhaustion
- Maintains system stability

✅ **Repair bots jump queue (priority: 100)**
- Fixes issues before more failures
- Faster recovery time

✅ **Serial execution enforced**
- Cleanup completes BEFORE follow-up launches
- Follow-up only launches if cleanup succeeds
- No wasted work

✅ **Starvation prevention**
- Max repair bots limited to ceil(max_concurrent / 2)
- Regular tasks still get processed
- System remains balanced
