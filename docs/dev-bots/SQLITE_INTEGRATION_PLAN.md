# SQLite Queue Integration Plan

## Current Status

✅ **COMPLETED**:
- SQLite queue service implementation (`taskQueue.sqlite.ts`)
- Migration script (`taskQueue.migration.ts`)
- Conservative timeout strategy
- Comprehensive documentation

🔄 **IN PROGRESS**:
- DevBotsManager integration

⏳ **PENDING**:
- Complete DevBotsManager refactoring
- API route updates
- Testing and validation

---

## Integration Steps

### Phase 1: Preparation ✅ DONE

1. ✅ Implement TaskQueueService with SQLite
2. ✅ Create migration script
3. ✅ Document timeout handling strategy
4. ✅ Add queue service initialization to DevBotsManager

### Phase 2: DevBotsManager Refactoring (IN PROGRESS)

The DevBotsManager needs significant refactoring to use the queue service instead of in-memory arrays. Here's what needs to change:

#### Current State (Lines 564-570):
```typescript
// Task management
private taskQueue: Task[] = [];
private activeTasks = new Map<string, Task>();
private completedTasks: Task[] = [];
private taskIdCounter = 1;
private taskFingerprints = new Map<string, string>();
private fileModificationLocks = new Map<string, string>();
```

#### Target State:
```typescript
// Task management - now delegated to SQLite
private taskQueue!: TaskQueueService;
// Remove: taskQueue[], activeTasks, completedTasks, taskFingerprints, fileModificationLocks
```

#### Methods to Refactor:

1. **`addEnhancedTask()`** (lines 1004-1105)
   - Replace fingerprint logic with `taskQueue.checkDuplicateTask()`
   - Replace `this.taskQueue.push()` with `taskQueue.createTask()`
   - Remove file lock map updates
   - Remove manual persistence calls

2. **`assignNextTask()`** (lines 1109-1251)
   - Replace entire method with `taskQueue.assignNextTask()`
   - SQLite handles atomicity, locking, file conflicts
   - Remove MAX_CONCURRENT_WORKERS check (handled by external loop)
   - Keep Docker execution logic

3. **`executeTaskWithDockerRun()`** (lines 1338-1600)
   - Keep Docker spawn logic
   - Replace task status updates with `taskQueue.completeTask()` or `taskQueue.failTask()`
   - Add worker heartbeat calls: `taskQueue.updateWorkerHeartbeat(workerId)`
   - Remove manual persistence calls

4. **`getTasks()`** (lines 2331-2349)
   - Replace `this.taskQueue.concat(activeTasks, completedTasks)` with `taskQueue.getTasksByStatus()`
   - Return proper status filtering

5. **`getCompletedTasks()`** (line 1320)
   - Replace `this.taskPersistence.loadCompletedTasks()` with `taskQueue.getTasksByStatus('completed')`

6. **`loadPersistedTasks()`** (lines 757-825)
   - Remove entirely - migration handles this once
   - SQLite is the source of truth now

7. **`saveTasksToPersistence()`** (lines 1253-1269)
   - Remove entirely - SQLite auto-persists

#### New Methods to Add:

1. **Heartbeat Monitor**:
```typescript
private startHeartbeatMonitor(): void {
  setInterval(() => {
    // Update current worker heartbeat
    const currentWorker = this.getCurrentWorkerId();
    if (currentWorker) {
      this.taskQueue.updateWorkerHeartbeat(currentWorker);
    }

    // Detect stalled workers
    const stalledWorkers = this.taskQueue.detectStalledWorkers();
    if (stalledWorkers.length > 0) {
      logger.warn({
        category: 'process',
        action: 'stalled_workers_detected',
        message: `Detected ${stalledWorkers.length} stalled workers`
      });
    }
  }, 15000); // Every 15 seconds
}
```

2. **Long-Running Task Monitor**:
```typescript
private startLongRunningTaskMonitor(): void {
  setInterval(() => {
    const longRunning = this.taskQueue.detectLongRunningTasks(1800000); // 30 min
    if (longRunning.length > 0) {
      logger.warn({
        category: 'process',
        action: 'long_running_tasks_detected',
        message: `${longRunning.length} tasks running > 30 minutes (manual investigation recommended)`,
        details: longRunning
      });
    }
  }, 300000); // Every 5 minutes
}
```

3. **Queue Metrics**:
```typescript
public getQueueMetrics() {
  return this.taskQueue.getQueueMetrics();
}

public getTaskDurationStats(daysBack: number = 30) {
  return this.taskQueue.getTaskDurationStats(daysBack);
}
```

---

### Phase 3: API Route Updates

Update API routes to use new queue methods:

#### File: `backend/src/routes/dev-bots.routes.ts`

1. **GET `/tasks`** (line ~125):
```typescript
router.get('/tasks', async (_req: Request, res: Response) => {
  const metrics = devBotsManager.getQueueMetrics();
  const pending = devBotsManager.getTasksByStatus('pending');
  const active = devBotsManager.getTasksByStatus('running');

  res.json({
    pending,
    active,
    metrics
  });
});
```

2. **POST `/tasks/enhanced`** (line ~200):
```typescript
// No changes needed - addEnhancedTask() will use SQLite internally
```

3. **GET `/tasks/completed`** (line ~223):
```typescript
router.get('/tasks/completed', (_req: Request, res: Response) => {
  const completed = devBotsManager.getTasksByStatus('completed');
  res.json({ completed });
});
```

4. **Add new metrics endpoint**:
```typescript
router.get('/metrics', (_req: Request, res: Response) => {
  const metrics = devBotsManager.getQueueMetrics();
  const stats = devBotsManager.getTaskDurationStats();
  res.json({ metrics, stats });
});
```

5. **Add manual timeout endpoint**:
```typescript
router.post('/tasks/:taskId/timeout', (req: Request, res: Response) => {
  const { taskId } = req.params;
  const { reason } = req.body;

  try {
    devBotsManager.manuallyTimeoutTask(taskId, reason);
    res.json({ success: true, message: `Task ${taskId} timed out` });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
```

---

### Phase 4: Testing Strategy

1. **Unit Tests** (`taskQueue.sqlite.test.ts`):
   - Create task
   - Assign task (atomicity test)
   - Complete task (idempotency test)
   - Fail task with retry
   - Detect stalled workers
   - File conflict detection
   - Duplicate task detection

2. **Integration Tests** (`devBotsManager.integration.test.ts`):
   - Create task via API
   - Task assigned and executed
   - Task completion recorded
   - Worker crash recovery
   - Long-running task warning (no auto-fail)

3. **Migration Tests** (`taskQueue.migration.test.ts`):
   - Migrate tasks from JSON
   - Verify all tasks imported
   - Verify status mapping correct
   - Verify idempotency (re-run migration)

4. **Load Tests**:
   - 1000 tasks queued
   - Concurrent task assignments
   - Worker stall simulation
   - Database performance

---

### Phase 5: Deployment

1. **Backup Current Data**:
```bash
cp -r ./data/tasks ./data/tasks-backup-$(date +%Y%m%d-%H%M%S)
```

2. **Deploy Code**:
```bash
git pull origin staging
npm install
```

3. **Start Server** (migration runs automatically):
```bash
npm run dev
```

4. **Verify Migration**:
```bash
# Check migration marker exists
ls -la ./data/tasks/.migrated-to-sqlite

# Check SQLite database created
sqlite3 ./data/tasks/queue.db "SELECT COUNT(*) FROM tasks"

# Check logs for migration success
tail -f logs/backend.log | grep migration
```

5. **Monitor Queue**:
```bash
curl http://localhost:5000/api/dev-bots/metrics
```

6. **Test Task Assignment**:
```bash
# Create a test task
curl -X POST http://localhost:5000/api/dev-bots/tasks/enhanced \
  -H "Content-Type: application/json" \
  -d @test-task.json

# Verify it appears in queue
curl http://localhost:5000/api/dev-bots/tasks
```

---

## Rollback Plan

If issues occur:

1. **Stop Server**:
```bash
pkill -f "npm run dev"
```

2. **Restore Backup**:
```bash
rm -rf ./data/tasks
cp -r ./data/tasks-backup-TIMESTAMP ./data/tasks
```

3. **Revert Code**:
```bash
git checkout HEAD~1  # or specific commit before integration
npm install
```

4. **Restart Server**:
```bash
npm run dev
```

---

## Success Criteria

✅ Migration completes without errors
✅ All existing tasks imported to SQLite
✅ Tasks can be created via API
✅ Tasks assigned and executed successfully
✅ No duplicate task executions observed
✅ Worker heartbeats functioning
✅ Long-running task warnings appear (but tasks not auto-failed)
✅ Queue metrics endpoint returns data
✅ Task completion recorded correctly
✅ Failed tasks can retry

---

## Known Limitations

1. **No Backward Compatibility**: Once migrated, cannot go back to JSON-based queue without data loss
2. **Manual Timeout Only**: Operators must manually timeout stuck tasks (by design)
3. **Single Database**: No distributed queue support (fine for current scale)
4. **No Horizontal Scaling**: One server instance (sufficient for 2 concurrent workers)

---

## Next Actions

1. Complete DevBotsManager refactoring (methods listed above)
2. Update API routes
3. Write unit tests
4. Test migration on staging data
5. Deploy to staging environment
6. Monitor for 24-48 hours
7. Document any issues
8. Deploy to production

---

## Estimated Effort

- **DevBotsManager Refactoring**: 4-6 hours
- **API Route Updates**: 1-2 hours
- **Testing**: 3-4 hours
- **Documentation**: 1 hour
- **Total**: 9-13 hours over 2-3 days

---

## Agent Comparison Metrics

### Overview

The SQLite task queue includes built-in support for tracking and comparing performance between different AI agents (Claude and Codex). This enables data-driven analysis of which agent performs better for different types of tasks.

### Schema Design

#### Agent Type Tracking

Tasks include an `agent_type` column that records which CLI tool executed the task:

```sql
ALTER TABLE tasks ADD COLUMN agent_type TEXT CHECK(agent_type IN ('claude', 'codex'));
CREATE INDEX idx_tasks_agent_type ON tasks(agent_type);
```

**Key Features:**
- Automatically added via migration for existing databases
- Enforced values: `'claude'` or `'codex'` (or NULL for untracked tasks)
- Indexed for fast comparison queries
- Set when task completes successfully

### Agent Rotation Strategies

The system supports multiple rotation strategies to determine which agent executes each task:

```typescript
// Configuration in devBotsManager.ts
private readonly AGENT_ROTATION_STRATEGY: 'alternate' | 'random' | 'claude-only' | 'codex-only' = 'alternate';
```

**Available Strategies:**

1. **`alternate`** (default): Alternates between Claude and Codex for each task
   - Ensures balanced comparison data
   - Example sequence: Claude → Codex → Claude → Codex

2. **`random`**: Randomly selects agent for each task
   - Provides unbiased distribution over large samples
   - Useful for A/B testing

3. **`claude-only`**: All tasks use Claude CLI
   - For baseline measurements
   - When Codex is unavailable

4. **`codex-only`**: All tasks use Codex CLI
   - For baseline measurements
   - When Claude is unavailable

### Worker ID Format

Workers are identified by their agent type:

```typescript
const workerId = `bot-${agentType}-${agentId}-${timestamp}`;
// Examples:
// - bot-claude-general-purpose-1762471384176
// - bot-codex-documentation-specialist-1762471608463
```

This format enables:
- Quick identification of which agent executed a task
- Tracking agent-specific worker issues
- Filtering logs by agent type

### Comparison Metrics API

#### Method: `getAgentComparisonMetrics()`

Returns detailed performance comparison between Claude and Codex:

```typescript
interface AgentComparisonMetrics {
  claude: {
    total: number;              // Total tasks executed by Claude
    completed: number;          // Successfully completed tasks
    failed: number;             // Failed tasks
    avg_duration_ms?: number;   // Average completion time (ms)
    success_rate: number;       // Percentage (0-100)
  };
  codex: {
    total: number;              // Total tasks executed by Codex
    completed: number;          // Successfully completed tasks
    failed: number;             // Failed tasks
    avg_duration_ms?: number;   // Average completion time (ms)
    success_rate: number;       // Percentage (0-100)
  };
}
```

**SQL Implementation:**

```sql
SELECT
  agent_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  AVG(CASE
    WHEN status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL
    THEN completed_at - started_at
    ELSE NULL
  END) as avg_duration_ms
FROM tasks
WHERE agent_type IS NOT NULL AND agent_type IN ('claude', 'codex')
GROUP BY agent_type
```

### API Endpoint

**GET `/api/dev-bots/agent-comparison`**

Returns comparison metrics for Claude vs Codex agents.

**Example Request:**
```bash
curl http://localhost:5000/api/dev-bots/agent-comparison
```

**Example Response:**
```json
{
  "comparison": {
    "claude": {
      "total": 45,
      "completed": 42,
      "failed": 3,
      "avg_duration_ms": 125430,
      "success_rate": 93.33
    },
    "codex": {
      "total": 43,
      "completed": 38,
      "failed": 5,
      "avg_duration_ms": 118250,
      "success_rate": 88.37
    }
  }
}
```

### Usage Examples

#### 1. Comparing Agent Performance

```bash
# Get comparison metrics
curl http://localhost:5000/api/dev-bots/agent-comparison | jq '.'

# Extract success rates
curl http://localhost:5000/api/dev-bots/agent-comparison | \
  jq '.comparison | {claude: .claude.success_rate, codex: .codex.success_rate}'

# Compare average durations (in minutes)
curl http://localhost:5000/api/dev-bots/agent-comparison | \
  jq '.comparison | {claude: (.claude.avg_duration_ms/60000), codex: (.codex.avg_duration_ms/60000)}'
```

#### 2. Direct Database Queries

```bash
# Connect to SQLite database
sqlite3 ./data/tasks/queue.db

# Count tasks by agent type
SELECT agent_type, COUNT(*) FROM tasks GROUP BY agent_type;

# Success rate by agent
SELECT
  agent_type,
  ROUND(100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM tasks
WHERE agent_type IS NOT NULL
GROUP BY agent_type;

# Average duration by agent and task type
SELECT
  agent_type,
  type,
  COUNT(*) as count,
  ROUND(AVG(completed_at - started_at) / 60000.0, 2) as avg_minutes
FROM tasks
WHERE status = 'completed' AND agent_type IS NOT NULL
GROUP BY agent_type, type;
```

#### 3. Performance Analysis

```bash
# Find which agent is faster for specific task types
SELECT
  type,
  agent_type,
  COUNT(*) as tasks,
  ROUND(AVG(completed_at - started_at) / 60000.0, 2) as avg_minutes
FROM tasks
WHERE status = 'completed' AND agent_type IS NOT NULL
GROUP BY type, agent_type
ORDER BY type, avg_minutes;

# Find tasks where one agent significantly outperformed the other
SELECT
  t1.type,
  COUNT(DISTINCT t1.id) as claude_tasks,
  ROUND(AVG(t1.completed_at - t1.started_at) / 60000.0, 2) as claude_avg_min,
  COUNT(DISTINCT t2.id) as codex_tasks,
  ROUND(AVG(t2.completed_at - t2.started_at) / 60000.0, 2) as codex_avg_min,
  ROUND(
    (AVG(t1.completed_at - t1.started_at) - AVG(t2.completed_at - t2.started_at)) / 60000.0,
    2
  ) as difference_min
FROM tasks t1
LEFT JOIN tasks t2 ON t1.type = t2.type AND t2.agent_type = 'codex' AND t2.status = 'completed'
WHERE t1.agent_type = 'claude' AND t1.status = 'completed'
GROUP BY t1.type
HAVING COUNT(DISTINCT t1.id) > 0 AND COUNT(DISTINCT t2.id) > 0;
```

### Logging Integration

Task execution logs include agent type information:

```typescript
// Execution start
logger.info({
  category: 'process',
  action: 'claude_worker_task_execution_starting',
  message: 'Starting task execution with Docker run',
  details: {
    workerId: 'bot-claude-general-purpose-1762471384176',
    agent: 'general-purpose',
    agentType: 'claude',  // Logged for filtering
    cliTool: 'claude',
    taskTitle: 'Fix authentication bug'
  }
});

// Execution completion
logger.info({
  category: 'process',
  action: 'task_completed',
  message: 'Task task-implementation-123 completed successfully',
  details: {
    agentType: 'claude',
    duration_ms: 125430
  }
});
```

**Log Analysis:**
```bash
# Filter logs by agent type
tail -f logs/backend.log | grep '"agentType":"claude"'
tail -f logs/backend.log | grep '"agentType":"codex"'

# Count executions by agent
grep 'task_execution_starting' logs/backend.log | \
  grep -o '"agentType":"[^"]*"' | \
  sort | uniq -c
```

### Data-Driven Insights

The agent comparison feature enables answering questions like:

1. **Which agent is faster overall?**
   - Compare `avg_duration_ms` across all tasks

2. **Which agent has higher success rate?**
   - Compare `success_rate` percentages

3. **Which agent is better for specific task types?**
   - Break down metrics by `task.type` field
   - Compare refactoring vs implementation vs bug fixes

4. **Which agent handles complex tasks better?**
   - Filter by `task.complexity` or `task.estimated_hours`
   - Compare performance on high-complexity tasks

5. **Are there task types where one agent significantly outperforms?**
   - Calculate performance deltas by task type
   - Identify strengths and weaknesses

### Migration Behavior

When migrating existing tasks from JSON to SQLite:

- **Existing tasks**: `agent_type` is set to `NULL` (not tracked)
- **New tasks**: `agent_type` is set when task completes
- **No data loss**: All tasks migrate successfully regardless of agent type

The migration automatically adds the `agent_type` column:

```typescript
// Migration check in taskQueue.sqlite.ts
const hasAgentType = columns.some(col => col.name === 'agent_type');
if (!hasAgentType) {
  this.db.exec(`ALTER TABLE tasks ADD COLUMN agent_type TEXT CHECK(agent_type IN ('claude', 'codex'));`);
  this.db.exec(`CREATE INDEX idx_tasks_agent_type ON tasks(agent_type);`);
}
```

### Best Practices

1. **Collect Sufficient Data**: Aim for 50+ tasks per agent before drawing conclusions
2. **Control for Task Type**: Compare agents on similar task types (apples-to-apples)
3. **Monitor Over Time**: Track trends as both agents improve
4. **Consider Context**: Faster isn't always better - quality matters too
5. **Use Alternate Strategy**: Default to `'alternate'` for balanced comparison
6. **Review Logs**: Cross-reference metrics with execution logs for insights

### Future Enhancements

Potential improvements to agent comparison tracking:

- **Quality Metrics**: Track code quality, test coverage, documentation quality
- **Task Type Breakdown**: Per-type comparison in API response
- **Time-Series Data**: Track performance trends over time
- **Cost Tracking**: Compare API usage costs between agents
- **Confidence Intervals**: Statistical significance of performance differences
- **Agent Recommendations**: Suggest best agent for each task type

---

## Contact for Issues

If integration issues occur:
1. Check logs: `tail -f logs/backend.log`
2. Check SQLite: `sqlite3 ./data/tasks/queue.db`
3. Review migration errors in log
4. Restore from backup if needed
