# Single Container Phase Execution Migration Plan

**Date:** 2025-11-19  
**Status:** Design Complete - Ready for Implementation  
**Priority:** P1 - Performance & Reliability Enhancement

---

## Executive Summary

**Current Problem:** Each phase in the 7-phase pipeline creates and destroys a new Docker container, leading to:
- ❌ Slow phase transitions (20-30s overhead per phase)
- ❌ Lost context between phases (each phase starts from scratch)
- ❌ Complex tar/cp operations for workspace transfer
- ❌ Higher resource usage (7 container lifecycles per task)
- ❌ Potential for workspace inconsistencies

**Proposed Solution:** Execute entire task (all 7 phases) in a single long-running container:
- ✅ Instant phase transitions (no container overhead)
- ✅ Preserved workspace state across phases
- ✅ Simple `docker exec` for each phase
- ✅ 85% reduction in container operations
- ✅ Guaranteed workspace consistency

---

## Current Architecture Analysis

### Multi-Container Pipeline (Current)

**Flow per Task:**
```
Phase 1: Planning
  ├─ Create container
  ├─ Clone repo
  ├─ Copy context bundle
  ├─ Execute planning phase (docker exec)
  ├─ Extract artifacts
  ├─ Validate phase
  └─ Destroy container
  
Phase 2: Implementation
  ├─ Create NEW container
  ├─ Clone repo AGAIN
  ├─ Copy context bundle AGAIN
  ├─ Execute implementation (docker exec)
  ├─ Extract artifacts
  ├─ Validate phase
  └─ Destroy container
  
... (repeat for phases 3-7)
```

**Performance Metrics:**
- Container creation: ~5s
- Repository clone: ~8s
- Context bundle copy: ~2s
- Container destruction: ~3s
- **Total overhead per phase:** ~18s
- **Total overhead per task:** ~126s (18s × 7 phases)

**Code Locations:**
- `ephemeralWorker.service.ts:204-500` - Container creation per task
- `ephemeralWorker.service.ts:622-756` - Task execution (single phase)
- `ephemeralWorker.service.ts:772-1000` - Phase completion with validation
- `taskExecution.service.ts:424-784` - Phase orchestration

---

## Proposed Architecture

### Single Container Pipeline (New)

**Flow per Task:**
```
Task Initialization (once):
  ├─ Create long-running container
  ├─ Clone repo (once)
  ├─ Copy context bundle (once)
  └─ Keep container alive

Phase 1: Planning
  ├─ Execute planning (docker exec)
  ├─ Validate phase
  └─ Advance to Phase 2

Phase 2: Implementation
  ├─ Execute implementation (docker exec) ← Same container!
  ├─ Validate phase
  └─ Advance to Phase 3

... (continue phases 3-7 in same container)

Task Completion:
  ├─ Extract final artifacts
  └─ Destroy container (once)

Task Blocked (max attempts exceeded):
  ├─ Mark task as blocked
  ├─ KEEP CONTAINER ALIVE for debugging
  ├─ Container counts towards max dev-bots capacity
  └─ Requires manual intervention to unblock/cleanup
```

**Performance Improvement:**
- Container creation: 5s (once, not 7×)
- Repository clone: 8s (once, not 7×)
- Context bundle copy: 2s (once, not 7×)
- Container destruction: 3s (once, not 7×)
- **Total overhead per task:** ~18s (single container lifecycle)
- **Savings:** 108 seconds per task (~85% reduction)

**Capacity Management:**
- Blocked containers stay alive (count towards max dev-bots)
- When all slots blocked → system blocked (no new tasks)
- Manual intervention required to unblock/cleanup
- Blocked containers preserve state for debugging

---

## Implementation Design

### 1. Container Lifecycle Changes

**New Container States:**
```typescript
type ContainerLifecycleState = 
  | 'initializing'  // Container created, workspace setup in progress
  | 'ready'         // Ready for phase execution
  | 'executing'     // Phase in progress
  | 'idle'          // Waiting for next phase
  | 'blocked'       // Task blocked, container alive for debugging
  | 'completing'    // Final artifact extraction
  | 'destroyed';    // Container removed

interface TaskContainer {
  id: string;
  containerId: string;
  taskId: string;
  state: ContainerLifecycleState;
  createdAt: number;
  currentPhase: number;
  phaseHistory: PhaseExecutionRecord[];
  blockedAt?: number;       // When task was blocked
  blockedReason?: string;   // Why task blocked
}
```

**Container Management:**
```typescript
// File: backend/src/services/TaskContainerManager.ts (NEW)

export class TaskContainerManager {
  private taskContainers = new Map<string, TaskContainer>();

  /**
   * Create long-running container for task
   * Called ONCE at task start (not per phase)
   */
  async createTaskContainer(task: Task): Promise<TaskContainer> {
    const containerId = await this.containerLifecycle.createContainer({
      image: this.config.dockerImage,
      name: `task-${task.id}`,
      cmd: ['/bin/bash', '-c', 'tail -f /dev/null'], // Keep alive
      env: this.buildTaskEnv(task),
      workingDir: '/workspace',
      autoRemove: false, // Manual cleanup only
      // ... other config
    });

    await this.containerLifecycle.startContainer(containerId);
    await this.setupWorkspace(containerId, task);

    const container: TaskContainer = {
      id: `tc-${task.id}`,
      containerId,
      taskId: task.id,
      state: 'ready',
      createdAt: Date.now(),
      currentPhase: task.phase_index,
      phaseHistory: []
    };

    this.taskContainers.set(task.id, container);
    return container;
  }

  /**
   * Execute phase in existing container
   * No container creation/destruction
   */
  async executePhaseInContainer(
    container: TaskContainer,
    phase: PhaseDefinition
  ): Promise<PhaseExecutionResult> {
    container.state = 'executing';
    
    const phaseCommand = this.buildPhaseCommand(phase);
    
    // Simple docker exec - no tar/cp overhead
    const result = await this.dockerManager.exec(
      container.containerId,
      phaseCommand
    );

    container.phaseHistory.push({
      phase: phase.index,
      exitCode: result.exitCode,
      timestamp: Date.now()
    });

    container.state = 'idle';
    return result;
  }

  /**
   * Cleanup container after all phases complete
   */
  async destroyTaskContainer(taskId: string): Promise<void> {
    const container = this.taskContainers.get(taskId);
    if (!container) return;

    await this.containerLifecycle.stopContainer(container.containerId);
    await this.containerLifecycle.removeContainer(container.containerId);
    
    this.taskContainers.delete(taskId);
  }

  /**
   * Setup workspace once at container creation
   */
  private async setupWorkspace(
    containerId: string,
    task: Task
  ): Promise<void> {
    // Clone repo
    await this.cloneFreshRepoInContainer(containerId, 'staging');
    
    // Copy context bundle
    await this.contextDelivery.copyContextBundleToContainer(
      containerId,
      task
    );
    
    // Initialize worker log
    await this.workerLog.initializeWorkerLogFile(task.id);
  }
}
```

---

### 2. Phase Execution Flow

**Current Flow (Multi-Container):**
```typescript
// File: ephemeralWorker.service.ts:772-1000
async completePhaseExecution(worker, output, errorOutput, exitCode) {
  // Extract artifacts from container
  const artifacts = await this.artifactExtractor.extractArtifacts({
    containerId: worker.containerId
  });

  // Validate phase
  const validation = await validator.validate(task, artifacts);

  // Destroy container (EVERY PHASE!)
  if (worker) {
    await this.ephemeralWorkerService.destroyWorker(worker.id);
  }

  return validation;
}
```

**New Flow (Single Container):**
```typescript
// File: backend/src/services/PhaseExecutor.ts (NEW)

export class PhaseExecutor {
  constructor(
    private containerManager: TaskContainerManager,
    private validatorRegistry: ValidatorRegistry,
    private artifactExtractor: ArtifactExtractorService
  ) {}

  /**
   * Execute single phase in task container
   * Container persists after execution
   */
  async executePhase(task: Task): Promise<PhaseExecutionResult> {
    // Get or create container for this task
    let container = this.containerManager.getContainer(task.id);
    
    if (!container) {
      // First phase - create container
      container = await this.containerManager.createTaskContainer(task);
    }

    // Execute phase via docker exec
    const phaseCommand = this.buildPhaseCommand(task);
    const result = await this.containerManager.executePhaseInContainer(
      container,
      phaseCommand
    );

    // Validate phase (container still running)
    const validator = this.validatorRegistry.getValidator(task.phase_index);
    const validation = await validator.validate(task, result);

    // Record stage run
    await this.recordStageRun(task, result, validation);

    // DON'T destroy container - keep for next phase
    return { result, validation };
  }

  /**
   * Complete entire task (all phases done)
   * Called when Phase 7 completes or task cancelled
   */
  async completeTask(task: Task): Promise<void> {
    // Extract final artifacts
    const container = this.containerManager.getContainer(task.id);
    if (container) {
      await this.extractFinalArtifacts(container);
      
      // NOW destroy container
      await this.containerManager.destroyTaskContainer(task.id);
    }
  }

  /**
   * Build phase-specific command
   */
  private buildPhaseCommand(task: Task): string {
    const phase = PHASES[task.phase_index];
    
    // Each phase gets its own prompt/context
    const prompt = this.templateManager.generatePhasePrompt(task, phase);
    
    return this.generateExecutionCommand(
      task,
      prompt,
      phase.cliType
    );
  }
}
```

---

### 3. Task Orchestration Changes

**Current Orchestration:**
```typescript
// File: taskExecution.service.ts:424-784
async assignNextTask() {
  // Create worker (creates container)
  worker = await this.ephemeralWorkerService.createWorker(task, agent);
  
  // Execute task (single phase only)
  result = await this.ephemeralWorkerService.executeTask(worker);
  
  // Validate and advance phase
  const validation = await this.ephemeralWorkerService.completePhaseExecution(
    worker, output, stderr, exitCode
  );
  
  // Destroy worker (destroys container)
  await this.ephemeralWorkerService.destroyWorker(worker.id);
}
```

### 4. Concurrency & Capacity Management

**Critical Change: Blocked Containers Count Towards Capacity**

```typescript
// File: backend/src/services/TaskContainerManager.ts

export class TaskContainerManager {
  /**
   * Get active container count (including blocked)
   * Blocked containers stay alive and count towards capacity
   */
  getActiveContainerCount(): number {
    return Array.from(this.taskContainers.values()).filter(
      c => c.state !== 'destroyed'
    ).length;
  }

  /**
   * Get blocked container count
   * When blocked count reaches max dev-bots, system is blocked
   */
  getBlockedContainerCount(): number {
    return Array.from(this.taskContainers.values()).filter(
      c => c.state === 'blocked'
    ).length;
  }

  /**
   * Check if system is blocked (all capacity used by blocked tasks)
   */
  isSystemBlocked(): boolean {
    const blockedCount = this.getBlockedContainerCount();
    const maxWorkers = this.config.maxConcurrentWorkers;
    
    if (blockedCount >= maxWorkers) {
      logger.error({
        category: 'system',
        action: 'system_blocked',
        message: `All ${maxWorkers} dev-bot slots occupied by blocked tasks`,
        details: {
          blockedCount,
          maxWorkers,
          blockedTasks: Array.from(this.taskContainers.values())
            .filter(c => c.state === 'blocked')
            .map(c => ({ taskId: c.taskId, reason: c.blockedReason }))
        }
      });
      return true;
    }
    return false;
  }

  /**
   * Manually unblock and cleanup container (admin action)
   */
  async unblockAndDestroyContainer(taskId: string): Promise<void> {
    const container = this.taskContainers.get(taskId);
    if (!container || container.state !== 'blocked') {
      throw new Error(`Task ${taskId} is not blocked`);
    }

    logger.info({
      category: 'admin',
      action: 'unblock_container',
      message: `Manually unblocking and destroying container for task ${taskId}`,
      details: { 
        taskId, 
        containerId: container.containerId,
        blockedReason: container.blockedReason,
        blockedDuration: Date.now() - (container.blockedAt || 0)
      }
    });

    await this.destroyTaskContainer(taskId);
    
    // Free up capacity slot
    this.eventBus.emit('capacity:freed', {
      taskId,
      newCapacity: this.getActiveContainerCount()
    });
  }
}
```

**Task Assignment with Capacity Check:**

```typescript
// File: backend/src/services/TaskPhaseOrchestrator.ts

async canAssignNewTask(): Promise<boolean> {
  // Check if system is blocked
  if (this.containerManager.isSystemBlocked()) {
    logger.error({
      category: 'system',
      action: 'assignment_blocked',
      message: 'Cannot assign new task - all dev-bot slots blocked',
      details: {
        blockedCount: this.containerManager.getBlockedContainerCount(),
        maxWorkers: this.config.maxConcurrentWorkers,
        recommendation: 'Unblock tasks or increase max workers'
      }
    });
    return false;
  }

  // Check normal capacity
  const activeCount = this.containerManager.getActiveContainerCount();
  const maxWorkers = this.config.maxConcurrentWorkers;
  
  if (activeCount >= maxWorkers) {
    logger.info({
      category: 'system',
      action: 'capacity_full',
      message: `All ${maxWorkers} dev-bot slots in use`,
      details: {
        active: activeCount,
        blocked: this.containerManager.getBlockedContainerCount(),
        running: activeCount - this.containerManager.getBlockedContainerCount()
      }
    });
    return false;
  }

  return true;
}
```

**New Orchestration:**
```typescript
// File: backend/src/services/TaskPhaseOrchestrator.ts (NEW)

export class TaskPhaseOrchestrator {
  constructor(
    private phaseExecutor: PhaseExecutor,
    private taskQueue: TaskQueueService,
    private containerManager: TaskContainerManager
  ) {}

  /**
   * Main orchestration loop - executes all phases for a task
   * Container persists across all phases AND when blocked
   */
  async executeTask(task: Task): Promise<void> {
    try {
      while (task.phase_index <= 7 && task.status === 'running') {
        // Execute current phase
        const { result, validation } = await this.phaseExecutor.executePhase(task);

        if (validation.passed) {
          // Advance to next phase
          task.phase_index = this.determineNextPhase(task, validation);
          task.phase_attempts = 1; // Reset attempts for new phase
          
          if (task.phase_index > 7) {
            // All phases complete - NOW cleanup container
            await this.phaseExecutor.completeTask(task);
            await this.taskQueue.completeTask(task.id);
            break;
          }
        } else {
          // Retry current phase or block
          if (task.phase_attempts < MAX_PHASE_ATTEMPTS) {
            task.phase_attempts++;
            // Retry same phase in same container
          } else {
            // Block task - KEEP CONTAINER ALIVE
            await this.blockTask(task, validation);
            // DON'T cleanup container - it stays alive when blocked
            // This counts towards max dev-bots capacity
            break;
          }
        }

        // Update task state
        await this.taskQueue.updateTask(task.id, {
          phase_index: task.phase_index,
          phase_attempts: task.phase_attempts
        });
      }
    } catch (error) {
      // Error during execution - STILL keep container alive for debugging
      logger.error({
        category: 'phase',
        action: 'task_execution_error',
        message: `Task execution failed: ${error.message}`,
        details: { taskId: task.id, phase: task.phase_index }
      });
      
      // Mark as blocked but DON'T destroy container
      await this.blockTask(task, { 
        passed: false, 
        message: error.message 
      });
      
      // Container stays alive for human investigation
      throw error;
    }
  }

  /**
   * Block task but keep container alive
   * Blocked containers count towards max dev-bots capacity
   */
  private async blockTask(task: Task, validation: ValidationResult): Promise<void> {
    await this.taskQueue.updateTask(task.id, {
      status: 'blocked',
      phase_status: 'blocked',
      blocked_at: Date.now(),
      blocked_reason: validation.message
    });

    // Update container state to blocked (but keep alive)
    const container = this.containerManager.getContainer(task.id);
    if (container) {
      container.state = 'blocked';
    }

    logger.warn({
      category: 'phase',
      action: 'task_blocked',
      message: `Task ${task.id} blocked at phase ${task.phase_index}`,
      details: {
        taskId: task.id,
        phase: task.phase_index,
        reason: validation.message,
        containerAlive: !!container,
        note: 'Container kept alive for debugging - counts towards capacity'
      }
    });

    // Emit event for monitoring
    this.eventBus.emit('task:blocked', {
      taskId: task.id,
      phase: task.phase_index,
      containerId: container?.containerId,
      containerState: container?.state
    });
  }

  /**
   * Determine next phase based on validation
   * Handles loops (Phase 3↔4, Phase 5 internal)
   */
  private determineNextPhase(task: Task, validation: ValidationResult): number {
    if (validation.nextPhase !== undefined) {
      return validation.nextPhase; // Loop override
    }
    return task.phase_index + 1; // Linear progression
  }
}
```

---

### 4. Workspace State Preservation

**Benefits of Single Container:**

```
Phase 1: Planning
  ├─ Create `/workspace/task-plan.md`
  └─ File persists in container

Phase 2: Implementation
  ├─ Read `/workspace/task-plan.md` (from Phase 1!)
  ├─ Create code files
  ├─ Commit to git
  └─ Files persist in container

Phase 3: Review
  ├─ Read code from Phase 2
  ├─ Create `/workspace/review-issues.json`
  └─ Persist for Phase 4

Phase 4: Fixes
  ├─ Read `/workspace/review-issues.json` (from Phase 3!)
  ├─ Apply fixes
  ├─ Update git commits
  └─ Modified files persist

Phase 5: Test
  ├─ Read all previous work
  ├─ Add tests
  ├─ Run test suite
  └─ Test results persist

Phase 6: Cleanup
  ├─ Read all artifacts
  ├─ Update docs
  └─ Final state preserved

Phase 7: PR Shepherding
  ├─ All files available
  └─ Push to remote
```

**No More:**
- ❌ Tar workspace between phases
- ❌ Extract workspace from old container
- ❌ Copy workspace to new container
- ❌ Potential corruption during transfer

**Instead:**
- ✅ All changes immediately available
- ✅ Git history intact
- ✅ Simple file reads/writes
- ✅ Guaranteed consistency

---

## Migration Strategy

### Phase 1: Create New Services (Week 1)

**New Files:**
```
backend/src/services/
  ├─ TaskContainerManager.ts         (NEW) - Long-running containers
  ├─ PhaseExecutor.ts                 (NEW) - Phase execution logic
  ├─ TaskPhaseOrchestrator.ts         (NEW) - Multi-phase coordination
  └─ __tests__/
      ├─ TaskContainerManager.test.ts
      ├─ PhaseExecutor.test.ts
      └─ TaskPhaseOrchestrator.test.ts
```

**Implementation:**
1. ✅ Implement `TaskContainerManager` (container lifecycle)
2. ✅ Implement `PhaseExecutor` (phase execution)
3. ✅ Implement `TaskPhaseOrchestrator` (task coordination)
4. ✅ Unit tests for all services (80%+ coverage)
5. ✅ Integration test: full 7-phase execution in single container

---

### Phase 2: Parallel Operation (Week 2)

**Strategy:** Run old and new systems side-by-side

**Feature Flag:**
```typescript
// backend/src/config/index.ts
export interface DevBotsConfig {
  // ... existing config
  useSingleContainerExecution: boolean; // NEW - default false
}

// Environment variable
DEVBOTS_SINGLE_CONTAINER=true
```

**Task Assignment Logic:**
```typescript
async assignNextTask() {
  const task = this.taskQueue.assignNextTask();
  
  if (this.config.useSingleContainerExecution) {
    // NEW: Single container pipeline
    await this.taskPhaseOrchestrator.executeTask(task);
  } else {
    // OLD: Multi-container pipeline (existing code)
    await this.executeTaskLegacy(task);
  }
}
```

**Testing:**
- Run both systems in production simultaneously
- Compare execution times, success rates
- Monitor for regressions
- Validate workspace consistency

---

### Phase 3: Gradual Rollout (Week 3)

**Rollout Plan:**
```
Day 1-2: 10% of tasks use new system
Day 3-4: 25% of tasks
Day 5-6: 50% of tasks
Day 7: 100% of tasks
```

**Rollback Plan:**
- Set `DEVBOTS_SINGLE_CONTAINER=false`
- Automatic fallback to legacy system
- Zero downtime rollback

---

### Phase 4: Legacy Removal (Week 4)

**Delete Legacy Code:**
```typescript
// Files to DELETE:
- ephemeralWorker.service.ts (lines 204-500) - Per-phase container creation
- ephemeralWorker.service.ts (lines 772-1000) - Per-phase completion

// Files to UPDATE:
- taskExecution.service.ts - Remove legacy orchestration
- ContainerLifecycleService.ts - Remove per-phase logic
```

**Database Cleanup:**
- No schema changes needed
- Phase tracking unchanged
- Container IDs now stable (single container per task)

---

## Testing Plan

### Unit Tests

**TaskContainerManager:**
- ✅ Create task container
- ✅ Execute phase in container
- ✅ Container state transitions
- ✅ Destroy task container
- ✅ Error handling (container failures)

**PhaseExecutor:**
- ✅ Execute single phase
- ✅ Phase validation integration
- ✅ Artifact extraction
- ✅ Complete task cleanup

**TaskPhaseOrchestrator:**
- ✅ Full 7-phase execution
- ✅ Phase loops (3↔4, 5 internal)
- ✅ Phase advancement logic
- ✅ Blocking conditions
- ✅ Error recovery

---

### Integration Tests

**E2E Phase Pipeline:**
```typescript
describe('Single Container Phase Execution', () => {
  it('executes all 7 phases in single container', async () => {
    const task = createTestTask();
    
    // Execute task
    await orchestrator.executeTask(task);
    
    // Verify container lifecycle
    expect(containerManager.createCount).toBe(1); // Only 1 container created
    expect(containerManager.destroyCount).toBe(1); // Only 1 destroyed
    
    // Verify all phases executed
    const history = await db.getStageRuns(task.id);
    expect(history).toHaveLength(7);
    expect(history.map(h => h.stage_number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('preserves workspace state across phases', async () => {
    const task = createTestTask();
    
    await orchestrator.executeTask(task);
    
    // Verify files from Phase 1 available in Phase 2
    const phase2Logs = await getContainerLogs(task.id, phase: 2);
    expect(phase2Logs).toContain('Found task-plan.md from Phase 1');
    
    // Verify files from Phase 3 available in Phase 4
    const phase4Logs = await getContainerLogs(task.id, phase: 4);
    expect(phase4Logs).toContain('Loaded review-issues.json from Phase 3');
  });

  it('handles phase loops correctly', async () => {
    const task = createTestTask();
    
    await orchestrator.executeTask(task);
    
    // Verify Review↔Fix loop
    const history = await db.getStageRuns(task.id);
    const reviewCycles = history.filter(h => h.stage_number === 3).length;
    expect(reviewCycles).toBeGreaterThan(1); // Looped back to review
  });
});
```

---

### Performance Tests

**Benchmark:**
```typescript
describe('Performance Comparison', () => {
  it('reduces container overhead by 85%', async () => {
    const task = createTestTask();
    
    // Old system
    const oldStart = Date.now();
    await executeLegacySystem(task);
    const oldDuration = Date.now() - oldStart;
    
    // New system
    const newStart = Date.now();
    await orchestrator.executeTask(task);
    const newDuration = Date.now() - newStart;
    
    // Verify improvement
    const reduction = (oldDuration - newDuration) / oldDuration;
    expect(reduction).toBeGreaterThan(0.80); // >80% reduction
  });

  it('executes 100 tasks faster', async () => {
    const tasks = createTestTasks(100);
    
    const start = Date.now();
    await Promise.all(tasks.map(t => orchestrator.executeTask(t)));
    const duration = Date.now() - start;
    
    // Should complete in under 30 minutes (old: ~45 minutes)
    expect(duration).toBeLessThan(30 * 60 * 1000);
  });
});
```

---

## Rollback Plan

### Immediate Rollback (< 5 minutes)

**Trigger:** Critical failure in new system

**Steps:**
1. Set environment variable: `DEVBOTS_SINGLE_CONTAINER=false`
2. Restart backend service
3. All new tasks use legacy system
4. Monitor for recovery

**No Data Loss:**
- Task state preserved in database
- In-flight tasks continue in old system
- No workspace corruption

---

### Gradual Rollback

**Trigger:** Performance degradation, stability issues

**Steps:**
1. Reduce rollout percentage: `100% → 50% → 25% → 0%`
2. Monitor metrics at each step
3. Identify root cause
4. Fix or revert completely

---

## Success Metrics

### Performance Targets

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| **Avg task duration** | 30 min | 25 min | 17% faster |
| **Container creations/task** | 7 | 1 | 85% reduction |
| **Phase transition time** | 18s | <1s | 95% faster |
| **Workspace transfer errors** | 2/week | 0 | 100% elimination |
| **Resource usage** | 7 containers | 1 container | 85% reduction |

### Quality Metrics

| Metric | Target |
|--------|--------|
| **Test coverage** | >80% |
| **Zero regression tests** | 100% pass |
| **E2E success rate** | >95% |
| **Rollback time** | <5 min |

---

## Risk Assessment

### High Risk

**Container Lifecycle Bugs:**
- **Risk:** Container not cleaned up, leaks accumulate
- **Mitigation:** Comprehensive cleanup in `finally` blocks, container monitoring

**Phase Isolation:**
- **Risk:** Phases interfere with each other via shared filesystem
- **Mitigation:** Phase validators check for unexpected modifications

### Medium Risk

**Performance Regression:**
- **Risk:** Long-running containers consume more memory
- **Mitigation:** Container resource limits, monitoring, manual cleanup for blocked

**System Blocked by Blocked Tasks:**
- **Risk:** All dev-bot slots occupied by blocked tasks, no new tasks can start
- **Mitigation:** 
  - Monitoring/alerting when blocked count > 50% capacity
  - Admin API to force-unblock containers
  - Dashboard showing blocked tasks with "Unblock" button
  - Automatic alerts to human operators

**Concurrency Issues:**
- **Risk:** Multiple phases try to execute simultaneously in same container
- **Mitigation:** Container state locking, phase execution serialization

### Low Risk

**Workspace Corruption:**
- **Risk:** Git state corrupted across phases
- **Mitigation:** Git operations are atomic, phase validators check repo health

---

## Implementation Checklist

### Week 1: Core Implementation
- [ ] Create `TaskContainerManager.ts`
- [ ] Create `PhaseExecutor.ts`
- [ ] Create `TaskPhaseOrchestrator.ts`
- [ ] Write unit tests (80%+ coverage)
- [ ] Write integration tests (E2E pipeline)
- [ ] Code review and approval

### Week 2: Parallel Operation
- [ ] Add feature flag (`DEVBOTS_SINGLE_CONTAINER`)
- [ ] Update task assignment logic (dual-path)
- [ ] Deploy to staging
- [ ] Run 100 test tasks (both systems)
- [ ] Compare metrics, validate consistency
- [ ] Fix any discovered issues

### Week 3: Gradual Rollout
- [ ] Day 1-2: 10% rollout
- [ ] Day 3-4: 25% rollout
- [ ] Day 5-6: 50% rollout
- [ ] Day 7: 100% rollout
- [ ] Monitor metrics at each step
- [ ] No rollbacks needed

### Week 4: Legacy Cleanup & Test Migration
- [ ] Delete legacy multi-container code
- [ ] Update all unit tests
- [ ] Update E2E tests
- [ ] Update documentation
- [ ] Remove feature flag (new system is default)
- [ ] Archive old container lifecycle code
- [ ] Update runbooks

---

## Legacy Code Removal Plan

### Files to Delete Completely

**Core Services (Legacy Multi-Container Logic):**
```bash
# Delete these sections from ephemeralWorker.service.ts:
- Lines 204-500: createWorker() - Per-phase container creation
- Lines 622-756: executeTask() - Single phase execution
- Lines 772-1000: completePhaseExecution() - Per-phase cleanup

# Delete these sections from taskExecution.service.ts:
- Lines 424-784: assignNextTask() - Legacy orchestration
- Worker creation/destruction per phase
- Tar workspace transfer logic

# Delete entire methods (mark for removal):
- ephemeralWorker.service.ts::destroyWorker() - Replaced by TaskContainerManager
- ephemeralWorker.service.ts::copyWorkspaceToContainer() - No longer needed
- ephemeralWorker.service.ts::cloneFreshRepoInContainer() - Move to TaskContainerManager
```

**Helper Functions to Remove:**
```typescript
// Remove from ephemeralWorker.service.ts:
- waitForContainerHealthy() - Move to ContainerLifecycleService
- extractWorkspaceFromContainer() - No longer needed (no tar/cp)
- captureWorkspaceSnapshot() - No longer needed

// Remove from taskExecution.service.ts:
- createWorkerForPhase() - Replaced by TaskContainerManager.createTaskContainer()
- executePhaseInWorker() - Replaced by PhaseExecutor.executePhase()
```

**Configuration to Update:**
```typescript
// backend/src/config/defaults.ts
export const DEFAULT_EPHEMERAL_WORKER_CONFIG = {
  maxConcurrentWorkers: 2,
  dockerImage: 'dev-bot:latest',
  logsDirectory: './dev-bots/logs',
  envPassthroughKeys: ['GITHUB_TOKEN', 'ANTHROPIC_API_KEY'],
  
  // REMOVE THESE (no longer needed):
  // - workspaceTransferMethod: 'tar' 
  // - containerRecreationPerPhase: true
  
  // ADD THESE:
  containerReuseEnabled: true,  // NEW
  containerIdleTimeout: 3600000, // 1 hour (safety cleanup)
};
```

---

## Test Migration Plan

### Unit Tests to Update

#### 1. ephemeralWorker.service.test.ts → TaskContainerManager.test.ts

**Old Test Structure:**
```typescript
describe('EphemeralWorkerService', () => {
  describe('createWorker', () => {
    it('creates container for task', async () => {
      const worker = await service.createWorker(task, agent, 'claude');
      expect(worker.containerId).toBeDefined();
      expect(worker.status).toBe('starting');
    });
  });

  describe('executeTask', () => {
    it('executes single phase', async () => {
      const result = await service.executeTask(worker);
      expect(result.success).toBe(true);
    });
  });

  describe('destroyWorker', () => {
    it('cleans up container', async () => {
      await service.destroyWorker(worker.id);
      expect(containerRemoved).toBe(true);
    });
  });
});
```

**New Test Structure:**
```typescript
// backend/src/services/__tests__/TaskContainerManager.test.ts (NEW)
describe('TaskContainerManager', () => {
  describe('createTaskContainer', () => {
    it('creates long-running container once per task', async () => {
      const container = await manager.createTaskContainer(task);
      
      expect(container.containerId).toBeDefined();
      expect(container.state).toBe('ready');
      expect(container.taskId).toBe(task.id);
      expect(mockDocker.createContainer).toHaveBeenCalledTimes(1);
    });

    it('sets up workspace during creation', async () => {
      await manager.createTaskContainer(task);
      
      // Verify repo cloned
      expect(mockExec).toHaveBeenCalledWith(
        expect.objectContaining({
          Cmd: expect.arrayContaining([expect.stringContaining('git clone')])
        })
      );
      
      // Verify context bundle copied
      expect(mockContextDelivery.copyContextBundleToContainer).toHaveBeenCalled();
    });
  });

  describe('executePhaseInContainer', () => {
    it('executes phase without recreating container', async () => {
      const container = await manager.createTaskContainer(task);
      const createCount = mockDocker.createContainer.mock.calls.length;
      
      // Execute Phase 1
      await manager.executePhaseInContainer(container, phase1);
      
      // Execute Phase 2 - same container
      await manager.executePhaseInContainer(container, phase2);
      
      // Verify container created only once
      expect(mockDocker.createContainer).toHaveBeenCalledTimes(createCount);
    });

    it('preserves container state between phases', async () => {
      const container = await manager.createTaskContainer(task);
      
      await manager.executePhaseInContainer(container, phase1);
      const phase1State = container.state;
      
      await manager.executePhaseInContainer(container, phase2);
      
      expect(container.phaseHistory).toHaveLength(2);
      expect(container.phaseHistory[0].phase).toBe(1);
      expect(container.phaseHistory[1].phase).toBe(2);
    });
  });

  describe('destroyTaskContainer', () => {
    it('cleans up container after all phases complete', async () => {
      const container = await manager.createTaskContainer(task);
      
      // Execute multiple phases
      await manager.executePhaseInContainer(container, phase1);
      await manager.executePhaseInContainer(container, phase2);
      
      // Cleanup only at end
      await manager.destroyTaskContainer(task.id);
      
      expect(mockDocker.stopContainer).toHaveBeenCalledTimes(1);
      expect(mockDocker.removeContainer).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('cleans up container on phase execution error', async () => {
      const container = await manager.createTaskContainer(task);
      
      mockExec.mockRejectedValueOnce(new Error('Phase failed'));
      
      await expect(
        manager.executePhaseInContainer(container, phase1)
      ).rejects.toThrow('Phase failed');
      
      // Verify cleanup happened
      expect(container.state).toBe('destroyed');
    });
  });
});
```

#### 2. phaseSystem.e2e.test.ts → Update for Single Container

**Changes Required:**
```typescript
// OLD: Assumes new container per phase
describe('Phase System End-to-End Integration', () => {
  it('should successfully process a task through all 7 phases', async () => {
    // OLD: Mock container creation per phase
    mockDocker.createContainer.mockResolvedValue(mockContainer);
    
    // Execute phases...
    
    // OLD: Verify 7 containers created
    expect(mockDocker.createContainer).toHaveBeenCalledTimes(7);
  });
});

// NEW: Single container for all phases
describe('Phase System End-to-End Integration', () => {
  it('should successfully process a task through all 7 phases in single container', async () => {
    const orchestrator = new TaskPhaseOrchestrator(
      phaseExecutor,
      taskQueue,
      containerManager
    );
    
    await orchestrator.executeTask(task);
    
    // NEW: Verify only 1 container created
    expect(mockDocker.createContainer).toHaveBeenCalledTimes(1);
    
    // NEW: Verify all phases executed in same container
    const container = containerManager.getContainer(task.id);
    expect(container.phaseHistory).toHaveLength(7);
    expect(container.phaseHistory.map(p => p.phase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    
    // NEW: Verify container cleanup only at end
    expect(mockDocker.removeContainer).toHaveBeenCalledTimes(1);
  });

  it('should preserve workspace state across phases', async () => {
    const orchestrator = new TaskPhaseOrchestrator(
      phaseExecutor,
      taskQueue,
      containerManager
    );
    
    // Mock file system to verify persistence
    const mockFiles = new Map<string, string>();
    mockExec.mockImplementation((cmd) => {
      if (cmd.includes('cat')) {
        const filename = cmd.match(/cat (.+)/)?.[1];
        return Promise.resolve({ stdout: mockFiles.get(filename) || '' });
      }
      if (cmd.includes('echo')) {
        const match = cmd.match(/echo "(.+)" > (.+)/);
        if (match) mockFiles.set(match[2], match[1]);
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    });
    
    await orchestrator.executeTask(task);
    
    // Verify Phase 1 file available in Phase 2
    expect(mockFiles.get('/workspace/task-plan.md')).toBeDefined();
    
    // Verify Phase 3 file available in Phase 4
    expect(mockFiles.get('/workspace/review-issues.json')).toBeDefined();
  });

  it('should handle phase loops without recreating container', async () => {
    const orchestrator = new TaskPhaseOrchestrator(
      phaseExecutor,
      taskQueue,
      containerManager
    );
    
    // Mock validation to trigger Phase 3→4→3 loop
    let reviewAttempt = 0;
    mockValidator.validate.mockImplementation(async (task) => {
      if (task.phase_index === 3 && reviewAttempt === 0) {
        reviewAttempt++;
        return { passed: false, nextPhase: 4 }; // Issues found, go to fixes
      }
      return { passed: true }; // All clear
    });
    
    await orchestrator.executeTask(task);
    
    // Verify container created only once despite loop
    expect(mockDocker.createContainer).toHaveBeenCalledTimes(1);
    
    // Verify loop executed
    const container = containerManager.getContainer(task.id);
    const reviewPhases = container.phaseHistory.filter(p => p.phase === 3);
    expect(reviewPhases.length).toBeGreaterThan(1);
  });
});
```

#### 3. ContainerLifecycleService.test.ts - Update Expectations

**Changes:**
```typescript
describe('ContainerLifecycleService', () => {
  describe('createContainer', () => {
    it('creates container with autoRemove=false for task containers', async () => {
      // OLD: autoRemove=true (ephemeral)
      // NEW: autoRemove=false (manual cleanup)
      
      const container = await service.createContainer({
        image: 'dev-bot:latest',
        name: 'task-123',
        autoRemove: false,  // Changed from true
        // ...
      });
      
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            AutoRemove: false  // Explicit manual cleanup
          })
        })
      );
    });
  });
});
```

### Integration Tests to Update

#### 4. phase-integration.test.ts - Complete Rewrite

**New Test File:**
```typescript
// backend/src/services/__tests__/singleContainer.integration.test.ts (NEW)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import Docker from 'dockerode';
import { TaskContainerManager } from '../TaskContainerManager.js';
import { PhaseExecutor } from '../PhaseExecutor.js';
import { TaskPhaseOrchestrator } from '../TaskPhaseOrchestrator.js';
import { TaskQueueService } from '../taskQueue.sqlite.js';

describe('Single Container Phase Execution Integration', () => {
  let db: Database.Database;
  let docker: Docker;
  let taskQueue: TaskQueueService;
  let containerManager: TaskContainerManager;
  let phaseExecutor: PhaseExecutor;
  let orchestrator: TaskPhaseOrchestrator;

  beforeEach(async () => {
    db = new Database(':memory:');
    docker = new Docker();
    taskQueue = new TaskQueueService(':memory:');
    
    containerManager = new TaskContainerManager(docker, db);
    phaseExecutor = new PhaseExecutor(containerManager, validatorRegistry, artifactExtractor);
    orchestrator = new TaskPhaseOrchestrator(phaseExecutor, taskQueue, containerManager);
  });

  afterEach(async () => {
    // Cleanup any remaining containers
    await containerManager.destroyAllContainers();
    db.close();
  });

  describe('Full Task Lifecycle', () => {
    it('executes all 7 phases in single container', async () => {
      const task = await taskQueue.createTask({
        type: 'feature',
        title: 'Test task',
        description: 'Integration test',
        assigned_agent: 'claude-sonnet'
      });

      const startTime = Date.now();
      await orchestrator.executeTask(task);
      const duration = Date.now() - startTime;

      // Verify task completed
      const completedTask = taskQueue.getTask(task.id);
      expect(completedTask?.status).toBe('completed');
      expect(completedTask?.phase_index).toBe(8); // Past Phase 7

      // Verify performance improvement (should be faster than multi-container)
      expect(duration).toBeLessThan(180000); // Under 3 minutes

      // Verify container cleanup
      const container = containerManager.getContainer(task.id);
      expect(container).toBeUndefined(); // Cleaned up
    });

    it('preserves git state across phases', async () => {
      const task = await taskQueue.createTask({
        type: 'feature',
        title: 'Test git persistence',
        assigned_agent: 'claude-sonnet'
      });

      await orchestrator.executeTask(task);

      // Verify commits from multiple phases
      const stageRuns = db.prepare('SELECT * FROM task_stage_runs WHERE task_id = ?').all(task.id);
      expect(stageRuns.length).toBeGreaterThanOrEqual(7);

      // Verify workspace artifacts
      const artifacts = await artifactExtractor.extractFinalArtifacts(task.id);
      expect(artifacts.gitLog).toBeDefined();
      expect(artifacts.gitLog.commits.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Benchmarks', () => {
    it('completes task faster than legacy multi-container', async () => {
      const tasks = await Promise.all([
        taskQueue.createTask({ type: 'feature', title: 'Task 1', assigned_agent: 'claude' }),
        taskQueue.createTask({ type: 'feature', title: 'Task 2', assigned_agent: 'claude' }),
        taskQueue.createTask({ type: 'feature', title: 'Task 3', assigned_agent: 'claude' })
      ]);

      const startTime = Date.now();
      await Promise.all(tasks.map(t => orchestrator.executeTask(t)));
      const duration = Date.now() - startTime;

      // Verify significant speedup (baseline: ~30min for 3 tasks with multi-container)
      expect(duration).toBeLessThan(25 * 60 * 1000); // Under 25 minutes
    });

    it('reduces container operations by 85%', async () => {
      const dockerSpy = vi.spyOn(docker, 'createContainer');
      
      const task = await taskQueue.createTask({
        type: 'feature',
        title: 'Container ops test',
        assigned_agent: 'claude'
      });

      await orchestrator.executeTask(task);

      // Verify only 1 container created (vs 7 with legacy)
      expect(dockerSpy).toHaveBeenCalledTimes(1);
    });
  });
});
```

### E2E Tests to Update

#### 5. e2e/tests/critical-paths.spec.ts - Update Task Execution Tests

**Changes Required:**
```typescript
// OLD: Test expects multiple containers
test('task execution creates worker containers', async ({ page }) => {
  await page.goto('/monitor');
  
  // Start task
  await page.click('[data-testid="start-task-btn"]');
  
  // OLD: Wait for worker container creation
  await page.waitForSelector('[data-testid="worker-container-id"]');
  
  // OLD: Verify container recreated per phase
  const containers = await page.locator('[data-testid="worker-container-id"]').all();
  expect(containers.length).toBeGreaterThan(1);
});

// NEW: Test expects single long-running container
test('task execution uses single container for all phases', async ({ page }) => {
  await page.goto('/monitor');
  
  // Start task
  await page.click('[data-testid="start-task-btn"]');
  
  // NEW: Wait for single container creation
  await page.waitForSelector('[data-testid="task-container-id"]');
  
  // NEW: Verify same container ID across phases
  const initialContainerId = await page.locator('[data-testid="task-container-id"]').textContent();
  
  // Wait for phase transitions
  await page.waitForSelector('[data-testid="phase-2"]');
  await page.waitForSelector('[data-testid="phase-3"]');
  
  // NEW: Verify container ID unchanged
  const currentContainerId = await page.locator('[data-testid="task-container-id"]').textContent();
  expect(currentContainerId).toBe(initialContainerId);
  
  // NEW: Verify container cleanup only after task completion
  await page.waitForSelector('[data-testid="task-completed"]');
  await expect(page.locator('[data-testid="task-container-id"]')).toHaveCount(0);
});
```

#### 6. e2e/tests/api-integration.spec.ts - Update Phase API Tests

**Changes:**
```typescript
test('phase progression API returns container metadata', async ({ request }) => {
  // Create task
  const task = await request.post('/api/dev-bots/tasks', {
    data: {
      type: 'feature',
      title: 'API test task',
      assigned_agent: 'claude'
    }
  });
  const taskId = (await task.json()).id;
  
  // Start task execution
  await request.post(`/api/dev-bots/tasks/${taskId}/execute`);
  
  // NEW: Get container info
  const containerInfo = await request.get(`/api/dev-bots/tasks/${taskId}/container`);
  const container = await containerInfo.json();
  
  expect(container.state).toBe('executing');
  expect(container.currentPhase).toBe(1);
  
  // Wait for phase progression
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // NEW: Verify same container ID after phase transition
  const updatedInfo = await request.get(`/api/dev-bots/tasks/${taskId}/container`);
  const updatedContainer = await updatedInfo.json();
  
  expect(updatedContainer.containerId).toBe(container.containerId); // Same container!
  expect(updatedContainer.currentPhase).toBeGreaterThan(1); // Advanced phase
});
```

### Test Fixtures & Mocks to Update

#### 7. e2e/mocks/docker-mocks.ts - Update Container Lifecycle Mocks

**New Mock Structure:**
```typescript
// e2e/mocks/docker-mocks.ts
export class MockTaskContainerManager {
  private containers = new Map<string, MockTaskContainer>();

  async createTaskContainer(task: Task): Promise<MockTaskContainer> {
    const container: MockTaskContainer = {
      id: `tc-${task.id}`,
      containerId: `mock-container-${Date.now()}`,
      taskId: task.id,
      state: 'ready',
      createdAt: Date.now(),
      currentPhase: 1,
      phaseHistory: []
    };
    
    this.containers.set(task.id, container);
    return container;
  }

  async executePhaseInContainer(
    container: MockTaskContainer,
    phase: number
  ): Promise<PhaseExecutionResult> {
    container.state = 'executing';
    container.currentPhase = phase;
    
    // Simulate phase execution
    await new Promise(resolve => setTimeout(resolve, 100));
    
    container.phaseHistory.push({
      phase,
      exitCode: 0,
      timestamp: Date.now()
    });
    
    container.state = 'idle';
    
    return {
      success: true,
      exitCode: 0,
      output: `Phase ${phase} completed`
    };
  }

  async destroyTaskContainer(taskId: string): Promise<void> {
    const container = this.containers.get(taskId);
    if (container) {
      container.state = 'destroyed';
      this.containers.delete(taskId);
    }
  }

  getContainer(taskId: string): MockTaskContainer | undefined {
    return this.containers.get(taskId);
  }
}
```

---

## Test Migration Checklist

### Unit Tests (Week 1)
- [ ] Create `TaskContainerManager.test.ts` (new)
- [ ] Create `PhaseExecutor.test.ts` (new)
- [ ] Create `TaskPhaseOrchestrator.test.ts` (new)
- [ ] Update `ContainerLifecycleService.test.ts` (autoRemove expectations)
- [ ] Update `phaseSystem.e2e.test.ts` (single container assertions)
- [ ] Delete `ephemeralWorker.context.test.ts` (legacy, no longer relevant)
- [ ] Update `phase-integration.test.ts` → `singleContainer.integration.test.ts`

### Integration Tests (Week 2)
- [ ] Create `singleContainer.integration.test.ts` (full lifecycle)
- [ ] Update `taskCompletion.botReporting.test.ts` (container metadata)
- [ ] Update `contextManagement.e2e.test.ts` (context persistence)
- [ ] Add performance benchmarks (container ops, execution time)
- [ ] Add workspace persistence tests

### E2E Tests (Week 3)
- [ ] Update `e2e/tests/critical-paths.spec.ts` (container lifecycle)
- [ ] Update `e2e/tests/api-integration.spec.ts` (phase API)
- [ ] Update `e2e/tests/navigation.spec.ts` (task detail view)
- [ ] Update `e2e/mocks/docker-mocks.ts` (new mock structure)
- [ ] Add E2E performance tests (task completion time)

### Test Infrastructure (Week 4)
- [ ] Update `e2e/helpers/test-helpers.ts` (container utilities)
- [ ] Update `e2e/assertions/task-assertions.ts` (phase assertions)
- [ ] Remove legacy test fixtures
- [ ] Update test documentation
- [ ] Verify 100% test pass rate

---

## Documentation Updates

### Files to Update

**Architecture Docs:**
- `docs/architecture/phase-system-architecture.md` - Update execution flow, blocked container behavior
- `docs/architecture/dev-bots-overview.md` - Update container lifecycle, capacity management

**Technical Designs:**
- `docs/technicalDesigns/task-processing-stage-implementation-roadmap.md` - Remove multi-container details

**Guides:**
- `docs/guides/troubleshooting.md` - Update container debugging section, blocked task recovery
- `docs/guides/admin-operations.md` - Add unblocking procedures
- `docs/CONTRIBUTING.md` - Update dev-bot development guide

**Runbooks:**
- `docs/runbooks/system-blocked-recovery.md` (NEW) - How to recover when all slots blocked
- `docs/runbooks/container-debugging.md` (UPDATE) - Debugging blocked containers

---

## Conclusion

**Benefits:**
- ✅ 85% reduction in container operations
- ✅ 95% faster phase transitions
- ✅ Guaranteed workspace consistency
- ✅ Simpler execution model
- ✅ Better resource utilization

**Effort:**
- Week 1: Implementation (3 new services)
- Week 2: Parallel testing
- Week 3: Gradual rollout
- Week 4: Legacy cleanup
- **Total:** 4 weeks

**Risk Level:** Low-Medium
- Comprehensive testing plan
- Feature flag for safe rollout
- Fast rollback capability (<5 min)
- No data loss scenarios

**Recommendation:** ✅ Proceed with implementation

---

**Next Steps:**
1. Review and approve this design
2. Create implementation tasks in queue
3. Assign to dev-bot for Week 1 implementation
4. Schedule code review for end of Week 1
5. Begin Week 2 testing on Monday following approval

**Est. Completion:** 4 weeks from approval
