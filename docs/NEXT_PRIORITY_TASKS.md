# Next High-Priority Tasks

**Date**: 2025-11-12  
**Status**: **PR Self-Healing 80% Complete!** - Finishing touches needed  
**Branch**: staging (ready for production merge)

## ✅ Completed Today

1. **PR Self-Healing Event-Driven Implementation** - MAJOR MILESTONE! 🎉
   - Event-driven condition evaluation implemented ✅
   - Webhook handlers trigger intelligent fix task spawning ✅
   - Fingerprinting prevents duplicate fix tasks ✅
   - Condition-specific fix generation (CI, conflicts, comments, branch updates) ✅
   - Partial fix detection and progression tracking ✅
   - All 907 backend + 128 frontend tests passing ✅
   - Deployed to staging ✅

2. **PR Tracking Bug Fixes #2 & #3** - All 3 bugs fixed and tested
   - Bug #2: Branch update detection (case-sensitive comparison) ✅
   - Bug #3: Task cleanup on PR close (orphaned tasks) ✅
   - Deployed to staging ✅

3. **Deployment Infrastructure Complete**
   - DATABASE_PATH env var support ✅
   - Security documentation for gh CLI credentials ✅
   - Zero-downtime deployment verified ✅
   - 120s systemd timeout for graceful shutdown ✅

4. **Investigation Documents** - Architecture research completed
   - PR Self-Healing Event-Driven Design ✅
   - Schema Audit & Cleanup ✅
   - GitHub webhooks mapped to condition gates ✅

## 🔥 Critical Priority (P0)

### 1. Complete PR Self-Healing - Final 20% (1-2 days)

**What**: Add chain tracking, auto-merge, and Copilot throttling

**Why**: **CRITICAL** - Event-driven fix spawning is working, but needs:
- Chain depth tracking to prevent infinite loops
- Auto-merge when all conditions met
- Copilot throttle to avoid API limits

**Current State**: ✅ 80% Complete!
- ✅ Event-driven condition evaluation
- ✅ Intelligent fix task spawning
- ✅ Fingerprinting & duplicate prevention
- ⚠️ Missing: chain_id, auto-merge, Copilot throttle

**Remaining Work**:

#### A. Add Chain Tracking (3-4 hours)

**Migration**: `backend/migrations/011_add_chain_tracking.sql`

```sql
-- Add chain tracking for PR fix tasks
ALTER TABLE tasks ADD COLUMN chain_id TEXT;
ALTER TABLE tasks ADD COLUMN chain_depth INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id);
```

**Update Task Creation** in `prConditionState.service.ts`:
```typescript
// Get original task's chain_id when spawning fix task
const parentTask = await this.taskQueue.getTaskByPR(prNumber);
const chainId = parentTask?.chain_id || crypto.randomUUID();

const fixTask = await this.taskQueue.createTask({
  ...taskConfig,
  chain_id: chainId,
  chain_depth: (parentTask?.chain_depth || 0) + 1
});
```

**Add Chain Depth Limit** check before spawning:
```typescript
if (parentTask && parentTask.chain_depth >= 4) {
  await this.blockChain(chainId, 'Max depth exceeded');
  return; // Don't spawn more fix tasks
}
```

#### B. Implement Auto-Merge (4-6 hours)

**Location**: `backend/src/services/prConditionState.service.ts`

Add to `checkMergeReadiness()` method:
```typescript
private async checkMergeReadiness(prNumber: number, state: PRConditionState): Promise<void> {
  const allMet = this.allConditionsMet(state);
  
  if (allMet && !state.merge_eligible) {
    // All conditions newly met - trigger auto-merge
    await this.autoMergePR(prNumber, state);
  }
  
  state.merge_eligible = allMet;
}

private async autoMergePR(prNumber: number, state: PRConditionState): Promise<void> {
  const prStatus = await this.github.getPRStatus(prNumber);
  
  if (!prStatus.mergeable) {
    logger.warn(`PR #${prNumber} not mergeable despite conditions met`);
    return;
  }
  
  await this.github.mergePR(prNumber, {
    merge_method: 'squash',
    commit_title: `Auto-merge PR #${prNumber}`,
    commit_message: 'All quality gates passed - auto-merged'
  });
  
  // Cleanup
  await this.deletePRConditionState(prNumber);
  await this.taskQueue.completeTasksForPR(prNumber);
}
```

#### C. Add Copilot Throttle Manager (2-3 hours)

**New File**: `backend/src/services/copilotThrottle.service.ts`

```typescript
export class CopilotThrottleManager {
  private readonly MAX_ACTIVE = 3; // Start conservative
  
  async canUseCopilot(): Promise<boolean> {
    const active = await this.taskQueue.getTasksByAgent('copilot', 'running');
    return active.length < this.MAX_ACTIVE;
  }
}
```

**Integration** in `AgentSelector`:
```typescript
async selectAgent(task: Task): Promise<AgentSelection> {
  if (task.type === 'REVIEW' && await this.copilotThrottle.canUseCopilot()) {
    return { agent: 'copilot', reason: 'Copilot available for review' };
  }
  return this.selectBotAgent(task);
}
```

**Testing**:
```bash
npm test -- prConditionState
npm test -- githubWebhookHandler
npm test -- copilotThrottle
```

**Success Criteria**:
- ✅ Chain depth prevents infinite loops
- ✅ Auto-merge triggers when all 8 conditions met
- ✅ Copilot throttle prevents API limit issues
- ✅ All tests passing

---

## 🎯 High Priority (P1)

### 2. Schema Cleanup (P2 - 2 days) - Can run in parallel

**What**: Remove duplicate PR columns from tasks table

**Why**: Data duplication violates design principles

**Reference**: `docs/investigations/SCHEMA_AUDIT_AND_CLEANUP.md`

**Duplicate Columns to Remove**:
- pr_url, pr_branch, pr_status, pr_checks_status, pr_review_status, pr_created_at, pr_merged_at

**Steps**:
1. Update code to stop using duplicate columns
2. Create migration 011_schema_cleanup.sql  
3. Test on dev → staging → production

---

### 3. Artifact System (P1 - 1 day)

**What**: Generate session artifacts for debugging and learning

**Components**:
- session_summary.json generation  
- task_artifacts table + DB linking  
- Location: `backend/src/services/taskExecution.service.ts`

---

## 📊 Timeline

**Total Remaining**: 2-3 days to full PR autonomy

- Day 1: Chain tracking + Auto-merge (8-10 hours)
- Day 2: Copilot throttle + Testing (4-6 hours)  
- Day 3: Optional schema cleanup (can run in parallel)

---

## 🎯 Success Metrics

**After Full Implementation**:
- 90%+ of PRs self-heal without manual intervention
- Average time PR creation → merge: < 2 hours
- Fix task spawn latency: < 30 seconds from webhook
- Auto-merge success rate: > 95%

**Monitoring**:
- Dashboard showing active PR chains  
- Alerts for blocked chains (if any)
- Metrics on self-healing success rates

---

## 🔗 References

- [PR Self-Healing Event-Driven Design](./investigations/PR_SELF_HEALING_EVENT_DRIVEN_DESIGN.md)
- [Schema Audit & Cleanup](./investigations/SCHEMA_AUDIT_AND_CLEANUP.md)
- [Master Design Intent](./architecture/master-design-intent.md)
- [Implementation Status](./IMPLEMENTATION_STATUS.md)

---

**Updated**: 2025-11-12 07:20 UTC  
**Next Review**: After chain tracking + auto-merge completion

