# PR Sync Service Design

**Status:** ✅ Implemented  
**Implementation:** `backend/src/services/prSync.service.ts`  
**Delete After:** Move key decisions to architecture docs, then delete this design doc

## Problem Statement

Tasks are tracking PRs that may be closed/merged but we don't know about it because:
1. **Webhook delivery can fail** - GitHub webhook delivery isn't 100% reliable
2. **System downtime** - Events may arrive while server is down
3. **Missed historical events** - PRs closed before webhook setup

**Current State:**
- We have webhook handlers for `pull_request` events (opened, closed, merged, synchronize)
- We only sync when webhooks arrive
- No mechanism to detect stale PR data

## Solution: Event-Driven PR Sync

**Design Principle:** Event-driven, not timer-based. Check PR status every N tasks as a side effect of normal task operations.

### Trigger: Task Count Threshold

Every N tasks (e.g., every 10 task completions), check all PRs:
- **Trigger:** Task completion event
- **Counter:** Increment on every task complete, reset after sync
- **Action:** Sync all PRs when counter reaches threshold

```typescript
// In taskQueue.sqlite.ts
private taskCompletionCount = 0;
private readonly PR_SYNC_THRESHOLD = 10; // Every 10 tasks

async completeTask(taskId: string) {
  // ... existing completion logic ...
  
  this.taskCompletionCount++;
  
  if (this.taskCompletionCount >= this.PR_SYNC_THRESHOLD) {
    this.taskCompletionCount = 0;
    await this.syncAllPRs(); // Fire and forget
  }
}
```

### Core Sync Logic

```typescript
// backend/src/services/prSync.service.ts

interface PRSyncDelta {
  prNumber: number;
  expectedState: 'open' | 'unknown';
  actualState: 'open' | 'closed' | 'merged' | 'deleted';
  tasksAffected: string[];
}

class PRSyncService {
  /**
   * Sync all PRs tracked in open/active tasks
   * Logs deltas and resolves differences
   */
  async syncAllTrackedPRs(): Promise<void> {
    // 1. Get unique PR numbers from open/active tasks
    const prNumbers = await this.getTrackedPRNumbers();
    
    // 2. Check each PR's actual state from GitHub
    const deltas: PRSyncDelta[] = [];
    
    for (const prNumber of prNumbers) {
      const delta = await this.checkPRDelta(prNumber);
      if (delta) {
        deltas.push(delta);
      }
    }
    
    // 3. Log all deltas
    if (deltas.length > 0) {
      logger.warn({
        category: 'pr-sync',
        action: 'stale_prs_detected',
        message: `Found ${deltas.length} stale PRs`,
        details: { deltas }
      });
      
      // 4. Resolve differences by calling existing webhook handlers
      await this.resolveDeltas(deltas);
    } else {
      logger.info({
        category: 'pr-sync',
        action: 'pr_sync_complete',
        message: `All ${prNumbers.length} PRs in sync`
      });
    }
  }

  /**
   * Check if PR state differs from expected
   */
  private async checkPRDelta(prNumber: number): Promise<PRSyncDelta | null> {
    const tasks = await this.taskQueue.findByPRNumber(prNumber);
    const hasPendingTasks = tasks.some(t => 
      t.status === 'pending' || t.status === 'active'
    );
    
    if (!hasPendingTasks) {
      return null; // All tasks complete, no need to sync
    }
    
    // Fetch actual PR state from GitHub
    try {
      const prStatus = await this.githubPR.getPRStatus(prNumber);
      
      if (prStatus.state === 'CLOSED' || prStatus.state === 'MERGED') {
        return {
          prNumber,
          expectedState: 'open',
          actualState: prStatus.state === 'MERGED' ? 'merged' : 'closed',
          tasksAffected: tasks.map(t => t.id)
        };
      }
    } catch (error) {
      if (error.status === 404) {
        return {
          prNumber,
          expectedState: 'open',
          actualState: 'deleted',
          tasksAffected: tasks.map(t => t.id)
        };
      }
      throw error;
    }
    
    return null; // PR is still open, no delta
  }

  /**
   * Resolve deltas by calling existing webhook handlers
   */
  private async resolveDeltas(deltas: PRSyncDelta[]): Promise<void> {
    for (const delta of deltas) {
      logger.info({
        category: 'pr-sync',
        action: 'resolving_delta',
        message: `PR #${delta.prNumber} is ${delta.actualState}, cleaning up ${delta.tasksAffected.length} tasks`,
        details: delta
      });
      
      // Reuse existing webhook handler logic
      if (delta.actualState === 'merged') {
        await this.webhookHandler.handlePRMerged(delta.prNumber);
      } else if (delta.actualState === 'closed') {
        await this.webhookHandler.handlePRClosed(delta.prNumber);
      } else if (delta.actualState === 'deleted') {
        await this.webhookHandler.handlePRClosed(delta.prNumber);
      }
    }
  }
}
```

### Integration Points

1. **Task Completion Hook**
   ```typescript
   // In taskQueue.sqlite.ts
   async completeTask(taskId: string, result: TaskResult) {
     // Existing logic...
     
     // Trigger PR sync every N completions
     this.incrementTaskCompletionCounter();
   }
   
   private async incrementTaskCompletionCounter() {
     this.taskCompletionCount++;
     
     if (this.taskCompletionCount >= PR_SYNC_THRESHOLD) {
       this.taskCompletionCount = 0;
       
       // Fire and forget - don't block task completion
       this.prSyncService.syncAllTrackedPRs().catch(err => {
         logger.error({
           category: 'pr-sync',
           action: 'sync_failed',
           message: 'PR sync failed',
           error: err
         });
       });
     }
   }
   ```

2. **Manual Sync Endpoint** (for debugging)
   ```typescript
   // POST /api/dev-bots/pr-sync
   router.post('/pr-sync', async (req, res) => {
     await prSyncService.syncAllTrackedPRs();
     res.json({ success: true });
   });
   ```

### Logging Strategy

**On sync start:**
```json
{
  "category": "pr-sync",
  "action": "sync_started",
  "message": "Checking 15 tracked PRs"
}
```

**On delta detected:**
```json
{
  "category": "pr-sync",
  "action": "stale_prs_detected",
  "message": "Found 2 stale PRs",
  "details": {
    "deltas": [
      {
        "prNumber": 123,
        "expectedState": "open",
        "actualState": "merged",
        "tasksAffected": ["task-123", "task-124"]
      }
    ]
  }
}
```

**On resolution:**
```json
{
  "category": "pr-sync",
  "action": "resolving_delta",
  "message": "PR #123 is merged, cleaning up 2 tasks"
}
```

**On completion:**
```json
{
  "category": "pr-sync",
  "action": "pr_sync_complete",
  "message": "All 15 PRs in sync"
}
```

### Configuration

```typescript
// backend/src/config.ts
export const config = {
  prSync: {
    enabled: process.env.PR_SYNC_ENABLED !== 'false',
    taskThreshold: parseInt(process.env.PR_SYNC_TASK_THRESHOLD || '10'), // Every 10 tasks
  }
};
```

### Error Handling

1. **GitHub API rate limits**
   - Skip sync if rate limited
   - Log warning
   - Will retry on next task completion

2. **Network failures**
   - Log error
   - Don't fail task completion
   - Retry on next threshold

3. **Partial sync failures**
   - Continue processing remaining PRs
   - Log individual failures
   - Return summary

## Implementation

### Files to Create

1. `backend/src/services/prSync.service.ts` - Core sync logic (~200 lines)
2. `backend/src/services/prSync.service.test.ts` - Unit tests

### Files to Modify

1. `backend/src/services/taskQueue.sqlite.ts` - Add completion counter
2. `backend/src/config.ts` - Add PR sync config
3. `backend/src/routes/dev-bots/index.ts` - Add manual sync endpoint

### Estimated Effort

- **Core Service:** 3-4 hours
- **Integration:** 1-2 hours
- **Testing:** 2-3 hours
- **Total:** 6-9 hours (1 day)

## Design Alignment

✅ **Event-Driven:** Triggers on task completion, not timers  
✅ **Minimalist:** No dashboards, just logs and deltas  
✅ **Database as Truth:** Uses TaskQueueService  
✅ **Reuse:** Leverages existing webhook handlers  
✅ **Simple:** ~200 lines of code, clear logic  

## Success Criteria

1. ✅ No stale PRs after N*threshold task completions
2. ✅ Logs show clear deltas when PRs are out of sync
3. ✅ Existing webhook handlers called to resolve
4. ✅ No impact on task completion performance
5. ✅ Manual sync endpoint works for debugging
