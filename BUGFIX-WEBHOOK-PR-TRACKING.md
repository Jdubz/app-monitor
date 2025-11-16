# Bugfix: Webhook Creating Tasks for Untracked PRs

**Issue:** Webhook handlers were creating bugfix tasks for manual PRs that aren't part of the automated task system.

**Task IDs Affected:**
- `task-bugfix-7b417f87-0195-41d4-aebd-307fb7a79c41`
- `task-bugfix-2a9ab6a5-4905-431d-bfa4-a6081bd87830`
- `task-bugfix-2bbfbe50-55ce-4d62-bda2-46965c222e29`
- And others...

## Root Cause

The `checkRunHandler.ts` was calling `evaluateConditions()` for **ALL PRs** that received check run webhooks, without first verifying that the PR is tracked in the app-monitor system.

This differs from the correct behavior in:
- ✅ `checkSuiteHandler.ts` - properly checks for tasks first (lines 78-87)
- ✅ `pullRequestHandler.ts` - properly checks for tasks first (lines 46-50)
- ✅ `pullRequestReviewHandler.ts` - properly checks for tasks first (lines 66-75)
- ❌ `checkRunHandler.ts` - **missing task check** (immediately called evaluateConditions)

## Architecture Design Intent

According to `docs/architecture/pr-tracking-architecture.md`:

> The PR tracking system monitors pull requests **created by dev-bots**, evaluates 8 merge gate conditions, and automatically spawns fix tasks to address blocking issues.

**Key principle:** Webhooks should ONLY respond to PRs that are:
1. Associated with automated task chains (created by dev-bots), OR
2. Manually added to the PR tracking system via `pr_metadata` table

Manual user PRs should be **ignored** by the webhook system.

## The Fix

Added task existence check to `checkRunHandler.ts` before calling `evaluateConditions()`:

```typescript
// Find associated tasks - only process if PR is tracked in our system
const tasks = await this.taskQueue.findByPRNumber(prNumber);
if (tasks.length === 0) {
  logger.debug({
    category: 'api',
    action: 'check_run_no_tasks',
    message: `No tasks found for PR #${prNumber} - skipping check run processing`,
    details: { pr_number: prNumber }
  });
  return;
}
```

This ensures check_run webhooks **only trigger condition evaluation for tracked PRs**.

## Impact

**Before:** Any PR in the repo triggering check runs would spawn bugfix tasks  
**After:** Only PRs with associated tasks are processed by the webhook system

**Side Effects:** None - this is the intended behavior per architecture docs

## Testing

Manual PRs will now be silently ignored with a debug log:
```
check_run_no_tasks: No tasks found for PR #123 - skipping check run processing
```

Tracked PRs (dev-bot created or manually adopted) will continue to work normally.

## Related Files

- `/backend/src/services/webhookHandlers/checkRunHandler.ts` - Fixed
- `/backend/src/services/webhookHandlers/checkSuiteHandler.ts` - Already correct
- `/backend/src/services/webhookHandlers/pullRequestHandler.ts` - Already correct
- `/backend/src/services/webhookHandlers/pullRequestReviewHandler.ts` - Already correct

## Deployment

No database migrations required. Fix can be deployed immediately.

**Recommendation:** Clean up the orphaned bugfix tasks created by this bug:
```sql
DELETE FROM tasks 
WHERE id LIKE 'task-bugfix-%' 
AND pr_number NOT IN (SELECT pr_number FROM pr_metadata);
```
