# Next High-Priority Tasks

**Date**: 2025-11-12  
**Status**: Investigation Complete - Ready for Implementation  
**Branch**: staging (ready for production merge)

## ✅ Completed Today

1. **PR Tracking Bug Fixes #2 & #3** - All 3 bugs fixed and tested
   - Bug #2: Branch update detection (case-sensitive comparison) ✅
   - Bug #3: Task cleanup on PR close (orphaned tasks) ✅
   - All 907 backend + 128 frontend tests passing ✅
   - Deployed to staging ✅

2. **PR Self-Healing Design Investigation** - Comprehensive event-driven architecture
   - Documented all GitHub webhooks available ✅
   - Mapped 8 condition gates to webhook triggers ✅
   - Designed intelligent fix task spawning system ✅
   - Clarified PR healing = unified task healing ✅
   - Created 4-phase implementation plan (6-7 days) ✅
   - Location: `docs/investigations/PR_SELF_HEALING_EVENT_DRIVEN_DESIGN.md` ✅

3. **Schema Audit** - Identified data duplication violations
   - Found 7 duplicate PR columns in tasks table ✅
   - Proposed cleanup migration ✅
   - Documented correct architecture ✅
   - Location: `docs/investigations/SCHEMA_AUDIT_AND_CLEANUP.md` ✅

## 🔥 Critical Priority (P0)

### 1. Deploy Bug Fixes to Production (30 minutes)

**What**: Merge staging → main and deploy PR tracking fixes

**Why**: Production PRs are currently broken due to:
- Branch update detection not working (Bug #2)
- Orphaned tasks accumulating (Bug #3)

**Steps**:
```bash
# 1. Merge staging to main
git checkout main
git merge staging
git push origin main

# 2. Deploy to production
cd /prod/app-monitor
git pull origin main
npm run build
pm2 restart app-monitor-backend
```

**Verification**:
- Check PR #96-99 branch update detection works
- Verify closed PRs cancel their tasks
- Monitor logs for errors

**Risk**: Low - All tests passing, changes are bug fixes only

---

### 2. PR Self-Healing Implementation - Phase 1 (2-3 days)

**What**: Event-driven fix task spawning

**Why**: **CRITICAL** - Without this, PRs stall and require manual intervention. The entire autonomous system depends on this.

**Deliverables**:

#### A. Enhance PRConditionStateService (1 day)

**File**: `backend/src/services/prConditionState.service.ts`

**Add Methods**:
```typescript
// Fingerprint check failures and spawn fix tasks
async evaluateAndHandleCheckStatus(prNumber: number): Promise<void>

// Detect behind branches and spawn update tasks  
async evaluateAndHandleBranchUpdate(prNumber: number): Promise<void>

// Parse change requests and spawn fix tasks
async evaluateAndHandleChangeRequests(prNumber: number): Promise<void>

// Create fix task with fingerprinting
private async spawnFixTask(
  prNumber: number, 
  fingerprint: string, 
  context: FixContext
): Promise<string>

// Prevent duplicate fix tasks
private fingerprintCheckFailure(check: PRCheckStatus): string
private async hasActiveFixTask(prNumber: number, fingerprint: string): Promise<boolean>
```

**Implementation Details**:
- Fingerprint failures: `lint_failure`, `test_failure`, `build_failure`, `merge_conflict`, etc.
- Track active fix tasks in `pr_condition_states.state_json`
- Spawn tasks with `followup_for_pr` and `chain_id`
- Include context: checkName, detailsUrl, prBranch, failureType

#### B. Enhance GitHubWebhookHandler (1 day)

**File**: `backend/src/services/githubWebhookHandler.service.ts`

**Update Methods**:
```typescript
// Trigger condition evaluation on check completion
async handleCheckRun(payload: GitHubCheckRunPayload): Promise<void> {
  const prNumbers = payload.check_run.pull_requests.map(pr => pr.number);
  for (const prNumber of prNumbers) {
    await this.prConditionState.evaluateAndHandleCheckStatus(prNumber);
  }
}

// Check all PRs when main is updated
async handlePush(payload: GitHubPushPayload): Promise<void> {
  if (!payload.ref.endsWith('/main')) return;
  const openPRs = await this.prConditionState.getPRsNeedingBranchUpdate();
  for (const prNumber of openPRs) {
    await this.prConditionState.evaluateAndHandleBranchUpdate(prNumber);
  }
}

// Handle Copilot reviews and change requests
async handlePullRequestReview(payload: GitHubPullRequestReviewPayload): Promise<void> {
  const prNumber = payload.pull_request.number;
  if (payload.review.user.login.includes('copilot')) {
    await this.prConditionState.markCopilotReviewCompleted(prNumber);
  }
  if (payload.review.state === 'changes_requested') {
    await this.prConditionState.evaluateAndHandleChangeRequests(prNumber);
  }
}
```

#### C. Add Chain Tracking (0.5 days)

**Migration**: `backend/migrations/011_add_chain_tracking.sql`

```sql
-- Add chain tracking for depth limits
ALTER TABLE tasks ADD COLUMN chain_id TEXT;
ALTER TABLE tasks ADD COLUMN chain_depth INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id);
```

**Update Task Creation**:
```typescript
// Propagate chain_id when spawning fix tasks
async createTask(params: TaskParams): Promise<Task> {
  const chainId = params.chain_id || params.followup_for_pr 
    ? await this.getChainIdForPR(params.followup_for_pr)
    : randomUUID();
  
  const chainDepth = params.followup_for_pr
    ? await this.getChainDepth(chainId) + 1
    : 0;
  
  return {
    ...params,
    chain_id: chainId,
    chain_depth: chainDepth
  };
}
```

**Testing**:
```bash
# Unit tests
npm test -- prConditionState.service.test.ts
npm test -- githubWebhookHandler.service.test.ts

# Integration test with real PR
# 1. Create PR with failing check
# 2. Trigger webhook
# 3. Verify fix task spawned
# 4. Check fingerprint prevents duplicates
```

**Success Criteria**:
- ✅ Failing check → fix task spawned within 30 seconds
- ✅ Behind branch → update task spawned
- ✅ No duplicate tasks for same failure
- ✅ Chain depth tracked correctly

---

### 3. Copilot Throttle & Delegation - Phase 2 (1 day)

**What**: Track Copilot task limits and prefer Copilot for reviews

**Why**: Copilot is faster for reviews, but we need to avoid throttling

**Deliverables**:

#### A. CopilotThrottleManager Service

**File**: `backend/src/services/copilotThrottle.service.ts`

```typescript
export class CopilotThrottleManager {
  private readonly MAX_ACTIVE = 3; // Conservative start
  
  async canUseCopilot(): Promise<boolean> {
    const active = await this.taskQueue.getTasksByAgentType('copilot', 'running');
    return active.length < this.MAX_ACTIVE;
  }
  
  async requestCopilotReview(prNumber: number): Promise<void> {
    if (!await this.canUseCopilot()) {
      throw new Error('Copilot throttled - use bot instead');
    }
    // Make Copilot API call
    // Track as task with agent_type='copilot'
  }
}
```

#### B. AgentSelector Integration

**File**: `backend/src/services/agentSelector.ts`

```typescript
async selectAgent(task: Task): Promise<AgentSelection> {
  // For review tasks on PRs
  if (task.type === 'REVIEW' && task.pr_number) {
    if (await this.copilotThrottle.canUseCopilot()) {
      return { agent: 'copilot', reason: 'Copilot available for review' };
    }
  }
  
  // Fall back to existing logic
  return this.selectBotAgent(task);
}
```

**Testing**:
- Mock Copilot API calls
- Test throttle limit enforcement
- Verify fallback to bot when throttled

---

## 🎯 High Priority (P1)

### 4. Blocked Chain Handling - Phase 3 (1 day)

**What**: Auto-block chains after 4 failed attempts, surface in UI

**Components**:
- Chain depth tracking (done in Phase 1)
- Auto-block logic in task completion
- Dev-monitor alerts for blocked chains
- Unblock API endpoint

**Implementation**:
```typescript
// In TaskCompletionService
async completeTask(taskId: string, result: TaskResult): Promise<void> {
  const task = await this.taskQueue.getTask(taskId);
  
  if (task.chain_depth >= 4 && result.status === 'failed') {
    // Block chain
    await this.blockChain(task.chain_id, 'Max retries exceeded');
    
    // Surface in dev-monitor
    await this.alertService.createAlert({
      type: 'blocked_chain',
      severity: 'high',
      prNumber: task.followup_for_pr,
      chainId: task.chain_id,
      message: `Chain blocked after 4 failed attempts`,
      actionRequired: 'manual_review'
    });
  }
}
```

---

### 5. Auto-Merge Implementation - Phase 4 (2 days)

**What**: Automatically merge PRs when all 8 conditions met

**Components**:
- Condition evaluation triggers merge check
- Pre-merge validation
- Merge execution with retries
- Post-merge cleanup

**Implementation**:
```typescript
// In PRConditionStateService
async evaluateConditions(prNumber: number): Promise<void> {
  const conditions = await this.getConditionState(prNumber);
  
  // Check if all conditions met
  if (this.allConditionsMet(conditions)) {
    await this.autoMerge(prNumber);
  }
}

private async autoMerge(prNumber: number): Promise<void> {
  // Final validation
  const prStatus = await this.githubPR.getPRStatus(prNumber);
  if (!prStatus.mergeable) {
    logger.warn(`PR #${prNumber} not mergeable despite conditions met`);
    return;
  }
  
  // Merge
  await this.githubPR.mergePR(prNumber, {
    merge_method: 'squash',
    commit_title: `Merge PR #${prNumber}`,
    commit_message: 'Auto-merged after passing all quality gates'
  });
  
  // Cleanup
  await this.closeChain(chainId);
  await this.deleteConditionState(prNumber);
  await this.taskQueue.completeTasksForPR(prNumber);
}
```

---

## 📊 Medium Priority (P2)

### 6. Schema Cleanup (2 days)

**What**: Remove duplicate PR columns from tasks table

**Why**: Data duplication violates design principles, causes sync issues

**Reference**: `docs/investigations/SCHEMA_AUDIT_AND_CLEANUP.md`

**Steps**:
1. Update code to stop using duplicate columns
2. Create migration 011
3. Test migration on dev
4. Deploy to staging → production

**Can be done in parallel with Phase 1-4**

---

### 7. Frontend PR Dashboard (2-3 days)

**What**: Minimal UI showing PR chain states and blocked chains

**Components**:
- PR list with condition states
- Active fix task indicators
- Blocked chain alerts
- Manual unblock controls

**Design Philosophy** (from user):
> "UI should be VERY minimal focused on high level monitoring and human intervention in an otherwise autonomous system. Metrics displays are totally unnecessary."

**Mockup**:
```
┌─ Open PRs (4) ─────────────────────────────────────┐
│                                                      │
│ PR #96 - Add nginx routing           [HEALING]      │
│   ⚠️  ci_checks_passing (Fix task running)          │
│   ⚠️  branch_updated (Fix task pending)             │
│   ✅ comments_resolved                               │
│   ✅ no_merge_conflicts                              │
│   [ View Chain ] [ Manual Unblock ]                 │
│                                                      │
│ PR #97 - Database optimization       [BLOCKED]      │
│   ❌ Chain blocked after 4 attempts                 │
│   Last error: Merge conflict could not be resolved  │
│   [ View Details ] [ Unblock & Retry ]              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 📅 Implementation Timeline

### Week 1 (This Week)
- **Day 1**: ✅ Bug fixes deployed to production
- **Day 2-3**: Phase 1 (Event-driven fix spawning)
- **Day 4**: Phase 2 (Copilot throttle)
- **Day 5**: Phase 3 (Blocked chain handling)

### Week 2 (Next Week)
- **Day 1-2**: Phase 4 (Auto-merge)
- **Day 3-4**: Schema cleanup
- **Day 5**: Frontend PR dashboard (basic)

**Total**: 10 working days to full PR autonomy

---

## 🎯 Success Metrics

**After Full Implementation**:
- 90%+ of PRs self-heal without manual intervention
- Average time from PR creation to merge: < 2 hours (vs. manual: days)
- Blocked chain rate: < 5%
- Fix task spawn latency: < 30 seconds from webhook
- Auto-merge success rate: > 95%

**Monitoring**:
- Dashboard showing active PR chains
- Alerts for blocked chains
- Metrics on self-healing success rates
- Copilot vs bot usage stats

---

## ❓ Questions for Discussion

1. **Copilot Limits**: Start with max 3 concurrent, or higher?
2. **Chain Depth Threshold**: Is 4 attempts too conservative?
3. **Merge Strategy**: Squash vs merge commits - make configurable?
4. **Branch Update Strategy**: Rebase vs merge - preference?
5. **Production Deploy**: Blue-green already working, but test PR self-healing in staging first?

---

## 🔗 References

- [PR Self-Healing Event-Driven Design](./investigations/PR_SELF_HEALING_EVENT_DRIVEN_DESIGN.md)
- [Schema Audit & Cleanup](./investigations/SCHEMA_AUDIT_AND_CLEANUP.md)
- [PR Tracking Critical Bugs](./investigations/PR_TRACKING_CRITICAL_BUGS.md)
- [Master Design Intent](./architecture/master-design-intent.md)
- [Implementation Status](./IMPLEMENTATION_STATUS.md)

---

**Updated**: 2025-11-12 06:40 UTC  
**Next Review**: After Phase 1 completion
