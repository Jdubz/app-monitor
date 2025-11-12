# Timeout Handling Strategy

## Core Philosophy

**We do NOT automatically timeout or kill tasks.** Complex tasks may legitimately take hours, and we don't have baseline data on actual task durations yet.

---

## Three-Tier Approach

### Tier 1: Detection (Warning Only)
**Function**: `detectLongRunningTasks(warningThresholdMs)`
**Default Threshold**: 30 minutes
**Action**: LOG WARNING, no state changes

```typescript
// Every 5 minutes, check for long-running tasks
const longRunning = taskQueue.detectLongRunningTasks(1800000); // 30 min

// Logs:
// "Found 2 tasks running longer than 30 minutes (WARNING ONLY)"
// - task-123: "Refactor authentication system" (45 minutes)
// - task-456: "Migrate database schema" (62 minutes)
```

**Purpose**: Monitoring and alerting only. Gives operators visibility.

---

### Tier 2: Manual Intervention
**Function**: `manuallyTimeoutTask(taskId, reason)`
**Requires**: Human verification
**Action**: Update task status to 'timeout', record reason

```typescript
// Operator investigates and confirms task is stuck
// (e.g., Docker container crashed, process hung)
await taskQueue.manuallyTimeoutTask(
  'task-123',
  'Docker container crashed - verified by checking logs'
);
```

**Purpose**: Explicit, auditable manual intervention after verification.

---

### Tier 3: Worker Heartbeat System
**Function**: `detectStalledWorkers()`
**Default Threshold**: 30 seconds since last heartbeat
**Action**: Automatically fail tasks from dead workers

```typescript
// Every minute, check for workers that stopped sending heartbeats
const stalledWorkers = taskQueue.detectStalledWorkers();

// Automatically marks tasks as 'failed' with reason:
// "Worker heartbeat timeout"
```

**Purpose**: Handle infrastructure failures (crashes, OOM kills, etc.)

**Key Difference**: This detects **worker failures**, not slow tasks.
- Worker alive + task slow = task continues
- Worker dead + task running = task failed (can retry)

---

## State Transitions

```
┌─────────────────────────────────────────────────────────────┐
│                         RUNNING                             │
│                                                             │
│  ┌──────────────┐       ┌──────────────┐                  │
│  │   Working    │       │  Long Time   │                  │
│  │   Normally   │──────>│  (WARNING)   │                  │
│  │   (< 30min)  │       │  (> 30min)   │                  │
│  └──────────────┘       └──────┬───────┘                  │
│                                 │                           │
│                                 │ Still working!            │
│                                 │ (no action)               │
│                                 ▼                           │
│                         ┌──────────────┐                   │
│                         │  Very Long   │                   │
│                         │  (> 2 hours) │                   │
│                         └──────┬───────┘                   │
│                                │                           │
│                                │ Operator investigates     │
│                                │ manually                  │
│                                ▼                           │
└────────────────────────────────────────────────────────────┘
                                 │
                     ┌───────────┴───────────┐
                     │                       │
          ┌──────────▼──────────┐   ┌───────▼────────┐
          │  Still legitimate   │   │  Actually stuck │
          │  work - continue    │   │  manualTimeout  │
          └─────────────────────┘   └────────┬────────┘
                                              │
                                              ▼
                                      ┌──────────────┐
                                      │   TIMEOUT    │
                                      │   (manual)   │
                                      └──────────────┘


PARALLEL: Worker Heartbeat System
┌──────────────────────────────────────────────────────────┐
│  Worker sends heartbeat every 15 seconds                 │
│  ↓                                                        │
│  Last heartbeat > 30 seconds ago?                        │
│  ↓                                                        │
│  YES → Worker crashed → Auto-fail task → Can retry       │
└──────────────────────────────────────────────────────────┘
```

---

## Data-Driven Future: Learning Baselines

After collecting sufficient task completion data (50+ per type/complexity):

```sql
-- Analyze actual durations
SELECT
  type,
  complexity,
  COUNT(*) as sample_size,
  AVG(duration_ms) / 60000.0 as avg_minutes,
  MAX(duration_ms) / 60000.0 as max_minutes
FROM task_executions te
JOIN tasks t ON te.task_id = t.id
WHERE exit_code = 0
AND ended_at > datetime('now', '-30 days')
GROUP BY type, complexity;

-- Example results:
-- type: 'implementation', complexity: 'simple'
--   sample_size: 85, avg: 3.2 min, max: 12 min
-- type: 'implementation', complexity: 'medium'
--   sample_size: 42, avg: 18.5 min, max: 65 min
-- type: 'implementation', complexity: 'complex'
--   sample_size: 15, avg: 127 min, max: 310 min
```

**Then** we can consider smart thresholds:
- Simple: warn at 30 min (10x average)
- Medium: warn at 2 hours (6x average)
- Complex: warn at 6 hours (3x max observed), manual timeout only

---

## Benefits of This Approach

### ✅ No False Positives
- Complex tasks complete naturally
- No legitimate work interrupted
- No need to babysit the system

### ✅ Clear Escalation Path
1. Automated detection → Logs warning
2. Human investigation → Determines if stuck
3. Manual intervention → Explicit action with reason

### ✅ Auditable
- Every manual timeout logged with reason
- Task execution history preserved
- Can review timeout decisions later

### ✅ Handles Real Failures
- Worker heartbeat catches crashes immediately
- Infrastructure failures don't leave zombie tasks
- Automatic recovery with retry mechanism

### ✅ Learning Over Time
- Collect actual duration data
- Understand task complexity impact
- Set intelligent thresholds later

---

## Example Workflows

### Scenario 1: Legitimate Long-Running Task
```
09:00 - Task starts: "Migrate 10,000 database records"
09:30 - WARNING: Task running > 30 minutes
        Action: None (still working)
10:00 - WARNING: Task running > 60 minutes
        Action: None (still working)
10:45 - Task completes successfully
        Duration recorded: 105 minutes
        Adds to baseline data
```

### Scenario 2: Stuck Task Detected
```
09:00 - Task starts: "Add authentication middleware"
09:30 - WARNING: Task running > 30 minutes
        Operator checks: Container still alive, CPU active
        Action: Wait
10:30 - WARNING: Task running > 90 minutes
        Operator checks: Container hung, no activity
        Action: manuallyTimeoutTask('task-789', 'Process hung - no activity for 60 minutes')
        Status → 'timeout', available for retry
```

### Scenario 3: Worker Crash
```
09:00 - Task starts: "Refactor routing logic"
09:15 - Docker container OOM killed
09:16 - Heartbeat missed (15s + 15s = 30s threshold)
        detectStalledWorkers() auto-fails task
        Reason: "Worker heartbeat timeout"
        Status → 'failed', can_retry = true
09:17 - Task automatically retried with new worker
```

---

## Configuration

```typescript
// In DevBotsManager or similar
const MONITORING_CONFIG = {
  // How often to check for long-running tasks
  longRunningCheckInterval: 300000, // 5 minutes

  // Threshold for warning logs (does NOT fail task)
  longRunningWarningThreshold: 1800000, // 30 minutes

  // How often to check worker heartbeats
  heartbeatCheckInterval: 60000, // 1 minute

  // Worker considered dead after this time
  heartbeatTimeout: 30000, // 30 seconds

  // Minimum samples before considering automatic timeouts
  minSamplesForAutoTimeout: 50,

  // Multiplier above P95 duration for automatic timeout
  // (only after min samples collected)
  timeoutMultiplier: 3.0
};
```

---

## Monitoring & Alerting

### Metrics to Track
- Number of long-running tasks (> 30 min)
- Number of very long-running tasks (> 2 hours)
- Manual timeout rate (should be rare)
- Worker stall rate (infrastructure health)
- Task retry rate after failures

### Alert Thresholds
- **INFO**: Task running > 30 minutes
- **WARN**: Task running > 2 hours
- **ERROR**: Task running > 6 hours (investigate immediately)
- **CRITICAL**: Worker stall rate > 10% (infrastructure issue)

---

## Summary

| Method | Action | Automatic? | Purpose |
|--------|--------|------------|---------|
| `detectLongRunningTasks()` | Log warning | Yes | Monitoring |
| `manuallyTimeoutTask()` | Fail task | No (manual) | Verified stuck tasks |
| `detectStalledWorkers()` | Fail task | Yes | Infrastructure failures |
| `getTaskDurationStats()` | Analyze data | - | Learn baselines |

**Key Principle**: Prefer false negatives (missing a stuck task) over false positives (killing legitimate work). Operators can always intervene manually. The system alerts but doesn't assume.
