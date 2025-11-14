# Task Management Services - Quick Reference

| Service | Lines | Type | SRP | Key Responsibility | Status |
|---------|-------|------|-----|-------------------|--------|
| **TaskQueueService** | 2,041 | Repository | ✓ | SQLite task persistence, staged queue, chain mgmt | Core |
| **DevBotsManager** | 718 | Facade | ⚠️ | System orchestration (20+ services) | Core |
| **TaskExecutionService** | 1,381 | Orchestrator | ⚠️ | Docker execution, agent selection, safety checks | Core |
| **TaskCompletionService** | 641 | Handler | ⚠️ | Post-execution validation, quality gates, cleanup | Core |
| **ChainTrackerService** | 225 | Tracker | ✓ | Chain lifecycle management, queue stats | Supporting |
| **TaskClassifier** | 287 | Classifier | ✓ | Task auto-classification, complexity estimation | Supporting |
| **TaskCreationService** | 238 | Service | ✓ | Task validation, deduplication, creation | Supporting |
| **TaskQueueMetricsService** | 276 | Analytics | ✓ | Task metrics, performance analysis, agent comparison | Supporting |
| **TaskPersistence** | 305 | Legacy | ✓ | File-based backup (deprecated - use SQLite) | Legacy |

## Service Dependencies

```
Input: Task Request
  ↓
TaskCreationService (validate, deduplicate)
  ↓
TaskQueueService.createTask() → SQLite
  ↓
TaskExecutionService.assignNextTask()
  ├── ChainTrackerService (queue logic)
  ├── TaskClassifier (agent selection)
  └── [Docker execution]
      ↓
TaskCompletionService (post-execution)
  ├── TaskVerificationService
  ├── QualityGatesValidator
  └── TaskCompletionService.completeEphemeralTask()
      ↓
      TaskQueueService.completeTask() → SQLite
      ↓
      Output: Task complete
```

## Key Metrics Captured

| What | Where | Method | Frequency |
|------|-------|--------|-----------|
| Task duration | TaskQueueMetricsService | getTaskDurationStats() | On-demand |
| Queue health | TaskQueueMetricsService | getQueueMetrics() | On-demand |
| Agent comparison | TaskQueueMetricsService | getAgentComparisonMetrics() | On-demand |
| Chain status | ChainTrackerService | getChainStats() | On-demand |
| Long-running tasks | TaskQueueService | detectLongRunningTasks() | Via worker |
| Stalled workers | TaskQueueService | detectStalledWorkers() | Via worker |

## Error Handling by Service

| Service | Pattern | Recovery |
|---------|---------|----------|
| TaskQueueService | Graceful degradation (missing columns) | Logging, rollback |
| TaskCreationService | Validation + exception throwing | Prevent creation |
| TaskExecutionService | Circuit breaker (Docker failures) | SimpleFailureRecovery |
| TaskCompletionService | Try-catch with non-blocking failures | Log, continue |
| ChainTrackerService | SQL query errors | Log, return empty |

## Configuration Options

| Service | Config | Default | Purpose |
|---------|--------|---------|---------|
| TaskExecutionService | maxConcurrentWorkers | 2 | Worker concurrency limit |
| TaskExecutionService | stuckCheckInterval | 60s | Stuck task detection frequency |
| TaskExecutionService | absoluteMaxDuration | 60min | Max task duration |
| TaskCompletionService | enableQualityGates | true | Quality validation |
| TaskCompletionService | enableTaskVerification | true | Acceptance criteria check |
| TaskQueueService | maxConcurrentChains | maxWorkers | Chain concurrency limit |

## Public API Surface

### Creating Tasks
```typescript
const result = devBotsManager.addTask(taskData)
// Returns: { task, validation: { isValid, errors, warnings, suggestions } }
```

### Executing Tasks
```typescript
await devBotsManager.assignNextTask()
// Automatically assigns next queued task to available worker
```

### Monitoring
```typescript
const status = await devBotsManager.getSystemStatus()
const metrics = devBotsManager.getQueueMetrics()
const stats = devBotsManager.getTaskDurationStats(daysBack)
const comparison = devBotsManager.getAgentComparisonMetrics()
```

### Retry & Recovery
```typescript
const result = await devBotsManager.retryTask(taskId, reason)
devBotsManager.manuallyTimeoutTask(taskId, reason)
```

### Chain Management
```typescript
devBotsManager.blockChain(chainId, reason, blockedBy)
devBotsManager.unblockChain(chainId, unblockedBy)
```

## Database Schema (Key Tables)

```sql
-- Main task table (2,041 lines of schema)
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type, title, description, documentation,
  status (pending|running|completed|failed|timeout),
  priority INTEGER,
  created_at, assigned_at, started_at, completed_at,
  assigned_agent, assigned_worker,
  agent_type (claude|codex|gemini),  -- For agent comparison
  output, error,
  can_retry, retry_count, max_retries,
  fingerprint,  -- For deduplication
  chain_id, chain_status, chain_depth,  -- For staged queue
  queue_stage (implementation|followup),  -- Staged queue
  pr_number,  -- PR workflow
  verification_passed, verification_results,  -- Quality gates
  task_category, file_patterns, estimated_complexity  -- Classification
  -- ... 50+ more columns for comprehensive task tracking
);

CREATE TABLE workers (
  id PRIMARY KEY,
  agent_id, status, current_task_id,
  created_at, last_heartbeat, heartbeat_timeout_ms
);

CREATE TABLE task_executions (
  id PRIMARY KEY,
  task_id FOREIGN KEY,
  worker_id FOREIGN KEY,
  attempt_number, started_at, ended_at,
  exit_code, error, duration_ms
);

CREATE TABLE chains (
  -- Implicit: tracked via tasks.chain_id grouping
  -- Not a separate table
);

CREATE TABLE pr_followup_fingerprints (
  pr_number, fingerprint PRIMARY KEY,
  created_at
);

-- Indexes on common queries (25+)
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_chain_id ON tasks(chain_id);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC, created_at);
-- ... many more
```

## Performance Characteristics

| Operation | Complexity | Speed | Notes |
|-----------|-----------|-------|-------|
| Create task | O(1) | <10ms | Includes fingerprint calc |
| Assign next task | O(n) | ~10-50ms | Queue scan with file conflict check |
| Complete task | O(1) | <5ms | SQLite transaction |
| Get metrics | O(n) | ~20-100ms | Aggregates all tasks |
| Chain stats | O(n) | ~10-50ms | Counts distinct chains |
| Query by status | O(n) | ~5-20ms | Indexed query |

## Common Issues & Solutions

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| "Queue stuck" | maxConcurrentWorkers too low | Increase maxWorkers in config |
| Task timeouts | Task actually running long | Use detectLongRunningTasks() to baseline |
| Duplicate tasks | Same fingerprint submitted twice | Check deduplication logic |
| Chain blocked | Manual intervention needed | Use unblockChain() when resolved |
| Docker failures | Credential or image issues | Check circuit breaker status |
| Lost PRs | PR info not extracted | Check extractPRInfo() in output |

## Testing Checklist

- [ ] TaskClassifier classification accuracy
- [ ] TaskCreationService deduplication
- [ ] TaskExecutionService Docker execution
- [ ] TaskCompletionService quality gates
- [ ] ChainTrackerService queue logic
- [ ] DevBotsManager integration
- [ ] SQLite schema migrations
- [ ] Error recovery paths
- [ ] Agent selection logic
- [ ] PR workflow coordination

