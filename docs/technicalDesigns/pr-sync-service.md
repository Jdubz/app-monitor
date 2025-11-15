# PR Sync Service Design

## Problem Statement

Tasks are tracking PRs that may be closed/merged but we don't know about it because:
1. **Webhook delivery can fail** - GitHub webhook delivery isn't 100% reliable
2. **System downtime** - Events may arrive while server is down
3. **Missed historical events** - PRs closed before webhook setup
4. **Data drift** - Tasks created without PRs, orphaned PRs, etc.

**Current State:**
- We have webhook handlers for `pull_request` events (opened, closed, merged, synchronize)
- We only sync when webhooks arrive
- No mechanism to detect stale PR data

## Solution: Event-Based PR Sync Service

### Triggers for PR Sync

1. **Periodic Background Sync** (every 6-12 hours)
   - Check all open tasks with `pr_number` set
   - Verify PR state from GitHub API
   - Update/cleanup if PR is actually closed/merged

2. **On-Demand Sync Triggers:**
   - **Task completion** - Verify PR state before marking task done
   - **Manual API endpoint** - Admin can trigger sync for specific PR
   - **System startup** - Check for stale data on boot
   - **Webhook retry** - If GitHub sends retry event

3. **Reactive Sync:**
   - **404 from GitHub API** - PR was deleted, cleanup immediately
   - **Task queue check** - Before executing task, verify PR still open

### Architecture

```typescript
// backend/src/services/prSync.service.ts

interface PRSyncResult {
  prNumber: number;
  wasSynced: boolean;
  previousState: 'open' | 'closed' | 'merged' | 'unknown';
  currentState: 'open' | 'closed' | 'merged' | 'deleted';
  tasksAffected: string[];
  action: 'none' | 'closed' | 'merged' | 'deleted';
}

interface PRSyncStats {
  totalChecked: number;
  foundStale: number;
  tasksCleaned: number;
  prsMerged: number;
  prsClosed: number;
  prsDeleted: number;
  errors: number;
  lastSync: string;
}

class PRSyncService {
  /**
   * Sync a specific PR number
   */
  async syncPR(prNumber: number): Promise<PRSyncResult>

  /**
   * Sync all PRs tracked in open/active tasks
   */
  async syncAllTrackedPRs(): Promise<PRSyncStats>

  /**
   * Check if PR needs sync (stale check)
   */
  async isPRStale(prNumber: number): Promise<boolean>

  /**
   * Start periodic background sync
   */
  startPeriodicSync(intervalMs: number): void

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void
}
```

### Implementation Plan

#### Phase 1: Core Sync Logic

1. **Create `prSync.service.ts`**
   ```typescript
   async syncPR(prNumber: number): Promise<PRSyncResult> {
     // 1. Fetch PR state from GitHub API
     // 2. Find all tasks with this pr_number
     // 3. If PR is closed/merged but tasks are open:
     //    - Call existing webhook handlers (reuse logic)
     //    - Log the sync action
     // 4. Return sync result
   }
   ```

2. **Add sync endpoint**
   ```typescript
   // POST /api/dev-bots/pr-sync/:prNumber
   // POST /api/dev-bots/pr-sync/all
   ```

3. **Track sync metadata**
   ```sql
   CREATE TABLE pr_sync_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     pr_number INTEGER NOT NULL,
     sync_type TEXT NOT NULL, -- 'manual', 'periodic', 'webhook-retry', 'startup'
     previous_state TEXT,
     current_state TEXT,
     tasks_affected INTEGER,
     action_taken TEXT,
     synced_at TEXT NOT NULL,
     error TEXT
   );
   ```

#### Phase 2: Periodic Background Sync

1. **Add scheduler**
   ```typescript
   // backend/src/services/backgroundJobs.service.ts
   class BackgroundJobsService {
     async startJobs() {
       // Run PR sync every 6 hours
       this.scheduler.addJob('pr-sync', async () => {
         await prSyncService.syncAllTrackedPRs();
       }, { intervalMs: 6 * 60 * 60 * 1000 });
     }
   }
   ```

2. **Stale detection criteria**
   - Task is `pending` or `active`
   - Has `pr_number` set
   - Last webhook event > 12 hours ago
   - No sync in last 6 hours

#### Phase 3: Integration Points

1. **Before task execution**
   ```typescript
   // In taskExecution.service.ts
   async executeTask(taskId: string) {
     const task = await this.taskQueue.getTask(taskId);
     
     // Sync PR state before executing
     if (task.pr_number) {
       const result = await prSyncService.syncPR(task.pr_number);
       if (result.currentState === 'merged' || result.currentState === 'closed') {
         throw new Error(`Task cancelled: PR ${task.pr_number} is ${result.currentState}`);
       }
     }
     
     // Continue execution...
   }
   ```

2. **On task completion**
   ```typescript
   // Verify PR still exists before marking done
   if (task.pr_number) {
     await prSyncService.syncPR(task.pr_number);
   }
   ```

3. **System startup**
   ```typescript
   // In server.ts initialization
   await prSyncService.syncAllTrackedPRs();
   ```

#### Phase 4: Monitoring & Alerting

1. **Expose metrics**
   ```typescript
   GET /api/dev-bots/pr-sync/stats
   ```

2. **Log stale PR detection**
   ```typescript
   logger.warn({
     category: 'pr-sync',
     action: 'stale_pr_detected',
     message: `PR #${prNumber} was ${state} but tasks still tracked as open`,
     details: { pr_number, tasks_affected, hours_since_close }
   });
   ```

3. **Alert on high stale rate**
   - If >10% of tracked PRs are stale, webhook delivery may be failing

### Configuration

```typescript
// backend/src/config.ts
export const config = {
  // ...
  prSync: {
    enabled: process.env.PR_SYNC_ENABLED !== 'false', // Default: true
    intervalMs: parseInt(process.env.PR_SYNC_INTERVAL_MS || String(6 * 60 * 60 * 1000)), // 6 hours
    syncOnStartup: process.env.PR_SYNC_ON_STARTUP !== 'false', // Default: true
    syncBeforeExecution: process.env.PR_SYNC_BEFORE_EXEC !== 'false', // Default: true
  }
};
```

### API Endpoints

```typescript
// Manual sync endpoints
POST   /api/dev-bots/pr-sync/:prNumber     // Sync specific PR
POST   /api/dev-bots/pr-sync/all           // Sync all tracked PRs
GET    /api/dev-bots/pr-sync/stats         // Get sync statistics
GET    /api/dev-bots/pr-sync/log/:prNumber // Get sync history for PR
DELETE /api/dev-bots/pr-sync/log           // Clear old sync logs
```

### Benefits

1. **Resilient** - No longer dependent on webhook delivery
2. **Self-healing** - Automatically detects and fixes stale data
3. **Observable** - Metrics show webhook reliability
4. **Safe** - Prevents executing tasks for closed PRs
5. **Debuggable** - Sync log provides audit trail

### Migration Path

1. ✅ **Phase 1:** Create service, add manual sync endpoint (Week 1)
2. ✅ **Phase 2:** Add periodic background sync (Week 1)
3. ✅ **Phase 3:** Integrate with task execution (Week 2)
4. ✅ **Phase 4:** Add monitoring dashboard (Week 2)

### Testing Strategy

1. **Unit tests:**
   - Sync logic for merged/closed/deleted PRs
   - Stale detection criteria
   - Rate limiting (don't hammer GitHub API)

2. **Integration tests:**
   - Simulate webhook delivery failure
   - Verify cleanup happens on sync
   - Test startup sync

3. **E2E tests:**
   - Create task with PR
   - Close PR on GitHub
   - Wait for sync (or trigger manually)
   - Verify task cleanup

### Error Handling

1. **GitHub API rate limits**
   - Respect rate limit headers
   - Exponential backoff on 429 responses
   - Skip sync if rate limited (log warning)

2. **Network failures**
   - Retry with exponential backoff
   - Log failures but don't fail the sync job
   - Alert if failure rate > 5%

3. **Concurrent syncs**
   - Use database lock to prevent duplicate syncs
   - Track in-progress syncs in memory

### Future Enhancements

1. **Smart sync scheduling**
   - Sync more frequently for active PRs
   - Less frequently for old PRs

2. **Webhook replay**
   - Store failed webhooks
   - Replay on sync

3. **PR state cache**
   - Cache PR state for 5 minutes
   - Reduce GitHub API calls

4. **Batch API calls**
   - Use GitHub GraphQL to batch PR status checks
   - Check 100 PRs in one request

## Files to Create

1. `backend/src/services/prSync.service.ts` - Core sync logic
2. `backend/src/services/prSync.service.test.ts` - Unit tests
3. `backend/src/routes/dev-bots/prSync.routes.ts` - API endpoints
4. `backend/src/services/backgroundJobs.service.ts` - Job scheduler
5. `docs/guides/pr-sync-service.md` - User documentation

## Files to Modify

1. `backend/src/config.ts` - Add PR sync config
2. `backend/src/server.ts` - Initialize sync service
3. `backend/src/services/taskExecution.service.ts` - Add pre-execution sync
4. `backend/src/services/taskQueue.sqlite.ts` - Add pr_sync_log table

## Estimated Effort

- **Phase 1:** 4-6 hours (core service + endpoint)
- **Phase 2:** 2-3 hours (background scheduler)
- **Phase 3:** 2-3 hours (integration points)
- **Phase 4:** 2-3 hours (monitoring)
- **Testing:** 3-4 hours
- **Documentation:** 1-2 hours

**Total:** ~14-21 hours (2-3 days)

## Success Metrics

1. Zero stale PRs after 24 hours
2. Sync completion rate > 95%
3. Average sync time < 5 seconds per PR
4. Webhook delivery reliability visible in metrics
