# Simplified Failure Recovery System

## Overview

The simplified failure recovery system automatically attempts to fix failed dev-bot tasks using a two-stage approach. This system leverages the existing task queue infrastructure, treating repair bots as regular tasks rather than special constructs.

## Architecture

### Two-Stage Recovery Process

When a task fails with a recoverable error pattern, the system creates two sequential repair tasks:

1. **Cleanup Task** (Stage 1): Fix the error only
   - Focus: Resolve the specific error that caused the failure
   - Constraints: Minimal changes (< 5 files, < 100 lines)
   - Priority: 100 (jumps to front of queue)

2. **Followup Task** (Stage 2): Complete the original goal
   - Focus: Achieve what the original task was trying to do
   - Trigger: Created automatically when cleanup completes successfully
   - Priority: 100 (high priority)

### Key Design Principles

- **Regular Tasks**: Repair bots are normal tasks with `metadata.isRepairBot = true`
- **Event-Driven**: No polling - followup created via task completion handler
- **Simple Locking**: `hasActiveRepair()` prevents duplicate repairs for same task
- **Concurrent Repairs**: Multiple repairs can run for different failed tasks
- **Serial Execution**: For same task, cleanup must complete before followup starts

## Implementation

### Core Components

**File**: `backend/src/services/failureRecovery.ts` (343 lines)

```typescript
class SimpleFailureRecovery {
  async attemptRecovery(context: FailureContext): Promise<{ recovered: boolean; cleanupTaskId?: string }>
  async createFollowupTask(cleanupTask: Task): Promise<{ task: Task } | null>
  private hasActiveRepair(taskId: string): Promise<boolean>
  private isRecoverable(failurePattern: FailurePattern): boolean
  private createCleanupTask(context: FailureContext)
  private buildCleanupPrompt(...)
  private buildFollowupPrompt(...)
}
```

### Integration Points

**devBotsManager.ts**:
- Line 836: Initialize recovery system
- Line 1911-1914: Hook for followup task creation on task completion
- Line 1978-1984: Attempt recovery when task fails

**Task Metadata Structure**:
```typescript
metadata: {
  isRepairBot?: boolean;                      // True if this is a repair task
  repairStage?: 'cleanup' | 'followup';       // Which stage of recovery
  originalTaskId?: string;                    // ID of failed task being repaired
  cleanupTaskId?: string;                     // ID of cleanup task (followup only)
  originalFailurePattern?: string;            // Error pattern that triggered recovery
  countsTowardsConcurrencyLimit?: boolean;    // Whether to count in queue limits
}
```

## Recovery Flow

```
Task Fails
    ↓
Check: hasActiveRepair(taskId)?
    ↓ No
Check: isRecoverable(failurePattern)?
    ↓ Yes
Create Cleanup Task
    ↓ (metadata.repairStage = 'cleanup')
Cleanup Executes & Completes
    ↓
Task Completion Handler Detects
    ↓ (metadata.repairStage === 'cleanup' && status === 'completed')
Create Followup Task
    ↓ (metadata.repairStage = 'followup')
Followup Executes
    ↓
Original Goal Achieved
```

## Recoverable Error Categories

The system currently attempts recovery for these error types:

- `cli_incompatibility`: Version mismatches, command not found
- `missing_resource`: Files, dependencies, configuration missing
- `syntax_error`: Code syntax issues
- `import_error`: Module import failures
- `config_error`: Configuration problems

To add new recoverable categories, update `isRecoverable()` in `failureRecovery.ts:153-163`.

## Configuration

**Environment Variables**:
```bash
ENABLE_AUTO_RECOVERY=true|false    # Enable/disable recovery system (default: false)
RECOVERY_DRY_RUN=true|false        # Dry run mode - log only (default: true)
```

**Config File** (`src/config.ts`):
```typescript
recovery: {
  enabled: process.env.ENABLE_AUTO_RECOVERY === 'true',
  dryRun: process.env.RECOVERY_DRY_RUN !== 'false'
}
```

## Safety Guarantees

1. **No Duplicate Repairs**: System checks for active repairs before creating new ones
2. **Minimal Changes**: Cleanup tasks are constrained to < 5 files, < 100 lines
3. **Protected Files**: Cannot modify package.json, .env, database files
4. **Fail-Safe Followup**: Only created if cleanup succeeds (status === 'completed')
5. **Dry Run Mode**: Test recovery logic without executing repairs

## Database Schema

### Tasks Table Fields

```sql
is_repair_bot INTEGER DEFAULT 0              -- 1 if repair task, 0 otherwise
original_task_id TEXT                        -- ID of original failed task
repair_stage TEXT                            -- 'cleanup' or 'followup'
  CHECK(repair_stage IS NULL OR repair_stage IN ('cleanup', 'followup'))
```

### Legacy Tables (Unused)

The following tables exist for backwards compatibility but are **NOT USED** by the simplified system:
- `recovery_attempts`: Complex state tracking (replaced by task metadata)
- `recovery_safety_checks`: Safety analysis (replaced by constraints in prompts)

These tables may be dropped in a future migration.

## Monitoring & Logging

All recovery actions are logged with `category: 'recovery'`:

```typescript
logger.info({
  category: 'recovery',
  action: 'cleanup_task_created',
  message: `Created cleanup task for failed task ${task.id}`,
  details: { originalTaskId, cleanupTaskId, failurePattern }
});
```

**Key Log Actions**:
- `repair_already_running`: Duplicate repair attempt blocked
- `failure_not_recoverable`: Error type not auto-recoverable
- `cleanup_task_created`: Stage 1 task created
- `followup_task_created`: Stage 2 task created
- `cleanup_failed_skipping_followup`: Cleanup failed, no followup
- `original_task_not_found`: Cannot create followup (data issue)

## Code Statistics

- **Total Implementation**: 343 lines (64% reduction from previous 950-line system)
- **Methods**: 7 (vs 30+ in complex orchestrator)
- **Dependencies**: Only DevBotsManager and logger
- **No Polling**: Event-driven architecture
- **No State Machine**: Simple metadata tracking

## Migration from Old System

The previous `FailureRecoveryOrchestrator` (950 lines) has been completely replaced. Changes:

**Removed**:
- Complex state machine with 4 stages
- Polling-based `waitForTaskCompletion` (5-second intervals)
- `SafetyAnalyzer` class (200+ lines)
- Separate recovery_attempts tracking
- Safety check records in database

**Kept**:
- Two-stage approach (cleanup + followup)
- Task metadata tracking
- Failure pattern detection
- Configuration flags

## Examples

### Cleanup Task Prompt
```markdown
# Cleanup Task: Fix Error Only

## What Went Wrong
Task "Implement user auth" failed with:
- Error: missing_dependency
- Category: missing_resource
- Exit Code: 1

Error Output:
Cannot find module 'passport'

## Your ONLY Job
Fix the error. Nothing else.

Suggested Fix: Install missing dependency

## Constraints
- Fix ONLY the error
- Do NOT try to complete the original task goal
- Keep changes minimal (< 5 files, < 100 lines)
- Do NOT modify: package.json, .env, database files
- Commit with: "fix: missing_dependency"

## Success = Error Fixed
The followup bot will complete the original goal.
```

### Followup Task Prompt
```markdown
# Followup Task: Complete Original Goal

## Original Task
Title: Implement user authentication
Description: Add passport.js authentication with local strategy

## What Happened
1. Original task failed
2. Cleanup bot fixed the error (see task cleanup-123)
3. Now you need to complete the original goal

## Your Job
Complete what the original task was trying to do.

The error is already fixed. Just focus on achieving the goal.

## Constraints
- Stay focused on the original goal
- Do NOT re-fix the error (already done)
- Keep changes minimal and on-scope
- Commit with: "feat: complete Implement user authentication"

## Success Criteria
- User authentication working with passport.js
- Local strategy implemented
- Login/logout endpoints functional
```

## Future Enhancements

Potential improvements to consider:

1. **Adaptive Recovery**: Learn from successful/failed recovery attempts
2. **Pattern Detection**: Identify recurring failure patterns for prevention
3. **Recovery Analytics**: Track success rates by error type and agent
4. **Multi-Step Cleanup**: Break complex fixes into multiple cleanup tasks
5. **Smart Rollback**: Auto-rollback if followup fails
6. **Recovery Budget**: Limit retry attempts per original task

## Troubleshooting

### Recovery Not Triggering

Check:
1. `ENABLE_AUTO_RECOVERY=true` in environment
2. `RECOVERY_DRY_RUN=false` to actually execute (not just log)
3. Error category is in `recoverableCategories` set
4. No active repair already running for the task

### Cleanup Task Created but Followup Not Created

Check:
1. Cleanup task status is 'completed' (not 'failed')
2. Original task still exists in database
3. Task completion handler is being called
4. Logs for `cleanup_failed_skipping_followup` or `original_task_not_found`

### Multiple Repairs Running for Same Task

This should not happen. If it does:
1. Check `hasActiveRepair()` implementation
2. Verify `getRepairBotsForTask()` is working correctly
3. Look for race conditions in task assignment

## Testing

To test the recovery system:

```bash
# Enable recovery
export ENABLE_AUTO_RECOVERY=true
export RECOVERY_DRY_RUN=false

# Create a task that will fail with a recoverable error
# Monitor logs for recovery actions
tail -f backend-server.log | grep "category.*recovery"
```

Look for log sequence:
1. `cleanup_task_created`
2. Cleanup task execution logs
3. `followup_task_created`
4. Followup task execution logs

## References

- **Main Implementation**: `backend/src/services/failureRecovery.ts`
- **Integration**: `backend/src/services/devBotsManager.ts`
- **Task Queue**: `backend/src/services/taskQueue.sqlite.ts`
- **Failure Detection**: `backend/src/services/taskFailureGuards.ts`
- **Config**: `backend/src/config.ts`
- **Logger**: `backend/src/utils/logger.ts`
