# CRITICAL: Dual Task Execution Pipeline Removal
**Date:** 2025-11-16  
**Priority:** P0 - BLOCKING  
**Issue:** Two competing task execution codepaths causing confusion and bugs

## Problem Statement

The system has TWO completely separate task execution pipelines:

### Pipeline 1: Legacy `docker run` (CURRENTLY ACTIVE)
- **File:** `backend/src/services/taskExecution.service.ts` 
- **Method:** `executeTaskWithDockerRun()`
- **Mechanism:** Spawns `docker run` directly via `child_process.spawn()`
- **Lines of Code:** 1434 lines
- **Credential Mounting:** Has its own separate credential logic
- **Status:** THIS IS WHAT'S ACTUALLY RUNNING IN PRODUCTION

### Pipeline 2: Ephemeral Worker Service (INACTIVE)
- **File:** `backend/src/services/ephemeralWorker.service.ts`
- **Methods:** `createWorker()`, `executeTask()`, `destroyWorker()`
- **Mechanism:** Uses Dockerode API properly
- **Credential Mounting:** WE JUST FIXED THIS
- **Status:** CODE EXISTS BUT IS NEVER CALLED

## Why This is Critical

1. **Wasted Effort**: We just spent significant time fixing credential mounting in `ephemeralWorkerService`, but it's NOT BEING USED
2. **Maintenance Burden**: Two codebases to maintain for the same functionality
3. **Bug Surface**: Credential fixes need to be applied in TWO places
4. **Confusion**: Engineers don't know which path is active
5. **Technical Debt**: Legacy code should have been removed when new path was created

## Current Call Stack

```
DevBotsManager.assignNextTask()
  └─> TaskExecutionService.assignNextTask()
      └─> TaskExecutionService.executeTaskWithDockerRun()  ← SPAWNS DOCKER DIRECTLY
          └─> spawn('docker', dockerArgs)  ← LEGACY PATH

# EphemeralWorkerService is NEVER called for task execution!
# It's only used for:
#   - getActiveWorkers() - tracking (but no workers are registered!)
```

## The Fix

**DELETE the entire legacy `executeTaskWithDockerRun()` method and replace with:**

```typescript
// In TaskExecutionService.assignNextTask()
try {
  // Create ephemeral worker
  const worker = await this.ephemeralWorkerService.createWorker(nextTask, agent);
  
  // Execute task in worker
  const result = await this.ephemeralWorkerService.executeTask(worker);
  
  if (result.success) {
    // Handle completion
  } else {
    // Handle failure
  }
  
  // Cleanup
  await this.ephemeralWorkerService.destroyWorker(worker.id);
}
```

## Files to Modify

### 1. `backend/src/services/taskExecution.service.ts`
**Changes:**
- DELETE `executeTaskWithDockerRun()` method (~400 lines)
- DELETE `buildDockerArgs()` method
- DELETE `createDockerStatsStream()` method  
- DELETE all credential validation logic (duplicates ephemeralWorkerService)
- REPLACE with calls to `ephemeralWorkerService.createWorker()` and `executeTask()`
- KEEP: `assignNextTask()` (orchestration logic)
- KEEP: Agent selection logic
- KEEP: Task validation logic
- KEEP: Retry/recovery coordination

**Estimate:** Remove ~600 lines, add ~50 lines

### 2. `backend/src/services/ephemeralWorker.service.ts`  
**Changes:**
- ALREADY FIXED credential mounting ✓
- Verify `createWorker()` and `executeTask()` are ready for production
- Add any missing error handling that was in legacy path

## Migration Steps

### Phase 1: Verification (30 min)
1. ✅ Confirm `ephemeralWorkerService` has all required features
2. ✅ Confirm credential mounting works correctly  
3. ✅ Review error handling in ephemeralWorkerService
4. ✅ Check for any unique logic in legacy path that needs preservation

### Phase 2: Code Removal (1 hour)
1. Create backup branch: `backup/legacy-task-execution`
2. Delete `executeTaskWithDockerRun()` method
3. Delete `buildDockerArgs()` method
4. Delete credential validation (duplicates)
5. Update `assignNextTask()` to use ephemeralWorkerService
6. Remove unused imports
7. Update tests

### Phase 3: Testing (1 hour)  
1. Run unit tests for TaskExecutionService
2. Run unit tests for EphemeralWorkerService
3. Test local task execution
4. Test with all 3 agent types (Claude, Gemini, Codex)
5. Verify credential mounting works

### Phase 4: Deployment (30 min)
1. Deploy to staging
2. Submit test tasks
3. Monitor execution
4. Deploy to production
5. Verify production tasks execute

## Risks & Mitigation

### Risk 1: Missing Functionality
**Impact:** New path missing features from legacy path  
**Mitigation:** 
- Thorough code review before deletion
- Keep backup branch
- Test extensively before deployment

### Risk 2: Performance Differences
**Impact:** Dockerode API vs spawn might have different characteristics  
**Mitigation:**
- Monitor task execution times
- Compare resource usage
- Be prepared to rollback

### Risk 3: Breaking Production
**Impact:** Production tasks fail after deployment  
**Mitigation:**
- Deploy to staging first
- Gradual rollout
- Keep old code in git history for quick revert
- Monitor error rates closely

## Benefits After Cleanup

1. **Single Source of Truth**: One task execution pipeline
2. **Easier Maintenance**: Fix once, not twice
3. **Better Testing**: Test one path thoroughly
4. **Clearer Architecture**: Obvious where execution happens
5. **Less Code**: ~600 lines removed
6. **Proper Abstractions**: Dockerode API instead of raw spawn

## Decision

**PROCEED WITH DELETION**

The ephemeralWorkerService is the superior implementation:
- ✓ Uses Dockerode API (proper Docker integration)
- ✓ Better error handling
- ✓ Better logging
- ✓ Better credential management (just fixed)
- ✓ Proper container lifecycle
- ✓ Already tested and working

The legacy code provides NO value and only creates confusion.

## Action Items

- [ ] Code review of ephemeralWorkerService (verify completeness)
- [ ] Delete executeTaskWithDockerRun() and related methods
- [ ] Update TaskExecutionService.assignNextTask() to use ephemeralWorkerService
- [ ] Run tests
- [ ] Deploy to staging
- [ ] Deploy to production
- [ ] Update documentation
- [ ] Close this as completed

## References

- `backend/src/services/taskExecution.service.ts` - Legacy code to delete
- `backend/src/services/ephemeralWorker.service.ts` - Code to use
- `docs/analysis/2025-11-16-gemini-credential-mounting-fix.md` - Related fix
