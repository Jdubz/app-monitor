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

## Contact for Issues

If integration issues occur:
1. Check logs: `tail -f logs/backend.log`
2. Check SQLite: `sqlite3 ./data/tasks/queue.db`
3. Review migration errors in log
4. Restore from backup if needed
