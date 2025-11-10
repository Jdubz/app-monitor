# PR Webhook Migration - Cleanup Plan

## Current State Analysis

### ✅ NEW (Webhook-Based)
- `GitHubWebhookHandler` - Receives webhooks, updates task PR status
- `TaskQueueService.findByPRNumber()` - Find tasks by PR number
- `TaskQueueService.findByTaskId()` - Find tasks by ID from PR title  
- `TaskQueueService.updatePRStatus()` - Update PR fields on task
- Webhook routes integrated in server.ts
- GitHub webhooks configured and active

### ❌ OLD (Polling-Based - TO REMOVE)
- `PRMonitorService.startPolling()` - Polls GitHub API every minute
- `PRMonitorService.pollAllPRs()` - Checks all monitored PRs
- `PRMonitorService.checkPR()` - Polls single PR status
- `prMonitorPollIntervalMs` config - No longer needed

### 🔄 HYBRID (Keep but Refactor)
- `PRMonitorService.shouldCreateFollowup()` - Business logic for followup tasks ✅
- `PRMonitorService.createFollowupTask()` - Creates followup tasks ✅
- `PRMonitorService.mergePR()` - Auto-merge logic ✅
- `PRWorkflowOrchestrator` - Orchestrates workflow, needs webhook methods

## Duplication Issues

### Issue 1: Dual PR Status Updates
**Problem**: Both polling and webhooks update task PR status
- Polling: `prMonitor.checkPR()` → `updateTaskPRStatus()`
- Webhooks: `webhookHandler.handlePullRequest()` → `taskQueue.updatePRStatus()`

**Solution**: Remove polling, keep only webhooks

### Issue 2: Dual PR Registration
**Problem**: PRs registered for polling when created
- `prWorkflowOrchestrator.handleTaskCompletion()` → `prMonitor.registerPR()`
- This starts a polling timer

**Solution**: Replace registration with webhook event listeners

### Issue 3: Conflicting State
**Problem**: Polling might override webhook updates or vice versa
- Race condition between poll interval and webhook delivery
- Inconsistent task status

**Solution**: Single source of truth (webhooks)

## Cleanup Steps

### Step 1: Add Webhook Methods to PRWorkflowOrchestrator ✅
Add these methods (currently checked with typeof in webhook handler):
```typescript
async onPROpened(prNumber: number, pr: any): Promise<void>
async onPRSynchronize(prNumber: number, pr: any): Promise<void>  
async onPRMerged(prNumber: number, pr: any): Promise<void>
async onPRClosed(prNumber: number, pr: any): Promise<void>
async onPRReopened(prNumber: number, pr: any): Promise<void>
async onPRReadyForReview(prNumber: number, pr: any): Promise<void>
```

### Step 2: Remove Polling from PRMonitorService
Remove:
- `pollTimer` property
- `startPolling()` method
- `stopPolling()` method  
- `pollAllPRs()` method
- `checkPR()` method
- `monitoredPRs` Map (no longer need to track)

Keep:
- `shouldCreateFollowup()` - Business logic
- `createFollowupTask()` - Task creation
- `mergePR()` - Auto-merge logic
- Convert to utility class or merge into orchestrator

### Step 3: Refactor PRWorkflowOrchestrator
- Remove PRMonitorService dependency
- Remove `registerPR()` calls
- Add webhook event handlers
- Keep artifact recovery (useful for PR recovery from logs)

### Step 4: Remove Polling Config
- Remove `prMonitorPollIntervalMs` from config
- Remove `monitorPollIntervalMs` from PRWorkflowConfig
- Remove `maxPollAttempts` from PRMonitorConfig

### Step 5: Update Documentation
- Update PR_BASED_WORKFLOW.md to mention webhooks only
- Update any READMEs mentioning polling
- Add webhook-specific documentation

### Step 6: Clean Up Tests
- Update tests to use webhook approach
- Remove polling-related tests
- Add webhook handler tests

## Migration Strategy

### Option A: Complete Removal (Recommended)
1. Delete `PRMonitorService` entirely
2. Move business logic to `PRWorkflowOrchestrator`
3. Orchestrator becomes webhook-driven only
4. Clean, simple architecture

### Option B: Gradual Migration
1. Keep `PRMonitorService` but disable polling
2. Use it as utility class for business logic
3. Gradually merge into orchestrator over time
4. More cautious but adds complexity

## Recommendation

**Go with Option A**: Complete removal of polling

**Rationale**:
1. Webhooks are more reliable than polling
2. Simpler codebase with one path
3. Better performance (no unnecessary API calls)
4. Webhook delivery is near-instant vs 1-minute poll delay
5. GitHub webhooks are mature and reliable

**Risks**:
1. If webhooks fail/stop, PRs won't be monitored
   - Mitigation: Monitor webhook delivery in logs
   - Mitigation: Add health checks for webhook endpoint
2. Need task ID in PR title for association
   - Mitigation: Update bot templates (already planned)
   - Mitigation: Fallback to pr_number lookup

**Implementation Order**:
1. Add webhook methods to PRWorkflowOrchestrator
2. Test webhook → orchestrator flow
3. Remove polling code from PRMonitorService
4. Refactor PRMonitorService to utility functions
5. Update all call sites
6. Remove config options
7. Update documentation
8. Deploy and monitor

## Testing Checklist

- [ ] Create PR with task ID in title
- [ ] Verify webhook triggers PRWorkflowOrchestrator.onPROpened()
- [ ] Push new commit to PR
- [ ] Verify webhook triggers onPRSynchronize()
- [ ] Merge PR
- [ ] Verify webhook triggers onPRMerged()
- [ ] Verify task marked complete
- [ ] Verify no polling is happening (check logs)
- [ ] Verify no unnecessary GitHub API calls

## Files to Modify

1. `backend/src/services/prWorkflowOrchestrator.service.ts` - Add webhook methods
2. `backend/src/services/prMonitor.service.ts` - Remove polling, refactor to utils
3. `backend/src/services/githubWebhookHandler.service.ts` - Remove typeof checks
4. `backend/src/services/devBotsManager.interfaces.ts` - Remove poll config
5. `backend/src/services/devBotsManager.factory.ts` - Remove poll config
6. `docs/plans/PR_BASED_WORKFLOW.md` - Update to webhook-only
7. `backend/src/services/prMonitor.service.test.ts` - Update tests

## Success Criteria

- [ ] No polling timers running
- [ ] No GitHub API polls in logs
- [ ] Webhooks successfully update task status
- [ ] PRs still auto-merge when ready
- [ ] Followup tasks still created on failures
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Zero regression in PR workflow functionality
