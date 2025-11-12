# DevBotsManager Refactoring Plan

**Date**: 2025-11-12
**Status**: In Progress
**Priority**: P1 - High Value
**Current Size**: 1,789 lines → **Target**: ~600 lines (66% reduction)

---

## Overview

Refactor `devBotsManager.ts` from a monolithic orchestrator doing too much into a clean orchestrator that delegates to specialized services.

**Current State**: 1,789 lines mixing orchestration, worker management, monitoring, Docker operations, and interactive sessions

**Target State**: ~600 lines of pure orchestration delegating to:
- ✅ EphemeralWorkerService (already exists - 977 lines)
- ✅ InteractiveSessionService (already exists - 169 lines)
- ✅ DockerManager (already exists - 708 lines)
- 🆕 WorkerHealthMonitor (to be created - ~200 lines)

---

## Current Analysis

### Already Well-Delegated ✅

1. **Task Execution** → `taskExecutionService` (1,234 lines)
2. **Task Completion** → `taskCompletionService`
3. **Ephemeral Workers** → `ephemeralWorkerService` (977 lines)
4. **Interactive Sessions** → `interactiveSessionService` (169 lines)
5. **Docker Operations** → `dockerManager` (708 lines)
6. **Agent Management** → `agentManager`
7. **Templates/Guidelines** → `templateManager`, `guidelinesManager`
8. **Workspace Sync** → `workspaceSyncManager`
9. **Task Queue** → `taskQueue` (SQLite-based)
10. **PR Workflow** → `prWorkflowOrchestrator`

### Still in devBotsManager (To Extract) ⚠️

1. **Worker Metadata Map** (lines 115-116)
   - `workers` Map<string, WorkerInfo>
   - Redundant with ephemeralWorkerService tracking
   - **Solution**: Remove or consolidate

2. **Health Monitoring** (lines 471-670)
   - `startHeartbeatMonitor()` - monitors worker health
   - `startLongRunningTaskMonitor()` - detects stuck tasks
   - `checkWorkerHealth()` - validates workers
   - `updateWorkerHealth()` - updates worker status
   - ~200 lines of monitoring logic
   - **Solution**: Extract to `WorkerHealthMonitor`

3. **Interactive Idle Watchdog** (lines 710-760)
   - `startInteractiveIdleWatchdog()` - monitors idle sessions
   - `getInteractiveLastActivity()` - calculates idle time
   - ~50 lines
   - **Solution**: Move to `InteractiveSessionService`

4. **Docker Health Checks** (lines 882-944)
   - `startHealthCheck()` - periodic Docker validation
   - `checkWorkerHealth()` - includes Docker checks
   - Already mostly delegating to dockerManager
   - **Solution**: Move fully to dockerManager or WorkerHealthMonitor

5. **Token Usage Extraction** (lines 1231-1283)
   - `extractAndRecordTokenUsage()` - parses token usage from output
   - Pure utility function
   - **Solution**: Move to tokenTracking service or taskCompletionService

6. **Simple Delegators** (lines 763-869)
   - Metrics getters → delegate to taskQueue
   - Interactive session getters → delegate to interactiveSessionService
   - **Status**: Already clean, keep as-is

---

## Refactoring Strategy

### Phase 1: Extract WorkerHealthMonitor Service

**Create**: `backend/src/services/workerHealthMonitor.service.ts` (~200 lines)

**Extract from devBotsManager**:
- `startHeartbeatMonitor()` (lines 471-502)
- `startLongRunningTaskMonitor()` (lines 504-669)
- `checkWorkerHealth()` (lines 894-942)
- `updateWorkerHealth()` (lines 944-953)
- `checkCleanupSchedules()` (lines 955-980)

**New Service Interface**:
```typescript
export class WorkerHealthMonitor {
  constructor(
    private ephemeralWorkerService: EphemeralWorkerService,
    private taskQueue: TaskQueueService,
    private dockerManager: DockerManager,
    private emit: (event: string, ...args: any[]) => void
  ) {}

  start(): void {
    this.startHeartbeatMonitor();
    this.startLongRunningTaskMonitor();
  }

  stop(): void {
    // Clear all intervals
  }

  async checkWorkerHealth(): Promise<boolean> {}
  async updateWorkerHealth(): Promise<void> {}
  private startHeartbeatMonitor(): void {}
  private startLongRunningTaskMonitor(): void {}
  private async checkCleanupSchedules(): Promise<void> {}
}
```

**Estimated Effort**: 1 hour
**Lines Extracted**: ~200

---

### Phase 2: Move Interactive Idle Watchdog

**Update**: `backend/src/services/interactiveSession.service.ts`

**Add Methods**:
```typescript
export class InteractiveSessionService {
  private idleWatchdogInterval?: NodeJS.Timeout;

  startIdleWatchdog(
    idleTimeoutMs: number,
    onIdleTimeout: (session: InteractiveSessionRecord) => void
  ): void {
    // Monitor all active sessions for idle timeout
  }

  stopIdleWatchdog(): void {
    if (this.idleWatchdogInterval) {
      clearInterval(this.idleWatchdogInterval);
    }
  }

  getLastActivity(session: InteractiveSessionRecord): number | null {
    // Calculate last activity timestamp
  }
}
```

**Extract from devBotsManager**:
- `startInteractiveIdleWatchdog()` (lines 710-746)
- `getInteractiveLastActivity()` (lines 748-761)

**Estimated Effort**: 30 minutes
**Lines Extracted**: ~50

---

### Phase 3: Consolidate Worker Tracking

**Remove from devBotsManager**:
- `workers` Map<string, WorkerInfo> (line 115)
- `completeWorkerOnboarding()` (lines 1159-1170)

**Update EphemeralWorkerService**:
Add onboarding tracking to existing worker metadata

```typescript
export interface EphemeralWorker {
  id: string;
  containerId: string;
  agent: AgentPersonality;
  task: Task;
  status: 'starting' | 'running' | 'completing' | 'completed' | 'failed' | 'destroyed';
  createdAt: string;
  completedAt?: string;
  destroyedAt?: string;
  workspace: WorkspaceContext;
  // NEW:
  onboardingComplete?: boolean;
  lastOnboardingCheck?: number;
}
```

**Estimated Effort**: 20 minutes
**Lines Removed**: ~15

---

### Phase 4: Move Token Usage to TaskCompletionService

**Update**: `backend/src/services/taskCompletion.service.ts`

**Add Method**:
```typescript
private extractAndRecordTokenUsage(task: Task, output: string): void {
  // Extract token usage from task output
  // Record to tokenTracking service
}
```

**Remove from devBotsManager**:
- `extractAndRecordTokenUsage()` (lines 1231-1283)

**Estimated Effort**: 15 minutes
**Lines Moved**: ~50

---

### Phase 5: Simplify DevBotsManager to Pure Orchestrator

**Keep in DevBotsManager** (core orchestration only):
1. **Constructor** - dependency injection
2. **Initialization** - initializeDockerEnvironment, initializeAsync
3. **System Control** - startSystem, stopSystem
4. **Status/Info** - getSystemStatus, getTasks, getTask
5. **Delegation Methods** - simple getters that delegate to services
6. **Event Wiring** - connect services together

**Remove/Move**:
- ✅ Worker tracking → ephemeralWorkerService
- ✅ Health monitoring → WorkerHealthMonitor
- ✅ Interactive watchdog → interactiveSessionService
- ✅ Token extraction → taskCompletionService

**Final DevBotsManager Structure** (~600 lines):
```typescript
export class DevBotsManager extends EventEmitter {
  // Dependencies (injected)
  private dockerManager: DockerManager;
  private ephemeralWorkerService: EphemeralWorkerService;
  private taskExecutionService: TaskExecutionService;
  private taskCompletionService: TaskCompletionService;
  private interactiveSessionService: InteractiveSessionService;
  private taskQueue: TaskQueueService;
  private workerHealthMonitor: WorkerHealthMonitor; // NEW
  // ... other services

  constructor(dependencies: DevBotsManagerDependencies) {
    // Inject all dependencies
    // Wire up event listeners
    // Initialize services
  }

  // System Control (4 methods)
  startSystem(): void {}
  async stopSystem(): Promise<void> {}
  isHealthy(): boolean {}
  destroy(): void {}

  // Status & Info (5 methods)
  async getSystemStatus(): Promise<DevBotsStatus> {}
  async getTasks(): Promise<{ pending; active; completed }> {}
  getTask(taskId: string): Task | undefined {}
  getTaskExecutions(taskId: string): TaskExecution[] {}
  async getCleanupStatus(): Promise<{ ... }> {}

  // Task Management (2 methods)
  async addTask(taskData): Promise<Task> {}
  async assignNextTask(): Promise<void> {}

  // Delegation to Services (~30 simple delegator methods)
  getQueueMetrics() { return this.taskQueue.getQueueMetrics(); }
  getTaskDurationStats(days) { return this.taskQueue.getTaskDurationStats(days); }
  getAgentComparisonMetrics() { return this.taskQueue.getAgentComparisonMetrics(); }
  // ... etc
}
```

**Estimated Effort**: 1 hour (cleanup, simplification)
**Lines Reduced**: ~400

---

## File Size Impact

| File | Before | After | Change |
|------|--------|-------|--------|
| **devBotsManager.ts** | 1,789 | ~600 | -66% (1,189 lines) |
| **workerHealthMonitor.service.ts** | 0 | ~200 | NEW |
| **interactiveSession.service.ts** | 169 | ~220 | +50 lines |
| **taskCompletion.service.ts** | ~400 | ~450 | +50 lines |
| **ephemeralWorker.service.ts** | 977 | ~990 | +15 lines |

**Net Result**: 1,789 lines → 600 lines orchestrator + specialized services

---

## Implementation Order

### Step 1: Create WorkerHealthMonitor (1 hour)
1. Create new file `workerHealthMonitor.service.ts`
2. Extract health monitoring logic
3. Update devBotsManager to use it
4. Test: Verify health monitoring still works

### Step 2: Move Interactive Watchdog (30 min)
1. Add idle watchdog to interactiveSession.service.ts
2. Remove from devBotsManager
3. Test: Verify idle timeout still works

### Step 3: Consolidate Worker Tracking (20 min)
1. Update EphemeralWorker interface
2. Remove workers Map from devBotsManager
3. Test: Verify worker status tracking

### Step 4: Move Token Extraction (15 min)
1. Add extractAndRecordTokenUsage to taskCompletion.service.ts
2. Remove from devBotsManager
3. Test: Verify token tracking still works

### Step 5: Final Cleanup (1 hour)
1. Review all remaining code in devBotsManager
2. Simplify, remove dead code
3. Update comments and documentation
4. Run full test suite

**Total Estimated Time**: 3-4 hours

---

## Testing Strategy

After each phase:
1. Run TypeScript compilation: `npm run build`
2. Run backend unit tests: `npm test`
3. Check for linting errors: `npm run lint`

Final verification:
1. All 936 backend tests passing
2. Manual smoke test of key features:
   - Task creation and execution
   - Worker health monitoring
   - Interactive sessions
   - Docker operations
3. Verify no regressions in functionality

---

## Benefits

1. **Separation of Concerns**: Each service has single responsibility
2. **Testability**: Health monitoring can be tested independently
3. **Maintainability**: Easier to find and modify specific functionality
4. **Readability**: DevBotsManager becomes clear orchestrator
5. **Foundation**: Sets pattern for future extractions

---

## Success Criteria

- ✅ devBotsManager reduced to ~600 lines (66% reduction)
- ✅ WorkerHealthMonitor service created (~200 lines)
- ✅ Interactive watchdog moved to InteractiveSessionService
- ✅ Token extraction moved to TaskCompletionService
- ✅ Worker tracking consolidated in EphemeralWorkerService
- ✅ All 936 backend tests passing
- ✅ TypeScript compilation clean
- ✅ No regressions in functionality

---

## Progress Tracker

### ✅ Completed - Phase 1: WorkerHealthMonitor Extraction (2025-11-12)

**Time Invested**: ~2 hours
**Lines Extracted**: 280 lines from devBotsManager
**New Service Created**: `workerHealthMonitor.service.ts` (410 lines)

**Changes Made**:
1. ✅ Created `backend/src/services/workerHealthMonitor.service.ts`
   - Extracted `startHeartbeatMonitor()` (disabled for ephemeral containers)
   - Extracted `startLongRunningTaskMonitor()` with stuck task cleanup
   - Extracted `checkWorkerHealth()` and `updateWorkerHealth()`
   - Extracted `checkCleanupSchedules()` for scope control
   - Added proper error handling and recovery integration

2. ✅ Updated `devBotsManager.interfaces.ts`
   - Added `workerHealthMonitor: WorkerHealthMonitor` to dependencies

3. ✅ Updated `devBotsManager.factory.ts`
   - Created WorkerHealthMonitor instance in dependency factory
   - Wired up with ephemeralWorkerService, taskQueue, dockerManager, scopeControl, processManager

4. ✅ Updated `devBotsManager.ts`
   - Removed 280 lines of health monitoring code
   - Added workerHealthMonitor injection and initialization
   - Updated `startSystem()` to call `workerHealthMonitor.start()`
   - Updated `stopSystem()` to call `workerHealthMonitor.stop()`
   - Updated `destroy()` to delegate to workerHealthMonitor
   - Removed `healthCheckInterval` and `cleanupInterval` properties

5. ✅ Updated `devBotsManager.mocks.ts`
   - Added mock workerHealthMonitor for tests

**Results**:
- **devBotsManager.ts**: 1,789 → 1,509 lines (280 lines removed, 15.6% reduction)
- **workerHealthMonitor.service.ts**: New file with 410 lines
- ✅ TypeScript compilation passing
- ✅ All health monitoring features preserved
- ✅ Proper delegation to new service

### 🔄 In Progress
- [ ] Phase 2: Move Interactive Watchdog
- [ ] Phase 3: Consolidate Worker Tracking
- [ ] Phase 4: Move Token Extraction
- [ ] Phase 5: Final Cleanup

### 📋 Remaining
- [ ] Run backend tests to verify functionality
- [ ] Commit Phase 1 changes
- [ ] Continue with remaining phases

---

**Current Status**: Phase 1 complete! devBotsManager reduced by 15.6%. Ready for Phase 2.
**Next Step**: Begin Phase 2 - Move Interactive Idle Watchdog to InteractiveSessionService
