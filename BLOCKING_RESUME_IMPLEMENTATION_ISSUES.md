# Task Blocking & Resume Implementation - Comprehensive Investigation Report

## Executive Summary

A thorough investigation of the task blocking and resume implementation revealed **7 critical issues** that prevent the code from compiling and functioning correctly, plus **3 design gaps** that deviate from the intended architecture.

**Current State**: Code does **NOT compile** due to TypeScript errors. Implementation is incomplete and has architectural gaps.

---

## Critical Issues (Blocking Compilation)

### 1. **Missing TaskQueueService Dependency in EphemeralWorkerService** ⚠️ CRITICAL

**Location**: `backend/src/services/ephemeralWorker.service.ts:994, 1005`

**Problem**: Code attempts to call `this.taskQueue.updatePhasePayload()` but EphemeralWorkerService does NOT have a `taskQueue` property.

**TypeScript Error**:
```
Property 'taskQueue' does not exist on type 'EphemeralWorkerService'
```

**Root Cause**: The constructor of EphemeralWorkerService doesn't accept a TaskQueueService parameter, and no taskQueue property is declared in the class.

**Code**:
```typescript
// Lines 994-1001 - BROKEN
this.taskQueue.updatePhasePayload(task.id, {
  recoveryAttempts: task.phase_attempts,
  lastExecutionAt: Date.now(),
  // ...
});

// Lines 1005-1012 - BROKEN
this.taskQueue.updatePhasePayload(task.id, {
  gitBranch: gitBranch || undefined,
  lastExecutionAt: Date.now(),
  // ...
});
```

**Impact**: Phase payload cannot be saved, completely breaking context preservation across blocks/resumes.

**Fix Required**:
1. Add `private readonly taskQueue: TaskQueueService` property to class
2. Add `taskQueue: TaskQueueService` parameter to constructor
3. Update all instantiation sites to pass TaskQueueService instance

---

### 2. **Syntax Error in ephemeralWorker.service.ts** ⚠️ CRITICAL

**Location**: `backend/src/services/ephemeralWorker.service.ts:868`

**Problem**: Comment has incorrect syntax - single slash instead of double slash.

**Code**:
```typescript
// Line 868 - BROKEN
/ Step 2: Run phase validation
```

**Should be**:
```typescript
// Step 2: Run phase validation
```

**Impact**: JavaScript syntax error, code won't parse/compile.

---

### 3. **Missing 'blocked' in DevBotsStatus Type** ⚠️ CRITICAL

**Location**: `backend/src/services/statusAggregation.service.ts:93`

**Problem**: Implementation returns `blocked` tasks but TypeScript interface doesn't include it.

**TypeScript Error**:
```
Object literal may only specify known properties, and 'blocked' does not exist in type '{ pending: Task[]; active: Task[]; completed: Task[]; failed: Task[]; }'
```

**Current Type** (lines 25-30):
```typescript
export interface DevBotsStatus {
  // ...
  tasks: {
    pending: Task[];
    active: Task[];
    completed: Task[];
    failed: Task[];
  };
}
```

**Implementation** (lines 90-96):
```typescript
tasks: {
  pending: this.taskQueue.getTasksByStatus('pending'),
  active: this.taskQueue.getTasksByStatus('running'),
  blocked: this.taskQueue.getTasksByStatus('blocked'), // ❌ Type error!
  completed: this.taskQueue.getTasksByStatus('completed').slice(-50),
  failed: this.taskQueue.getTasksByStatus('failed')
}
```

**Fix Required**: Add `blocked: Task[]` to DevBotsStatus.tasks type

---

### 4. **Incorrect sendError() Call in tasks.routes.ts** ⚠️ CRITICAL

**Location**: `backend/src/routes/dev-bots/tasks.routes.ts:940-943`

**Problem**: Passing `taskId` as top-level option instead of nesting in `details`.

**TypeScript Error**:
```
Object literal may only specify known properties, and 'taskId' does not exist in type '{ message?: string | undefined; code?: string | undefined; details?: Record<string, unknown> | unknown[] | undefined; }'
```

**Current Code** (BROKEN):
```typescript
sendError(res, 'Failed to resume task', 500, {
  message: error instanceof Error ? error.message : String(error),
  taskId: req.params.taskId  // ❌ Wrong location
});
```

**Should be**:
```typescript
sendError(res, 'Failed to resume task', 500, {
  message: error instanceof Error ? error.message : String(error),
  details: { taskId: req.params.taskId }  // ✅ Nested in details
});
```

---

## Design Gaps (Code Compiles but Design Intent Not Met)

### 5. **Missing Database Columns for Resume Tracking** ⚠️ HIGH PRIORITY

**Problem**: The `tasks` table does NOT have `resumed_by` and `resumed_at` columns.

**Evidence**:
- Grep search for "resumed_by|resumed_at" in migrations found **no results**
- Migration 012 only adds: `blocked_reason`, `blocked_at`, `blocked_by`

**Impact**:
- E2E tests (lines 2056-2064 in `taskBlockingResume.e2e.test.ts`) **WILL FAIL**:
  ```typescript
  expect(task.resumed_by).toBe('test-user');  // ❌ Column doesn't exist!
  expect(task.resumed_at).toBeTruthy();       // ❌ Column doesn't exist!
  ```
- No audit trail for who resumed a task or when
- Breaks user story: "Resume task via UI with audit trail"

**Fix Required**: Create new migration to add columns:
```sql
ALTER TABLE tasks ADD COLUMN resumed_by TEXT;
ALTER TABLE tasks ADD COLUMN resumed_at INTEGER;
```

---

### 6. **resumeTask() Doesn't Reset phase_attempts** ⚠️ HIGH PRIORITY

**Location**: `backend/src/services/taskQueue.sqlite.ts:2024-2067`

**Problem**: The `resumeTask()` method does NOT reset `phase_attempts` to 1.

**Design Intent** (from user story and e2e tests):
> When resuming a blocked task, phase_attempts should reset to 1 to give the task a fresh start.

**Current Implementation** (lines 2037-2046):
```typescript
const stmt = this.db.prepare(`
  UPDATE tasks
  SET status = 'pending',
      phase_status = 'ready',
      blocked_reason = NULL,
      blocked_at = NULL,
      blocked_by = NULL,
      notes = COALESCE(notes || '\n', '') || ?
  WHERE id = ?
`);
```

**Missing**:
```sql
phase_attempts = 1,     -- ❌ NOT RESETTING!
resumed_by = ?,         -- ❌ NOT SETTING! (column doesn't exist anyway)
resumed_at = ?          -- ❌ NOT SETTING! (column doesn't exist anyway)
```

**Impact**:
- E2E test at line 2109 of `taskBlockingResume.e2e.test.ts` **WILL FAIL**:
  ```typescript
  expect(task.phase_attempts).toBe(1);  // ❌ Will still be 4!
  ```
- Task will resume with high attempt count, potentially hitting max attempts immediately

---

### 7. **taskExecution.service Doesn't Set chain_status on Recovery Failure** ⚠️ MEDIUM PRIORITY

**Location**: `backend/src/services/taskExecution.service.ts:686-694`

**Problem**: When recovery fails (chain_blocked), the task is blocked but `chain_status` is NOT set to 'blocked'.

**Current Code**:
```typescript
} else if (recovery.category === 'chain_blocked') {
  // Block task immediately - requires human intervention
  this.taskQueue.updateTask(nextTask.id, {
    status: 'blocked',
    phase_status: 'blocked',
    blocked_reason: recovery.diagnosis || 'Recovery failed - manual intervention required',
    blocked_at: Date.now(),
    blocked_by: 'recovery_agent'
    // ❌ chain_status NOT SET!
  });
```

**Compare to**: `phaseOrchestrator.service.ts:338-344` which DOES set it:
```typescript
this.db.prepare(`
  UPDATE tasks
  SET status = 'blocked',
      phase_status = 'blocked',
      blocked_reason = ?,
      blocked_at = ?,
      chain_status = 'blocked'  // ✅ Correctly sets chain_status
  WHERE id = ?
`).run(/*...*/);
```

**Impact**:
- Chain status inconsistency - some blocks set it, others don't
- Chain tracking logic may not detect blocked chains from recovery failures
- E2E test at line 105 of `task-blocking-resume.spec.ts` **MAY FAIL**:
  ```typescript
  expect(taskStatus.chain_status).toBe('blocked');
  ```

**Fix Required**: Add `chain_status: 'blocked'` to the updateTask call

---

## Additional Findings

### 8. **Inconsistent api-contracts Type Definitions** ⚠️ LOW PRIORITY

**Location**: `shared/api-contracts/index.ts` vs `shared/api-contracts/index.d.ts`

**Problem**: Source and declaration files have different types for `ApiError.details`:

**index.ts (source)**:
```typescript
details?: Record<string, unknown> | unknown[];
```

**index.d.ts (declarations)**:
```typescript
details?: Record<string, unknown>;  // Missing | unknown[]
```

**Impact**: Type checking inconsistencies depending on which file TypeScript reads.

**Fix**: Rebuild api-contracts package to regenerate index.d.ts

---

### 9. **E2E Tests Reference Non-Existent Fields** ⚠️ TEST FAILURE

**Location**: Multiple e2e test files

**Problem**: Tests check for fields that don't exist in database or aren't set by code:

1. **taskBlockingResume.e2e.test.ts:2056-2064**
   ```typescript
   expect(task.resumed_by).toBe('e2e-test-user');  // ❌ Column doesn't exist
   expect(task.resumed_at).toBeTruthy();           // ❌ Column doesn't exist
   ```

2. **task-blocking-resume.spec.ts:195, 238, 247**
   ```typescript
   expect(taskStatus.resumed_by).toBe('e2e-test-user');
   expect(taskStatus.resumed_at).toBeTruthy();
   ```

**Impact**: All resume-related e2e tests will FAIL.

---

### 10. **Missing chain_status in Some Blocking Paths** ⚠️ DESIGN INCONSISTENCY

**Locations**:
- ✅ `phaseOrchestrator.checkAttemptLimits()` - SETS chain_status
- ❌ `taskExecution.service (recovery)` - DOESN'T SET chain_status
- ❓ `taskQueue.detectStalledWorkers()` - Need to verify
- ❓ `taskQueue.recoverOrphanedTasks()` - Need to verify

**Design Intent**: ALL blocking paths should set `chain_status = 'blocked'` for consistency.

---

## Design Intent vs Implementation Analysis

### ✅ What Works Correctly

1. **Phase payload structure** - Well-defined PhasePayload interface with appropriate fields
2. **Git branch extraction logic** - Properly extracts branch NAME (not content) via Docker exec
3. **Phase orchestrator clearing payload** - Correctly clears phase_payload on phase advancement
4. **Blocking on max attempts** - checkAttemptLimits() properly blocks tasks
5. **Task status enum** - 'blocked' properly added to TaskStatus type
6. **Frontend UI** - Blocked bucket and status display implemented

### ❌ What's Broken

1. **Phase payload CANNOT be saved** - Missing taskQueue dependency
2. **Syntax error prevents compilation** - Comment syntax error
3. **Type errors prevent compilation** - DevBotsStatus and sendError issues
4. **No resume audit trail** - Missing resumed_by/resumed_at columns
5. **Phase attempts don't reset** - resumeTask() incomplete
6. **Inconsistent chain_status** - Not set in all blocking paths

### 🟡 What's Incomplete

1. **E2E tests will fail** - Depend on non-existent fields
2. **Chain tracking inconsistency** - Some paths don't set chain_status
3. **Worker failure blocking** - Need to verify stalled workers and orphaned tasks set chain_status

---

## Recommendations

### Immediate Fixes (Required for Compilation)

1. ✅ Fix syntax error in ephemeralWorker.service.ts line 868
2. ✅ Add taskQueue dependency to EphemeralWorkerService
3. ✅ Add 'blocked' to DevBotsStatus.tasks type
4. ✅ Fix sendError() call in tasks.routes.ts

### High Priority Fixes (Required for Correct Functionality)

5. ✅ Create migration for resumed_by and resumed_at columns
6. ✅ Update resumeTask() to:
   - Reset phase_attempts to 1
   - Set resumed_by and resumed_at
7. ✅ Add chain_status to recovery failure blocking path
8. ✅ Update E2E tests to match actual implementation

### Medium Priority Improvements

9. ⚠️ Verify all blocking paths set chain_status consistently
10. ⚠️ Rebuild api-contracts to fix type definition inconsistency

---

## Testing Strategy

Before considering this implementation complete:

1. **Fix all compilation errors** - TypeScript must compile cleanly
2. **Run unit tests** - Ensure backend services work correctly
3. **Run backend e2e tests** - Verify taskBlockingResume.e2e.test.ts
4. **Run Playwright e2e tests** - Verify task-blocking-resume.spec.ts
5. **Manual testing** - Actually block and resume a task end-to-end

---

## Conclusion

The implementation has **good architectural design** (PhasePayload structure, git branch tracking concept) but suffers from **incomplete execution**. The code was partially written without:

1. Adding required database schema changes
2. Injecting necessary dependencies
3. Updating all type definitions
4. Testing compilation

**Estimated Effort to Fix**: 2-3 hours

**Risk Level**: HIGH - Code doesn't compile, tests will fail, core functionality broken

**Next Steps**: Address critical issues 1-4 immediately, then high priority fixes 5-8.
