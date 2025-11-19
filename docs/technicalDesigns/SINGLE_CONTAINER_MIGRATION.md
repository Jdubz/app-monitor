# Single Container Phase Execution Migration

**Status:** Ready for Implementation  
**Priority:** P1 - Performance Enhancement  
**Effort:** 3-4 weeks

---

## Problem & Solution

**Current:** Each phase creates/destroys its own Docker container  
→ 126 seconds overhead per task (18s × 7 phases)

**Solution:** Execute all 7 phases in one long-running container  
→ 18 seconds overhead per task (85% reduction)

---

## Implementation

### 1. Create TaskContainerManager (~200 lines new)

Extract container management from `EphemeralWorkerService`:

```typescript
// backend/src/services/TaskContainerManager.ts
export class TaskContainerManager {
  private containers = new Map<string, TaskContainer>();

  async createForTask(task: Task): Promise<TaskContainer> {
    // Create container ONCE, keep alive with tail -f
    // Clone repo ONCE
    // Copy context ONCE
  }

  async exec(taskId: string, cmd: string): Promise<ExecResult> {
    // Execute phase in existing container
  }

  async destroy(taskId: string): Promise<void> {
    // Cleanup only on task completion
  }

  getActiveCount(): number {
    // For capacity checking (includes blocked)
  }
}
```

### 2. Refactor TaskExecutionService (~150 lines modified)

Change `assignNextTask()` to loop through all phases in one container:

```typescript
async assignNextTask(): Promise<void> {
  const task = this.taskQueue.assignNextTask();
  const container = await this.containerManager.createForTask(task);

  try {
    // Execute all 7 phases in SAME container
    while (task.phase_index <= 7) {
      const validation = await this.executePhase(task);
      
      if (!validation.passed && attempts >= MAX) {
        await this.blockTask(task); // Keep container alive
        break;
      }
      
      if (validation.passed) {
        task.phase_index = nextPhase(validation);
      }
    }

    await this.containerManager.destroy(task.id);
  } catch (error) {
    await this.blockTask(task); // Keep container for debugging
  }
}
```

### 3. Add Admin Endpoints (2 endpoints)

```typescript
// backend/src/routes/admin.ts
GET  /admin/blocked-tasks           // List blocked tasks
POST /admin/tasks/:id/unblock       // Force cleanup
```

### 4. Database Migration

```sql
ALTER TABLE tasks ADD COLUMN blocked_at INTEGER;
CREATE INDEX idx_tasks_blocked ON tasks(phase_status) WHERE phase_status = 'blocked';
```

---

## Migration Timeline

### Week 1: Core Implementation
- Create `TaskContainerManager.ts`
- Refactor `TaskExecutionService.assignNextTask()`
- Database migration
- Unit tests

### Week 2: Feature Flag
- Add `DEVBOTS_SINGLE_CONTAINER` env var
- Dual-path: `assignNextTaskSingleContainer()` vs `assignNextTaskLegacy()`
- Deploy to staging
- Test both paths

### Week 3: Gradual Rollout  
- 25% → 50% → 100% over 7 days
- Monitor metrics
- Rollback if needed (<5 min)

### Week 4: Cleanup
- Delete legacy code
- Remove feature flag
- Update tests

---

## Files Changed

**New (2):**
- `backend/src/services/TaskContainerManager.ts` (~200 lines)
- `backend/src/routes/admin.ts` (~50 lines)

**Modified (4):**
- `backend/src/services/taskExecution.service.ts` (~150 lines)
- `backend/src/services/devBotsManager.factory.ts` (~20 lines)
- `backend/src/config/index.ts` (~5 lines)
- `backend/src/server.ts` (~2 lines)

**Tests (3):**
- `TaskContainerManager.test.ts` (new)
- `taskExecution.service.test.ts` (update: expect 1 container not 7)
- `phaseSystem.e2e.test.ts` (update: expect 1 container not 7)

**Total:** ~425 lines of changes

---

## What We're NOT Doing

❌ Complex orchestrator classes (keep logic in TaskExecutionService)  
❌ Separate PhaseExecutor service (inline execution)  
❌ Elaborate monitoring (use existing metrics)  
❌ Fancy UI widgets (admin API sufficient)

✅ Simple extraction + refactor

---

## Rollback

```bash
export DEVBOTS_SINGLE_CONTAINER=false
pm2 restart app-monitor-backend
```

Time: <5 minutes  
Data loss: None

---

## Success Criteria

1. ✅ 85% fewer container operations (1 create/destroy vs 7)
2. ✅ 20-30% faster task execution
3. ✅ Zero workspace transfer errors
4. ✅ Blocked containers managed via admin API
5. ✅ All tests passing

---

Ready for Week 1 implementation.
