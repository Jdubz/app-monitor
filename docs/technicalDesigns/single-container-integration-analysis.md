# Single Container Migration - Integration Analysis

**Date:** 2025-11-19  
**Status:** Implementation Planning  
**Related:** `single-container-phase-execution-migration.md`

---

## Executive Summary

This document provides a thorough analysis of existing code and integration points for the single-container phase execution migration. It maps new components to existing services and identifies all modification points.

---

## Current Architecture - Service Topology

### Primary Services (Existing)

```
DevBotsManager (orchestrator)
  ├─ TaskExecutionService ⚠️ MAJOR CHANGES
  │   ├─ EphemeralWorkerService ⚠️ MAJOR CHANGES  
  │   │   ├─ ContainerLifecycleService ✅ LEVERAGE (minor updates)
  │   │   ├─ ContextDeliveryService ✅ LEVERAGE (no changes)
  │   │   ├─ WorkerLogService ✅ LEVERAGE (no changes)
  │   │   └─ PhaseOrchestratorService ✅ LEVERAGE (no changes)
  │   ├─ AgentSelector ✅ LEVERAGE (no changes)
  │   ├─ TaskClassifier ✅ LEVERAGE (no changes)
  │   └─ SessionSummaryService ✅ LEVERAGE (no changes)
  │
  ├─ PhaseExecutionService ⚠️ MINOR CHANGES
  │   ├─ PhaseOrchestratorService ✅ LEVERAGE (no changes)
  │   ├─ ValidatorRegistry ✅ LEVERAGE (no changes)
  │   ├─ ArtifactExtractorService ✅ LEVERAGE (no changes)
  │   └─ RecoveryAgentService ✅ LEVERAGE (no changes)
  │
  ├─ TaskQueueService ✅ LEVERAGE (no changes)
  ├─ TaskCreationService ✅ LEVERAGE (no changes)
  └─ InteractiveSessionManager ✅ LEVERAGE (no changes)
```

**Legend:**
- ⚠️ **MAJOR CHANGES:** Significant refactoring required
- ⚠️ **MINOR CHANGES:** Small updates needed
- ✅ **LEVERAGE:** Use as-is, no changes
- 🆕 **NEW:** Create new service

---

## Integration Point Analysis

### 1. TaskExecutionService (`backend/src/services/taskExecution.service.ts`)

**Current Role:** Orchestrates task assignment and execution lifecycle

**File Location:** `backend/src/services/taskExecution.service.ts` (Lines 1-1047)

**Current Implementation:**
```typescript
export class TaskExecutionService {
  constructor(
    taskQueue: TaskQueueService,
    agentManager: AgentPersonalityManager,
    templateManager: TaskPromptTemplateManager,
    ephemeralWorkerService: EphemeralWorkerService,  // ⚠️ Will be replaced
    agentSelector: AgentSelector,
    config: Partial<TaskExecutionServiceConfig> = {}
  ) { }

  // Key method that needs refactoring:
  async assignNextTask(onTaskAssigned?: () => void): Promise<void> {
    // Line 424-784
    // Current: Creates worker per phase
    // New: Delegate to TaskPhaseOrchestrator
  }
}
```

**Changes Required:**

#### Option A: Refactor Existing Service
```typescript
export class TaskExecutionService {
  private taskPhaseOrchestrator: TaskPhaseOrchestrator; // 🆕 Add
  
  constructor(
    taskQueue: TaskQueueService,
    agentManager: AgentPersonalityManager,
    templateManager: TaskPromptTemplateManager,
    containerManager: TaskContainerManager,  // 🆕 Replace ephemeralWorkerService
    agentSelector: AgentSelector,
    config: Partial<TaskExecutionServiceConfig> = {}
  ) {
    // Initialize new orchestrator
    this.taskPhaseOrchestrator = new TaskPhaseOrchestrator(
      new PhaseExecutor(containerManager, validatorRegistry, artifactExtractor),
      taskQueue,
      containerManager
    );
  }

  async assignNextTask(onTaskAssigned?: () => void): Promise<void> {
    // Check capacity (including blocked containers)
    const canAssign = await this.taskPhaseOrchestrator.canAssignNewTask();
    if (!canAssign) {
      logger.warn({ category: 'capacity', action: 'no_capacity' });
      return;
    }

    // Get next task
    const task = this.taskQueue.assignNextTask();
    if (!task) return;

    // Delegate to orchestrator
    await this.taskPhaseOrchestrator.executeTask(task);
    
    if (onTaskAssigned) onTaskAssigned();
  }
}
```

**Lines to Modify:**
- Lines 424-784: `assignNextTask()` - Simplify to delegation pattern
- Lines 64-100: Constructor - Replace `ephemeralWorkerService` with `containerManager`
- Lines 593-599: Remove `createWorker()` calls
- Lines 766: Remove `destroyWorker()` calls

**Lines to Delete:**
- Lines 424-784: Most of the current implementation
- Keep: Agent selection logic (lines 400-420)
- Keep: PR validation logic (lines 380-400)

#### Option B: Keep Thin Wrapper
```typescript
// Minimal changes - just add feature flag
async assignNextTask(onTaskAssigned?: () => void): Promise<void> {
  if (this.config.useSingleContainerExecution) {
    // 🆕 New path
    return this.assignNextTaskSingleContainer(onTaskAssigned);
  }
  
  // ✅ Existing path (unchanged)
  return this.assignNextTaskLegacy(onTaskAssigned);
}

private async assignNextTaskSingleContainer(onTaskAssigned?: () => void): Promise<void> {
  // New implementation using TaskPhaseOrchestrator
}

private async assignNextTaskLegacy(onTaskAssigned?: () => void): Promise<void> {
  // Current implementation (lines 424-784)
}
```

**Recommendation:** Use Option B for Week 2 (parallel operation), migrate to Option A in Week 4 (legacy cleanup).

---

### 2. EphemeralWorkerService (`backend/src/services/ephemeralWorker.service.ts`)

**Current Role:** Manages ephemeral Docker containers for task execution

**File Location:** `backend/src/services/ephemeralWorker.service.ts` (Lines 1-1253)

**Current Implementation:**
```typescript
export class EphemeralWorkerService {
  private ephemeralWorkers = new Map<string, EphemeralWorker>();
  private containerLifecycle: ContainerLifecycleService;
  private workerLog: WorkerLogService;
  private contextDelivery: ContextDeliveryService;
  private phaseOrchestrator: PhaseOrchestratorService;
  
  // Key methods:
  async createWorker(task, agent, agentCliType): Promise<EphemeralWorker> {
    // Lines 204-500
    // Creates container per task
    // ⚠️ This logic moves to TaskContainerManager.createTaskContainer()
  }

  async executeTask(worker): Promise<TaskExecutionResult> {
    // Lines 622-756
    // Executes single phase
    // ⚠️ This logic moves to PhaseExecutor.executePhase()
  }

  async completePhaseExecution(worker, output, errorOutput, exitCode): Promise<ValidationResult> {
    // Lines 772-1000
    // Validates phase, advances, recovers
    // ⚠️ This logic moves to PhaseExecutor.executePhase()
  }

  async destroyWorker(workerId): Promise<void> {
    // Lines 1002-1050
    // Destroys container
    // ⚠️ This logic moves to TaskContainerManager.destroyTaskContainer()
  }
}
```

**Changes Required:**

**Strategy: Extract and Delegate**

The service has 4 major responsibilities that will be split:

| Current Method | Line Range | New Owner | Notes |
|----------------|------------|-----------|-------|
| `createWorker()` | 204-500 | `TaskContainerManager.createTaskContainer()` | Container creation once per task |
| `executeTask()` | 622-756 | `PhaseExecutor.executePhase()` | Execute phase in existing container |
| `completePhaseExecution()` | 772-1000 | `PhaseExecutor.executePhase()` | Integrated validation/recovery |
| `destroyWorker()` | 1002-1050 | `TaskContainerManager.destroyTaskContainer()` | Cleanup only on task completion |

**Helper Methods to Extract:**
```typescript
// Lines 570-620: cloneFreshRepoInContainer()
// → Move to TaskContainerManager (used once during container setup)

// Lines 850-900: generateTaskExecutionCommandWithLogging()
// → Move to PhaseExecutor (used per phase)

// Lines 1100-1200: shutdown()
// → Update to call TaskContainerManager.destroyAllContainers()
```

**Services to Reuse (No Changes):**
```typescript
✅ this.containerLifecycle: ContainerLifecycleService
   - Used by TaskContainerManager
   - No changes needed

✅ this.workerLog: WorkerLogService
   - Used by TaskContainerManager
   - No changes needed

✅ this.contextDelivery: ContextDeliveryService
   - Used by TaskContainerManager during setup
   - No changes needed

✅ this.phaseOrchestrator: PhaseOrchestratorService
   - Used by PhaseExecutor
   - No changes needed
```

**Migration Path:**

**Week 1-2:** Keep EphemeralWorkerService, add new services alongside
```typescript
// Keep legacy methods for feature flag
export class EphemeralWorkerService {
  // Legacy methods (unchanged)
  async createWorker() { /* existing */ }
  async executeTask() { /* existing */ }
  async destroyWorker() { /* existing */ }
}

// New services created alongside
export class TaskContainerManager {
  async createTaskContainer() { /* new */ }
  async destroyTaskContainer() { /* new */ }
}

export class PhaseExecutor {
  async executePhase() { /* new */ }
}
```

**Week 4:** Delete legacy methods, keep only essential utilities
```typescript
export class EphemeralWorkerService {
  // Delete: createWorker(), executeTask(), destroyWorker()
  // Keep: Helper methods if needed by other services
  // OR: Delete entire service, move helpers to TaskContainerManager
}
```

---

### 3. ContainerLifecycleService (`backend/src/services/ContainerLifecycleService.ts`)

**Current Role:** Low-level Docker container operations

**File Location:** `backend/src/services/ContainerLifecycleService.ts` (Lines 1-328)

**Current Implementation:**
```typescript
export class ContainerLifecycleService {
  async createContainer(config: ContainerConfig): Promise<Docker.Container> {
    // Lines 60-100
    // ✅ Used as-is by TaskContainerManager
  }

  async startContainer(containerId: string): Promise<void> {
    // Lines 102-120
    // ✅ Used as-is by TaskContainerManager
  }

  async stopContainer(containerId: string, gracePeriodSeconds = 10): Promise<void> {
    // Lines 122-150
    // ✅ Used as-is by TaskContainerManager
  }

  async removeContainer(containerId: string, force = true): Promise<void> {
    // Lines 152-200
    // ✅ Used as-is by TaskContainerManager
  }

  async waitForHealthy(containerId, options): Promise<void> {
    // Lines 220-280
    // ✅ Used as-is by TaskContainerManager
  }
}
```

**Changes Required:**

**Minor Update:** Add blocked container tracking (optional)
```typescript
export class ContainerLifecycleService {
  // All existing methods unchanged
  
  // 🆕 Optional: Add helper for blocked state
  async markContainerBlocked(containerId: string): Promise<void> {
    // Label container as blocked for monitoring
    const container = this.docker.getContainer(containerId);
    // This is optional - blocking is tracked in TaskContainerManager
  }
}
```

**Recommendation:** Use as-is, no changes required. Blocking state tracked in `TaskContainerManager.taskContainers` map.

---

### 4. PhaseExecutionService (`backend/src/services/phaseExecution.service.ts`)

**Current Role:** High-level phase workflow orchestration

**File Location:** `backend/src/services/phaseExecution.service.ts` (Lines 1-200)

**Current Implementation:**
```typescript
export class PhaseExecutionService {
  private orchestrator: PhaseOrchestratorService;
  
  async executePhaseWorkflow(task: Task, containerId: string): Promise<PhaseExecutionResult> {
    // Lines 50-150
    // 1. Extract artifacts
    // 2. Validate
    // 3. Record stage run
    // 4. Determine next phase
    // 5. Handle recovery
    
    // ⚠️ This is called AFTER phase execution
    // New: This becomes part of PhaseExecutor.executePhase()
  }
}
```

**Changes Required:**

**Option A: Integrate into PhaseExecutor**
```typescript
// Delete PhaseExecutionService
// Move logic into PhaseExecutor.executePhase()

export class PhaseExecutor {
  async executePhase(task: Task): Promise<PhaseExecutionResult> {
    // Get or create container
    let container = this.containerManager.getContainer(task.id);
    if (!container) {
      container = await this.containerManager.createTaskContainer(task);
    }

    // Execute phase (docker exec)
    const result = await this.containerManager.executePhaseInContainer(container, phase);

    // Extract artifacts (from PhaseExecutionService.executePhaseWorkflow)
    const artifacts = await this.artifactExtractor.extractArtifacts({
      containerId: container.containerId,
      phaseIndex: task.phase_index,
      attempt: task.phase_attempts
    });

    // Validate (from PhaseExecutionService.executePhaseWorkflow)
    const validator = this.validatorRegistry.getValidator(task.phase_index);
    const validation = await validator.validate(task, artifacts);

    // Record stage run (from PhaseExecutionService.executePhaseWorkflow)
    await this.recordStageRun(task, result, validation);

    // Container stays alive - don't destroy

    return { result, validation };
  }
}
```

**Option B: Keep Separate, Update Call Pattern**
```typescript
// Keep PhaseExecutionService
// Update to work with persistent containers

export class PhaseExecutionService {
  async executePhaseWorkflow(task: Task, containerId: string): Promise<PhaseExecutionResult> {
    // Unchanged logic
    // No longer responsible for container lifecycle
  }
}

export class PhaseExecutor {
  async executePhase(task: Task): Promise<PhaseExecutionResult> {
    // Manage container
    let container = this.containerManager.getContainer(task.id);
    if (!container) {
      container = await this.containerManager.createTaskContainer(task);
    }

    // Execute in container
    const result = await this.containerManager.executePhaseInContainer(container, phase);

    // Delegate to PhaseExecutionService
    return await this.phaseExecutionService.executePhaseWorkflow(task, container.containerId);
  }
}
```

**Recommendation:** Option A (consolidate). `PhaseExecutionService` is thin wrapper, integrate into `PhaseExecutor`.

---

### 5. PhaseOrchestratorService (`backend/src/services/phaseOrchestrator.service.ts`)

**Current Role:** Phase state machine (determines next phase)

**File Location:** `backend/src/services/phaseOrchestrator.service.ts`

**Current Implementation:**
```typescript
export class PhaseOrchestratorService {
  determineNextPhase(currentPhase: number, validation: ValidationResult): PhaseTransition {
    // Lines 50-200
    // ✅ No changes needed
    // Used by PhaseExecutor to determine phase advancement
  }

  recordStageRun(stageRun: StageRun): string {
    // Lines 250-300
    // ✅ No changes needed
    // Used by PhaseExecutor to record phase history
  }

  advancePhase(task: Task, validation: ValidationResult): PhaseTransition {
    // Lines 350-400
    // ✅ No changes needed
  }
}
```

**Changes Required:** ✅ **NONE** - Use as-is

This service is pure logic with no container dependencies.

---

### 6. ValidatorRegistry & Phase Validators

**Current Role:** Validate phase completion criteria

**File Locations:**
- `backend/src/services/phaseValidation/ValidatorRegistry.ts`
- `backend/src/services/phaseValidation/Phase1PlanningValidator.ts`
- `backend/src/services/phaseValidation/Phase2ImplementationValidator.ts`
- ... (Phases 3-7)

**Current Implementation:**
```typescript
export class ValidatorRegistry {
  getValidator(phaseIndex: number): PhaseValidator {
    // ✅ No changes needed
  }
}

export class Phase1PlanningValidator implements PhaseValidator {
  async validate(task: Task, artifacts: Artifacts): Promise<ValidationResult> {
    // ✅ No changes needed
    // Validators are stateless, work with any container
  }
}
```

**Changes Required:** ✅ **NONE** - Use as-is

Validators are stateless and don't care about container lifecycle.

---

### 7. ArtifactExtractorService (`backend/src/services/artifactExtractor.service.ts`)

**Current Role:** Extract artifacts from container filesystem

**Current Implementation:**
```typescript
export class ArtifactExtractorService {
  async extractArtifacts({ containerId, phaseIndex, attempt }): Promise<Artifacts> {
    // ✅ No changes needed
    // Extracts from running or completed container
    // Works with persistent containers
  }
}
```

**Changes Required:** ✅ **NONE** - Use as-is

Can extract from running containers (no need to stop/destroy first).

---

### 8. RecoveryAgentService (`backend/src/services/recoveryAgent.service.ts`)

**Current Role:** Diagnose failures and suggest recovery

**Current Implementation:**
```typescript
export class RecoveryAgentService {
  async executeRecovery(task, containerId, validation, attempt): Promise<RecoveryResult> {
    // ✅ No changes needed
    // Executes recovery in existing container
    // Already supports persistent containers
  }
}
```

**Changes Required:** ✅ **NONE** - Use as-is

Already designed to work with running containers.

---

## New Service Specifications

### 1. TaskContainerManager (NEW)

**Purpose:** Manage long-running task containers

**File Location:** `backend/src/services/TaskContainerManager.ts` (NEW)

**Dependencies:**
- ✅ `ContainerLifecycleService` - Create/start/stop/remove containers
- ✅ `ContextDeliveryService` - Copy context bundles
- ✅ `WorkerLogService` - Initialize log files
- ✅ `DockerManager` - Docker exec operations
- 🆕 Database connection - Track container state

**Interface:**
```typescript
export class TaskContainerManager {
  constructor(
    private docker: Docker,
    private containerLifecycle: ContainerLifecycleService,
    private contextDelivery: ContextDeliveryService,
    private workerLog: WorkerLogService,
    private db: Database.Database,
    private config: TaskContainerConfig
  ) {}

  async createTaskContainer(task: Task): Promise<TaskContainer>
  async executePhaseInContainer(container: TaskContainer, phase: PhaseDefinition): Promise<PhaseExecutionResult>
  async destroyTaskContainer(taskId: string): Promise<void>
  
  getContainer(taskId: string): TaskContainer | undefined
  getActiveContainerCount(): number
  getBlockedContainerCount(): number
  isSystemBlocked(): boolean
  
  async unblockAndDestroyContainer(taskId: string): Promise<void>
}
```

**Extracted From:**
- `EphemeralWorkerService.createWorker()` (lines 204-500)
- `EphemeralWorkerService.cloneFreshRepoInContainer()` (lines 570-620)
- `EphemeralWorkerService.destroyWorker()` (lines 1002-1050)

---

### 2. PhaseExecutor (NEW)

**Purpose:** Execute individual phases in persistent containers

**File Location:** `backend/src/services/PhaseExecutor.ts` (NEW)

**Dependencies:**
- 🆕 `TaskContainerManager` - Get/create containers
- ✅ `ValidatorRegistry` - Get phase validators
- ✅ `ArtifactExtractorService` - Extract artifacts
- ✅ `PhaseOrchestratorService` - Record stage runs
- ✅ `RecoveryAgentService` - Handle failures

**Interface:**
```typescript
export class PhaseExecutor {
  constructor(
    private containerManager: TaskContainerManager,
    private validatorRegistry: ValidatorRegistry,
    private artifactExtractor: ArtifactExtractorService,
    private phaseOrchestrator: PhaseOrchestratorService,
    private recoveryAgent: RecoveryAgentService
  ) {}

  async executePhase(task: Task): Promise<PhaseExecutionResult>
  async completeTask(task: Task): Promise<void>
  
  private buildPhaseCommand(task: Task): string
  private recordStageRun(task: Task, result: PhaseExecutionResult, validation: ValidationResult): Promise<void>
  private extractFinalArtifacts(container: TaskContainer): Promise<void>
}
```

**Extracted From:**
- `EphemeralWorkerService.executeTask()` (lines 622-756)
- `EphemeralWorkerService.completePhaseExecution()` (lines 772-1000)
- `PhaseExecutionService.executePhaseWorkflow()` (lines 50-150)
- `EphemeralWorkerService.generateTaskExecutionCommandWithLogging()` (lines 850-900)

---

### 3. TaskPhaseOrchestrator (NEW)

**Purpose:** Coordinate multi-phase task execution

**File Location:** `backend/src/services/TaskPhaseOrchestrator.ts` (NEW)

**Dependencies:**
- 🆕 `PhaseExecutor` - Execute individual phases
- ✅ `TaskQueueService` - Update task state
- 🆕 `TaskContainerManager` - Check capacity
- ✅ `PhaseOrchestratorService` - Determine phase transitions

**Interface:**
```typescript
export class TaskPhaseOrchestrator {
  constructor(
    private phaseExecutor: PhaseExecutor,
    private taskQueue: TaskQueueService,
    private containerManager: TaskContainerManager,
    private phaseOrchestrator: PhaseOrchestratorService
  ) {}

  async executeTask(task: Task): Promise<void>
  async canAssignNewTask(): Promise<boolean>
  
  private determineNextPhase(task: Task, validation: ValidationResult): number
  private blockTask(task: Task, validation: ValidationResult): Promise<void>
}
```

**Integrates:**
- `TaskExecutionService.assignNextTask()` logic (lines 424-784)
- Phase loop handling (3↔4, 5 internal)
- Blocking logic with container preservation

---

## Service Dependency Graph (New)

```
TaskExecutionService
  └─> TaskPhaseOrchestrator (NEW)
       ├─> PhaseExecutor (NEW)
       │    ├─> TaskContainerManager (NEW)
       │    │    ├─> ContainerLifecycleService ✅
       │    │    ├─> ContextDeliveryService ✅
       │    │    ├─> WorkerLogService ✅
       │    │    └─> DockerManager ✅
       │    ├─> ValidatorRegistry ✅
       │    ├─> ArtifactExtractorService ✅
       │    ├─> PhaseOrchestratorService ✅
       │    └─> RecoveryAgentService ✅
       ├─> TaskQueueService ✅
       └─> TaskContainerManager (NEW)
```

---

## Factory Integration

### DevBotsManager Factory (`backend/src/services/devBotsManager.factory.ts`)

**Current Initialization (Lines 86-100):**
```typescript
// Initialize ephemeral worker service
const ephemeralWorkerService = new EphemeralWorkerService(
  docker,
  dockerManager,
  {
    maxConcurrentWorkers: 2,
    dockerImage: 'dev-bot:latest',
    logsDirectory: './data/logs',
    envPassthroughKeys: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']
  },
  taskQueue.getDb()
);
```

**New Initialization:**
```typescript
// Week 2: Feature flag - create both
const useSingleContainer = process.env.DEVBOTS_SINGLE_CONTAINER === 'true';

if (useSingleContainer) {
  // 🆕 New: Create TaskContainerManager
  const taskContainerManager = new TaskContainerManager(
    docker,
    new ContainerLifecycleService(docker),
    new ContextDeliveryService(docker, contextGenerator),
    new WorkerLogService({ logsDirectory: './dev-bots/logs' }),
    taskQueue.getDb(),
    {
      maxConcurrentWorkers: 2,
      dockerImage: 'dev-bot:latest',
      logsDirectory: './data/logs',
      envPassthroughKeys: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']
    }
  );

  // 🆕 Create PhaseExecutor
  const phaseExecutor = new PhaseExecutor(
    taskContainerManager,
    getValidatorRegistry(),
    getArtifactExtractor(),
    new PhaseOrchestratorService(taskQueue.getDb()),
    getRecoveryService()
  );

  // 🆕 Create TaskPhaseOrchestrator
  const taskPhaseOrchestrator = new TaskPhaseOrchestrator(
    phaseExecutor,
    taskQueue,
    taskContainerManager
  );

  // Update TaskExecutionService with new orchestrator
  const taskExecutionService = new TaskExecutionService(
    taskQueue,
    agentManager,
    templateManager,
    taskPhaseOrchestrator, // 🆕 Pass orchestrator
    agentSelector,
    { maxConcurrentWorkers: 2, useSingleContainerExecution: true }
  );
} else {
  // ✅ Legacy: Keep existing initialization
  const ephemeralWorkerService = new EphemeralWorkerService(...);
  const taskExecutionService = new TaskExecutionService(
    taskQueue,
    agentManager,
    templateManager,
    ephemeralWorkerService,
    agentSelector,
    { maxConcurrentWorkers: 2, useSingleContainerExecution: false }
  );
}
```

**Week 4: Clean up legacy path**
```typescript
// Delete legacy initialization
// Keep only new services
const taskContainerManager = new TaskContainerManager(...);
const phaseExecutor = new PhaseExecutor(...);
const taskPhaseOrchestrator = new TaskPhaseOrchestrator(...);
const taskExecutionService = new TaskExecutionService(...);
```

---

## API Integration Points

### Admin API (NEW Endpoints)

**File Location:** `backend/src/routes/admin.ts` (NEW) or extend `backend/src/routes/dev-bots/tasks.routes.ts`

**New Endpoints:**
```typescript
// Unblock specific task
router.post('/admin/tasks/:taskId/unblock', requireAdmin, async (req, res) => {
  const { taskId } = req.params;
  await taskContainerManager.unblockAndDestroyContainer(taskId);
  res.json({ success: true });
});

// Get blocked tasks
router.get('/admin/blocked-tasks', requireAdmin, async (req, res) => {
  const blockedTasks = await getBlockedTasks();
  res.json({ tasks: blockedTasks, systemBlocked: taskContainerManager.isSystemBlocked() });
});

// Force unblock all (emergency)
router.post('/admin/unblock-all', requireAdmin, async (req, res) => {
  if (!req.body.confirm) {
    return res.status(400).json({ error: 'Must confirm' });
  }
  const count = await unblockAllTasks();
  res.json({ success: true, unblockedCount: count });
});
```

**Integration with existing routes:**
- Leverage existing auth middleware (`requireAdmin`)
- Use existing error handling patterns
- Emit WebSocket events for UI updates

---

### Frontend Integration Points

**File Location:** `frontend/src/services/api.ts`

**New API Methods:**
```typescript
export const api = {
  // Existing methods...
  
  // 🆕 New: Blocked task management
  async getBlockedTasks() {
    return this.get<BlockedTasksResponse>('/api/admin/blocked-tasks');
  },
  
  async unblockTask(taskId: string) {
    return this.post<UnblockResponse>(`/api/admin/tasks/${taskId}/unblock`);
  },
  
  async unblockAllTasks() {
    return this.post<UnblockAllResponse>('/api/admin/unblock-all', { confirm: true });
  }
};
```

**Frontend Components:**
- `BlockedTasksWidget.tsx` (NEW) - Dashboard widget
- `SystemCapacityIndicator.tsx` (NEW) - Capacity gauge
- Update `TaskDetailView.tsx` - Show container ID, blocked state
- Update `MonitorDashboard.tsx` - Add blocked tasks section

---

## Database Schema Integration

### Existing Schema (No Changes to Core Tables)

**Tasks Table:**
```sql
-- Already has phase columns (no changes needed)
phase_index INTEGER DEFAULT 1
phase_name TEXT DEFAULT 'Planning'
phase_status TEXT DEFAULT 'ready'
phase_attempts INTEGER DEFAULT 1
phase_payload TEXT

-- NEW: Add blocked tracking
blocked_at INTEGER
blocked_reason TEXT
```

**Migration 027 (NEW):**
```sql
-- Add blocked tracking to tasks
ALTER TABLE tasks ADD COLUMN blocked_at INTEGER;
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;

-- Index for blocked tasks query
CREATE INDEX idx_tasks_blocked ON tasks(phase_status) WHERE phase_status = 'blocked';
```

---

## Testing Integration

### Existing Test Files to Update

**Unit Tests:**
```
backend/src/services/__tests__/
  ├─ ephemeralWorker.context.test.ts ❌ DELETE (no longer relevant)
  ├─ ContainerLifecycleService.test.ts ⚠️ UPDATE (autoRemove expectations)
  ├─ phaseSystem.e2e.test.ts ⚠️ UPDATE (single container assertions)
  ├─ phase-integration.test.ts → singleContainer.integration.test.ts ⚠️ REWRITE
  └─ taskCompletion.botReporting.test.ts ⚠️ UPDATE (container metadata)
```

**New Test Files:**
```
backend/src/services/__tests__/
  ├─ TaskContainerManager.test.ts 🆕 NEW
  ├─ PhaseExecutor.test.ts 🆕 NEW
  └─ TaskPhaseOrchestrator.test.ts 🆕 NEW
```

**E2E Tests:**
```
e2e/tests/
  ├─ critical-paths.spec.ts ⚠️ UPDATE (container lifecycle)
  ├─ api-integration.spec.ts ⚠️ UPDATE (phase API)
  └─ navigation.spec.ts ⚠️ UPDATE (task detail view)
```

---

## Monitoring & Observability Integration

### Existing Metrics (Extend)

**File:** `backend/src/services/metricsEmitter.ts`

**Current Metrics:**
```typescript
export class MetricsEmitter {
  emitTaskMetric(event: string, task: Task) {
    // ✅ No changes needed
  }
  
  emitPhaseMetric(event: string, phase: number) {
    // ✅ No changes needed
  }
}
```

**New Metrics:**
```typescript
export class MetricsEmitter {
  // 🆕 Add container metrics
  emitContainerMetric(event: string, containerId: string, state: ContainerLifecycleState) {
    this.emit('container_state_change', {
      event,
      containerId,
      state,
      timestamp: Date.now()
    });
  }
  
  // 🆕 Add capacity metrics
  emitCapacityMetric(active: number, blocked: number, maxWorkers: number) {
    this.emit('capacity_update', {
      active,
      blocked,
      available: maxWorkers - active,
      utilizationPercent: (active / maxWorkers) * 100,
      blockedPercent: (blocked / maxWorkers) * 100
    });
  }
}
```

---

## Configuration Integration

### Existing Config (`backend/src/config/index.ts`)

**Current:**
```typescript
export const config = {
  devBots: {
    maxWorkers: 2,
    dockerImage: 'dev-bot:latest',
    // ...
  }
};
```

**New:**
```typescript
export const config = {
  devBots: {
    maxWorkers: 2,
    dockerImage: 'dev-bot:latest',
    
    // 🆕 Feature flag
    useSingleContainerExecution: process.env.DEVBOTS_SINGLE_CONTAINER === 'true',
    
    // 🆕 Container lifecycle
    containerIdleTimeout: 3600000, // 1 hour safety timeout
    
    // 🆕 Blocked container alerts
    blockedContainerAlertThreshold: 0.5, // Alert when >50% blocked
  }
};
```

---

## WebSocket Event Integration

### Existing Events (Extend)

**File:** `backend/src/services/connectionManager.ts`

**Current Events:**
```typescript
socket.emit('task:started', { taskId, phase })
socket.emit('task:completed', { taskId })
socket.emit('phase:validating', { taskId, phase })
```

**New Events:**
```typescript
// 🆕 Container lifecycle events
socket.emit('container:created', { taskId, containerId, state })
socket.emit('container:blocked', { taskId, containerId, reason })
socket.emit('container:unblocked', { taskId, containerId })
socket.emit('container:destroyed', { taskId, containerId })

// 🆕 Capacity events
socket.emit('capacity:update', { active, blocked, available })
socket.emit('system:blocked', { blockedCount, maxWorkers })
socket.emit('system:unblocked', { newCapacity })
```

---

## Summary: Integration Checklist

### Services to LEVERAGE (No Changes)
- ✅ `ContainerLifecycleService` - Low-level Docker ops
- ✅ `ContextDeliveryService` - Context bundle copying
- ✅ `WorkerLogService` - Log file management
- ✅ `PhaseOrchestratorService` - Phase state machine
- ✅ `ValidatorRegistry` - Phase validation
- ✅ `ArtifactExtractorService` - Artifact extraction
- ✅ `RecoveryAgentService` - Failure recovery
- ✅ `TaskQueueService` - Task queue management
- ✅ `AgentSelector` - Agent selection
- ✅ `DockerManager` - Docker utilities

### Services to UPDATE (Minor Changes)
- ⚠️ `TaskExecutionService` - Add feature flag, delegate to orchestrator
- ⚠️ `PhaseExecutionService` - Integrate into PhaseExecutor (optional)
- ⚠️ `DevBotsManager.factory.ts` - Add new service initialization

### Services to REFACTOR (Major Changes)
- ⚠️ `EphemeralWorkerService` - Extract logic to new services, keep utilities

### Services to CREATE (New)
- 🆕 `TaskContainerManager` - Long-running container management
- 🆕 `PhaseExecutor` - Phase execution in persistent containers
- 🆕 `TaskPhaseOrchestrator` - Multi-phase task coordination

### Database Changes
- 🆕 Migration 027: Add `blocked_at`, `blocked_reason` to tasks table

### API Changes
- 🆕 Admin endpoints: `/admin/tasks/:id/unblock`, `/admin/blocked-tasks`, `/admin/unblock-all`

### Frontend Changes
- 🆕 `BlockedTasksWidget.tsx` - Blocked tasks dashboard
- 🆕 `SystemCapacityIndicator.tsx` - Capacity gauge
- ⚠️ Update existing task views for container metadata

### Testing Changes
- 🆕 3 new unit test files
- ⚠️ Update 5 existing test files
- ⚠️ Update 3 E2E test files
- ❌ Delete 1 obsolete test file

---

## Implementation Order (4 Weeks)

**Week 1: New Services**
1. Create `TaskContainerManager` (leverage existing services)
2. Create `PhaseExecutor` (leverage validators, extractors)
3. Create `TaskPhaseOrchestrator` (leverage phase orchestrator)
4. Write unit tests for all 3 services

**Week 2: Parallel Operation**
1. Add feature flag to `TaskExecutionService`
2. Update `DevBotsManager.factory.ts` with dual initialization
3. Add admin API endpoints for unblocking
4. Deploy to staging, test both paths

**Week 3: Gradual Rollout**
1. 10% → 25% → 50% → 100% rollout
2. Monitor metrics, blocked container rates
3. Test emergency unblock procedures

**Week 4: Legacy Cleanup**
1. Delete legacy code from `EphemeralWorkerService`
2. Update all tests
3. Update documentation
4. Remove feature flag

---

**Total Integration Points:** 25 files modified, 10 files created, 1 file deleted, 1 database migration

**Risk Level:** Medium (comprehensive testing and feature flag mitigate risk)

**Estimated Effort:** 4 weeks (as planned)
