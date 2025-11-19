# Phase Payload Architecture - Proper Design

## Overview

This document outlines the correct architecture for implementing `phase_payload` context preservation without violating separation of concerns.

## Problem with Previous Implementation

The reverted implementation (commits 2201b1e, 68cf297, 4fe2893) had these architectural flaws:

1. **Violated Separation of Concerns** - EphemeralWorkerService directly called `taskQueue.updatePhasePayload()`
2. **Wrong Dependency Direction** - Container management service depending on data persistence service
3. **Untestable** - Required complex dependency injection changes across factory and all instantiation sites
4. **Coupling** - Tightly coupled EphemeralWorkerService to TaskQueue implementation details

## Correct Architecture

### Layer Responsibilities

```
┌─────────────────────────────────────┐
│   EphemeralWorkerService            │  CONTAINER OPERATIONS
│   - Create containers               │  - Extracts data from containers
│   - Execute tasks                   │  - Returns data to caller
│   - Extract artifacts               │  - NO database operations
│   - Extract git branch              │
└──────────────┬──────────────────────┘
               │ returns: { artifacts, gitBranch }
               ▼
┌─────────────────────────────────────┐
│   PhaseExecutionService             │  ORCHESTRATION
│   - Receives artifacts from worker  │  - Coordinates phase execution
│   - Validates artifacts             │  - Updates persistence layer
│   - Updates phase_payload           │  - Proper layer for business logic
│   - Records stage runs              │
└──────────────┬──────────────────────┘
               │ calls: taskQueue.updatePhasePayload()
               ▼
┌─────────────────────────────────────┐
│   TaskQueueService                  │  DATA PERSISTENCE
│   - Persists phase_payload          │  - Single source of truth
│   - Manages task state              │  - Database operations only
│   - Provides data accessors         │
└─────────────────────────────────────┘
```

### Data Flow

**Current (Reverted) - WRONG**:
```
EphemeralWorker → TaskQueue
  (skips orchestration layer, violates SRP)
```

**Correct Design**:
```
EphemeralWorker → PhaseExecutionService → TaskQueue
  (proper layering, each layer has single responsibility)
```

## Implementation Plan

### Step 1: Database Schema (Migration)

Create migration `030_add_resume_tracking.sql`:

```sql
-- Add columns for resume audit trail
ALTER TABLE tasks ADD COLUMN resumed_by TEXT;
ALTER TABLE tasks ADD COLUMN resumed_at INTEGER;
```

### Step 2: Enhance PhaseExecutionService

`phaseExecutionService` already exists and has the right responsibilities. Enhance it to:

1. Accept git branch from `ephemeralWorker.executeTask()` return value
2. Update `phase_payload` after artifact extraction
3. Clear `phase_payload` when advancing phases (coordinate with PhaseOrchestrator)

**New Interface**:
```typescript
interface TaskExecutionContext {
  artifacts: ArtifactExtractionResult;
  gitBranch?: string;
  validation: ValidationResult;
}
```

### Step 3: Update EphemeralWorkerService

**Current** (lines 805-866):
```typescript
// Step 1: Extract artifacts
const artifacts = await this.artifactExtractor.extractArtifacts(/*...*/);

// Step 1.5: Extract git branch (REVERTED - this was broken)
let gitBranch: string | undefined;
// ... git extraction logic ...

// (BROKEN: tried to call this.taskQueue.updatePhasePayload())
```

**Corrected**:
```typescript
// Step 1: Extract artifacts
const artifacts = await this.artifactExtractor.extractArtifacts(/*...*/);

// Step 1.5: Extract git branch
let gitBranch: string | undefined;
try {
  gitBranch = await this.extractGitBranch(containerId);
} catch (error) {
  logger.warn({
    category: 'phase',
    action: 'git_branch_extraction_failed',
    message: `Failed to extract git branch: ${error}`,
    details: { taskId: task.id, containerId }
  });
}

// Step 2: Run phase validation
const validation = await validator.validate(artifacts, task);

// Return context to caller (don't persist here!)
return {
  artifacts,
  gitBranch,
  validation,
  exitCode: executionResult.exitCode
};
```

**Add helper method** to Ephemeral Worker Service:
```typescript
private async extractGitBranch(containerId: string): Promise<string | undefined> {
  const Docker = (await import('dockerode')).default;
  const docker = new Docker();
  const container = docker.getContainer(containerId);

  const branchExec = await container.exec({
    Cmd: ['git', 'branch', '--show-current'],
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: '/workspace'
  });

  const branchStream = await branchExec.start({ hijack: true, stdin: false });

  let branchOutput = '';
  await new Promise((resolve) => {
    branchStream.on('data', (chunk: Buffer) => {
      branchOutput += chunk.toString();
    });
    branchStream.on('end', () => resolve(branchOutput));
  });

  const gitBranch = branchOutput.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
  return gitBranch || undefined;
}
```

### Step 4: Update PhaseExecutionService

**Location**: `backend/src/services/phaseExecution.service.ts`

Currently this service orchestrates phase execution. Enhance it to persist context:

```typescript
// After line 83 (validation complete)
// Add phase payload persistence

// Save execution context to phase_payload
this.taskQueue.updatePhasePayload(task.id, {
  gitBranch: executionContext.gitBranch,
  lastExecutionAt: Date.now(),
  artifacts: {
    validationPassed: validation.passed,
    validationErrors: validation.errors,
    phaseIndex: task.phase_index,
    phaseName: task.phase_name
  }
});
```

### Step 5: Complete resumeTask() Implementation

**Location**: `backend/src/services/taskQueue.sqlite.ts:2024-2067`

**Current (INCOMPLETE)**:
```typescript
UPDATE tasks
SET status = 'pending',
    phase_status = 'ready',
    blocked_reason = NULL,
    blocked_at = NULL,
    blocked_by = NULL,
    notes = COALESCE(notes || '\n', '') || ?
WHERE id = ?
```

**Corrected (COMPLETE)**:
```typescript
UPDATE tasks
SET status = 'pending',
    phase_status = 'ready',
    phase_attempts = 1,              -- RESET attempts
    blocked_reason = NULL,
    blocked_at = NULL,
    blocked_by = NULL,
    resumed_by = ?,                  -- NEW: audit trail
    resumed_at = ?,                  -- NEW: audit trail
    notes = COALESCE(notes || '\n', '') || ?
WHERE id = ?
```

### Step 6: Fix chain_status Consistency

**Location**: `backend/src/services/taskExecution.service.ts:688`

**Current (MISSING chain_status)**:
```typescript
this.taskQueue.updateTask(nextTask.id, {
  status: 'blocked',
  phase_status: 'blocked',
  blocked_reason: recovery.diagnosis || 'Recovery failed - manual intervention required',
  blocked_at: Date.now(),
  blocked_by: 'recovery_agent'
});
```

**Corrected**:
```typescript
this.taskQueue.updateTask(nextTask.id, {
  status: 'blocked',
  phase_status: 'blocked',
  chain_status: 'blocked',           -- ADDED for consistency
  blocked_reason: recovery.diagnosis || 'Recovery failed - manual intervention required',
  blocked_at: Date.now(),
  blocked_by: 'recovery_agent'
});
```

## Testing Strategy

### Unit Tests

1. **EphemeralWorkerService.extractGitBranch()**
   - Test successful extraction
   - Test extraction failure (graceful degradation)
   - Test Docker command execution

2. **TaskQueueService.resumeTask()**
   - Test phase_attempts reset to 1
   - Test resumed_by and resumed_at set correctly
   - Test blocked metadata cleared
   - Test error on non-blocked task

3. **PhaseExecutionService** (updated)
   - Test phase_payload updated after execution
   - Test gitBranch included in payload
   - Test payload cleared on phase advancement

### Integration Tests

1. **End-to-End Blocking Flow**
   - Task created → executed → fails → recovery fails → blocked
   - Verify phase_payload preserved
   - Verify gitBranch captured

2. **End-to-End Resume Flow**
   - Blocked task → resume → phase_attempts reset → re-execution
   - Verify phase_payload maintained
   - Verify resumed_by/resumed_at audit trail

## Architectural Benefits

✅ **Separation of Concerns** - Each layer has single responsibility
✅ **Testability** - No complex dependency injection needed
✅ **Maintainability** - Clear data flow, easy to understand
✅ **Extensibility** - Easy to add more context fields
✅ **Observability** - Proper audit trail with resumed_by/resumed_at
✅ **Type Safety** - Proper interfaces at each layer

## Migration Path

1. ✅ Revert broken commits (DONE)
2. ✅ Fix TypeScript compilation (DONE)
3. ⏳ Create migration for resumed_by/resumed_at
4. ⏳ Add extractGitBranch() helper to EphemeralWorkerService
5. ⏳ Update PhaseExecutionService to persist phase_payload
6. ⏳ Complete resumeTask() implementation
7. ⏳ Fix chain_status consistency
8. ⏳ Write unit tests for each component
9. ⏳ Write integration tests for full flow
10. ⏳ Manual end-to-end testing

## Conclusion

This architecture maintains clean separation of concerns:
- **Container layer** extracts data
- **Orchestration layer** persists data
- **Data layer** stores data

No shortcuts, no technical debt, clear and maintainable code.
