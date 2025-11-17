# Deprecated Code Removal - Phase System Migration

**Date:** 2025-11-17  
**Status:** In Progress - Core Removals Complete  
**Branch:** bot/worktree

## Summary

Comprehensive removal of ALL deprecated code related to the old task processing system. The 7-phase system is now THE ONLY way tasks are processed - no legacy systems remain.

## Deleted Files

### Services
- ✅ `backend/src/services/failureRecovery.ts` - Entire repair bot system deleted

## Modified Files - Interfaces & Types

### Task Interface (`backend/src/services/taskQueue.sqlite.ts`)
**Removed Fields:**
- ✅ `is_repair_bot` - Repair bot system deleted
- ✅ `original_task_id` - Child task system deleted  
- ✅ `repair_stage` - Repair stages deleted
- ✅ `followup_for_pr` - Followup task system deleted
- ✅ `followup_tasks` - Child task tracking deleted
- ✅ `queue_stage` - Staged queue system deleted (phase system only)

**Retained Fields:**
- ✅ `chain_id`, `chain_status`, `chain_depth`, `blocked_*` - Chain tracking KEPT (used by phase system)
- ✅ `phase_index`, `phase_name`, `phase_status`, `phase_attempts`, `phase_payload` - Phase system (THE ONLY system)

### Schema (`backend/src/types/taskSchema.ts`)
**Removed:**
- ✅ `is_repair_bot` from TaskSchema
- ✅ `original_task_id` from TaskSchema  
- ✅ `repair_stage` enum from TaskSchema
- ✅ All related fields from TaskCreateSchema

## Modified Files - Database

### TaskQueueService (`backend/src/services/taskQueue.sqlite.ts`)
**Removed:**
- ✅ Migration 3: Repair bot columns (is_repair_bot, original_task_id, followup_for_pr, followup_tasks)
- ✅ `queue_stage` column from Migration 012
- ✅ `queue_stage` index creation
- ✅ `hasRecoveryAttempt()` method - No longer needed
- ✅ Child task logic from `createTask()` - All tasks start their own chain
- ✅ `queue_stage` determination logic
- ✅ `original_task_id` inheritance logic

**Updated:**
- ✅ `createTask()` now always sets `chain_id` to own task ID (no parent task logic)
- ✅ Schema creation updated to remove deprecated columns
- ✅ INSERT statement simplified (removed queue_stage parameter)

### ChainTrackerService (`backend/src/services/chainTracker.service.ts`)
**Removed:**
- ✅ `implementation` queue depth tracking
- ✅ `followup` queue depth tracking  
- ✅ `queue_stage` based queries

**Updated:**
- ✅ `getQueueDepths()` now returns only `phaseDistribution`
- ✅ `ChainStats` interface updated (removed implementationQueueDepth, followupQueueDepth)

## Modified Files - Services

### DevBotsManager (`backend/src/services/devBotsManager.ts`)
**Removed:**
- ✅ `SimpleFailureRecovery` import
- ✅ `recovery` private field
- ✅ Recovery initialization in constructor
- ✅ Recovery injection into SystemInitializationService
- ✅ Recovery injection into WorkerHealthMonitor

### EphemeralWorkerService (`backend/src/services/ephemeralWorker.service.ts`)
**Removed:**
- ✅ Repair bot branch determination logic
- ✅ `task.is_repair_bot` conditionals
- ✅ `task.followup_for_pr` handling
- ✅ `task.original_task_id` (parentTaskId) references

**Simplified:**
- ✅ All tasks now use `staging` branch (no special repair bot branches)

### DevBotsManager Factory (`backend/src/services/devBotsManager.factory.ts`)
**Removed:**
- ✅ `SimpleFailureRecovery` import
- ✅ Recovery placeholder creation
- ✅ Recovery parameter to WorkerHealthMonitor
- ✅ Recovery parameter to SystemInitializationService

### DevBotsManager Interfaces (`backend/src/services/devBotsManager.interfaces.ts`)  
**Removed:**
- ✅ `SimpleFailureRecovery` import
- ✅ `recovery` field from DevBotsManagerDependencies

### DevBotsManager Mocks (`backend/src/services/devBotsManager.mocks.ts`)
**Removed:**
- ✅ `SimpleFailureRecovery` import  
- ✅ `recovery` mock from createMockDependencies()

### SystemInitializationService (`backend/src/services/systemInitialization.service.ts`)
**Removed:**
- ✅ `SimpleFailureRecovery` import
- ✅ `recovery` field from InitializationComponents interface

## Remaining Work (TO BE COMPLETED)

### Services Still Referencing Recovery
These files need updates but are less critical:

1. **`backend/src/services/taskExecution.service.ts`**
   - Remove `SimpleFailureRecovery` import
   - Remove `recovery` private field
   - Remove `setRecovery()` method
   - Remove recovery-related logic

2. **`backend/src/services/workerHealthMonitor.service.ts`**
   - Remove `SimpleFailureRecovery` import
   - Remove `recovery` parameter from constructor
   - Remove recovery-related health check logic

3. **`backend/src/services/interactiveSessionOrchestrator.ts`**
   - Remove `original_task_id: null` from task creation

4. **`backend/src/services/qualityImprovementTaskGenerator.ts`**
   - Remove `original_task_id` from task generation

5. **`backend/src/services/taskCreation.service.ts`**
   - Remove `original_task_id` from metadata handling

## Database Migration Notes

**Migration 026** (phase system) already handles column removal:
- Removes `queue_stage` column  
- Removes `original_task_id` column
- Adds phase system columns

**No new migration needed** - existing migration 026 is correct.

## Testing Impact

### Tests to Update
- ✅ `backend/src/__tests__/testDb.ts` - Remove queue_stage column
- ✅ `backend/src/services/__tests__/chainTracker.test.ts` - Remove queue_stage from mocks
- ⏳ `backend/src/services/__tests__/stagedQueue.test.ts` - Update or remove (tests queue_stage)

### Tests Likely Broken
- Any test creating tasks with `is_repair_bot: true`
- Any test using `original_task_id`
- Any test checking `queue_stage`
- Any test mocking `SimpleFailureRecovery`

## Documentation Updates Needed

- Update migration README to reflect removed columns
- Update architecture docs to remove repair bot references
- Update task queue architecture to clarify phase system is only system

## Principles Applied

1. **No Backwards Compatibility** - Clean break, no feature flags
2. **Phase System is THE ONLY System** - No legacy alternatives
3. **Zero Tolerance for Technical Debt** - All deprecated code removed
4. **Thorough Removal** - Every reference, every comment, every field

## Next Steps

1. Fix remaining service references (taskExecution, workerHealthMonitor)
2. Run full type check and fix compilation errors
3. Update/remove affected tests
4. Run test suite  
5. Update documentation
6. Commit and create PR

---

**This removal ensures the codebase has ONE clear path for task processing: the 7-phase system.**
