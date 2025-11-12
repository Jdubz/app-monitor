# PR Workflow Implementation - Comprehensive Plan

**Last Updated:** 2025-11-12 05:20 UTC  
**Status:** Phase 1-2 Complete ✅, Phase 3-4 In Progress ⏳  
**Priority:** P0 CRITICAL

**Consolidated from 7 separate plans:**
- CONTINUOUS_PR_IMPLEMENTATION_ROADMAP.md
- CONTINUOUS_PR_SELF_HEALING.md  
- PR_TRACKING_CRITICAL_FIX_IMPLEMENTATION.md
- PR_TRACKING_SYSTEM_RESILIENCE_PLAN.md
- STUCK_PRODUCTION_PRS_AUTOMATION_PLAN.md
- pr-workflow-enhancement-plan.md
- pr-workflow-quality-gates.md

---

## 🎉 Recent Progress (2025-11-12)

**Completed Today:**
- ✅ Bug #2: Branch update detection (mergeStateStatus case-sensitive fix)
- ✅ Bug #3: Task cleanup on PR close (no more orphaned tasks)
- ✅ All 907 backend + 128 frontend tests passing
- ✅ Deployed to staging branch

**Phase Status:**
- ✅ **Phase 1 (PR Creation):** Complete
- ✅ **Phase 2 (Quality Gates):** Complete
- ⏳ **Phase 3 (Self-Healing):** Starting (3-5 days)
- ⏳ **Phase 4 (Auto-Merge):** Next (2-3 days)

---

## Executive Summary

**Goal:** Fully autonomous PR workflow from task completion to merge

**Current State (2025-11-12):**
- ✅ Quality gates implemented (`githubPR.service.ts`)
- ✅ Webhook ingestion working (`githubWebhookHandler.service.ts`)
- ✅ PR creation automation working (HOME env, gh config, GH_TOKEN fixed)
- ✅ Branch update detection working (push webhook handler)
- ✅ Task cleanup on PR close working
- ⏳ Self-healing loop in progress (next priority)
- ❌ Auto-merge not implemented

**Target State:**
- Complete → Create PR → Quality Gates → Auto-Fix → Auto-Merge
- Zero human intervention for passing PRs
- Self-healing for failing checks

---

## Architecture Overview

```
Task Completes
     ↓
Create PR (automated)
     ↓
Quality Gates Run
     ↓
   PASS? ━━━━━━━━━━━┓
     ↓ YES          ↓ NO
Auto-Merge      Self-Heal
                    ↓
              Create Fix Task
                    ↓
              Push Fixes
                    ↓
              Re-run Gates
                    ↓
              (retry loop)
```

---

## Phase 1: PR Creation & Tracking (✅ COMPLETE)

### 1.1 Automated PR Creation
**Status:** ✅ Fixed 2025-11-12

**Implementation:**
- Location: `backend/src/services/githubPR.service.ts`
- Triggers after task completion
- Uses bot commit credentials
- Template-based PR body

**Fixed Issues:**
- HOME environment variable
- gh config mount (read-write)
- GH_TOKEN authentication

### 1.2 PR State Tracking
**Status:** ✅ Working

**Database Schema:**
```sql
CREATE TABLE pull_requests (
  id INTEGER PRIMARY KEY,
  pr_number INTEGER,
  repository TEXT,
  branch TEXT,
  state TEXT, -- open, closed, merged
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE pr_check_runs (
  id INTEGER PRIMARY KEY,
  pr_id INTEGER,
  check_name TEXT,
  status TEXT, -- queued, in_progress, completed
  conclusion TEXT, -- success, failure, neutral, cancelled
  started_at TEXT,
  completed_at TEXT
);
```

### 1.3 Webhook Processing
**Status:** ✅ Working

**Implementation:**
- Location: `backend/src/services/githubWebhookHandler.service.ts`
- Processes: pull_request, check_suite, check_run events
- Updates database state
- Triggers quality gate evaluation

---

## Phase 2: Quality Gates (✅ COMPLETE)

### 2.1 Gate Definitions
**Status:** ✅ Implemented

**Implementation:**
- Location: `backend/src/services/githubPR.service.ts`
- Configurable gates per repository

**Gates:**
1. **All checks passing** - CI/CD success
2. **Required reviews** - Human approval (optional)
3. **No conflicts** - Branch up to date
4. **Description quality** - Meaningful PR description
5. **Test coverage** - Minimum coverage threshold

### 2.2 Gate Evaluation
**Status:** ✅ Working

**Triggers:**
- On PR creation
- On check_suite completion
- On push to PR branch
- Manual via webhook

**Metrics Tracked:**
```typescript
{
  gate_evaluations_total: counter,
  gate_passed: counter,
  gate_failed: counter,
  gate_evaluation_duration_seconds: histogram
}
```

---

## Phase 3: Self-Healing Loop (❌ NOT IMPLEMENTED)

### 3.1 Architecture

```
Check Failed
     ↓
Classify Failure
     ↓
Generate Fix Task
     ↓
Execute in dev-bot
     ↓
Push Fix Commit
     ↓
Re-run Checks
     ↓
  Success? ━━━━━┓
     ↓ YES     ↓ NO
  Continue   Retry (max 3)
                ↓
            Escalate to Human
```

### 3.2 Failure Classification

**Categories:**
1. **Lint errors** - ESLint/Prettier failures
2. **Test failures** - Unit/integration test failures  
3. **Build errors** - TypeScript/compilation errors
4. **Merge conflicts** - Git conflicts
5. **Coverage drops** - Test coverage below threshold

**Classifier:**
```typescript
interface FailureClassification {
  category: 'lint' | 'test' | 'build' | 'conflict' | 'coverage';
  severity: 'low' | 'medium' | 'high';
  fixable: boolean;
  retry_count: number;
}
```

### 3.3 Fix Task Generation

**Input:**
- Failure logs
- Diff/patch information
- Previous fix attempts

**Output:**
```typescript
{
  task_type: 'pr_fix',
  pr_number: number,
  failure_category: string,
  context: {
    error_logs: string,
    failed_files: string[],
    check_name: string
  },
  instructions: string // AI-generated fix instructions
}
```

### 3.4 Fix Execution

**Process:**
1. Create fix task in queue
2. Assign to appropriate agent (lint-bot, test-bot, etc.)
3. Execute in sandboxed environment
4. Generate fix commit
5. Push to PR branch
6. Wait for check re-run
7. Evaluate success

**Retry Logic:**
- Max 3 attempts per failure
- Exponential backoff between attempts
- Different approaches per attempt
- Escalate after 3 failures

### 3.5 Implementation Plan

**Files to Create:**
```
backend/src/services/prSelfHealing.service.ts
backend/src/services/failureClassifier.ts
backend/src/services/fixTaskGenerator.ts
```

**Database Schema:**
```sql
CREATE TABLE pr_fix_attempts (
  id INTEGER PRIMARY KEY,
  pr_id INTEGER,
  failure_category TEXT,
  attempt_number INTEGER,
  task_id INTEGER,
  success BOOLEAN,
  error_message TEXT,
  created_at TEXT
);
```

**Estimated Effort:** 3-5 days

---

## Phase 4: Auto-Merge (❌ NOT IMPLEMENTED)

### 4.1 Merge Criteria

**Required:**
- ✅ All quality gates passing
- ✅ All checks successful
- ✅ No merge conflicts
- ✅ Branch up to date with base

**Optional (configurable):**
- Required reviews met
- Minimum time since last commit (24h)
- Deployment preview successful

### 4.2 Merge Strategy

**Options:**
1. **Merge commit** - Default, preserves all history
2. **Squash** - Single commit, clean history
3. **Rebase** - Linear history

**Implementation:**
```typescript
async function autoMergePR(prNumber: number): Promise<void> {
  // 1. Final gate check
  const gates = await evaluateQualityGates(prNumber);
  if (!gates.all_passing) {
    return;
  }
  
  // 2. Update branch if needed
  if (gates.needs_update) {
    await updateBranch(prNumber);
    await waitForChecks(prNumber);
  }
  
  // 3. Merge
  await octokit.pulls.merge({
    owner,
    repo,
    pull_number: prNumber,
    merge_method: 'squash'
  });
  
  // 4. Cleanup
  await deleteBranch(prNumber);
}
```

### 4.3 Safety Mechanisms

**Prevent:**
- Merging with failing checks
- Merging with unresolved conflicts
- Merging untested code
- Merging without review (if required)

**Audit:**
- Log all auto-merges
- Track merge success rate
- Alert on repeated failures

**Estimated Effort:** 2-3 days

---

## Phase 5: Monitoring & Alerts (⚠️ PARTIAL)

### 5.1 Metrics

**Implemented:**
```typescript
webhook_events_processed: counter
gate_evaluations_total: counter
gate_passed: counter
gate_failed: counter
```

**Missing:**
```typescript
pr_created_total: counter
pr_merged_total: counter
pr_auto_merged_total: counter
pr_self_heal_attempts: counter
pr_self_heal_success: counter
time_to_merge_seconds: histogram
```

### 5.2 Alerts

**Critical:**
- Webhook processing failures
- PR creation failures
- Auto-merge failures

**Warning:**
- Self-heal retry limit reached
- Quality gate failures increasing
- Long-running PRs (>7 days)

### 5.3 Dashboard

**Views:**
1. PR Pipeline Overview
   - PRs in progress
   - Auto-merge queue
   - Self-healing in progress

2. Quality Gates
   - Pass rate by gate
   - Most common failures
   - Fix success rate

3. Performance
   - Time to merge (p50, p90, p99)
   - Auto-merge rate
   - Human intervention rate

**Estimated Effort:** 3-4 days

---

## Current Issues & Fixes

### Issue 1: PR Creation Sometimes Fails ✅ FIXED
**Root Cause:** Auth issues in container  
**Fix:** HOME env, gh config mount, GH_TOKEN  
**Status:** Resolved 2025-11-12

### Issue 2: Branch Updates Not Evaluated ✅ COMPLETE
**Root Cause:** Misunderstanding - feature already implemented  
**Implementation:**  
- `/api/github/webhooks/push` endpoint exists (line 156)
- `handlePush()` evaluates all tracked PRs when base branch updated
- Requires GitHub webhook configured in repo settings  
**Status:** ✅ Complete - Just needs webhook registration in GitHub

### Issue 3: Stuck PRs Not Cleaned Up
**Root Cause:** No automatic cleanup of stale PRs  
**Fix:** Add cron job to close stale PRs (>30 days inactive)  
**Status:** ⏳ Pending

### Issue 4: No Resilience for Webhook Failures
**Root Cause:** Single point of failure, no retry  
**Fix:** Implement webhook queue with retry logic  
**Status:** ⏳ Pending

---

## Implementation Timeline

| Phase | Effort | Priority | Status | Completion Date |
|-------|--------|----------|--------|-----------------|
| ✅ PR Creation | 3-4 days | P0 | **COMPLETE** | 2025-11-12 |
| ✅ Quality Gates | 2-3 days | P0 | **COMPLETE** | 2025-11-12 |
| ✅ Bug Fixes (#2, #3) | 2 hours | P0 | **COMPLETE** | 2025-11-12 |
| ⏳ Self-Healing | 3-5 days | P0 | **IN PROGRESS** | Target: 2025-11-17 |
| ⏳ Auto-Merge | 2-3 days | P1 | Pending | Target: 2025-11-20 |
| ⏳ Monitoring | 3-4 days | P2 | Pending | Target: 2025-11-24 |

**Phase 1-2 Complete:** 2025-11-12  
**Total Remaining:** 8-12 days  
**Estimated Full Completion:** 2025-11-24

---

## Success Criteria

**Phase 3 (Self-Healing) Complete When:**
- 80% of lint errors auto-fixed
- 60% of test failures auto-fixed
- 40% of build errors auto-fixed
- < 3 retry attempts average
- Human escalation < 20%

**Phase 4 (Auto-Merge) Complete When:**
- 90% of passing PRs auto-merged
- Zero failed auto-merges
- < 24h average time to merge
- 100% audit coverage

**Full System Complete When:**
- End-to-end autonomous: Task → PR → Merge
- < 5% human intervention rate
- Zero downtime during deploys
- 95% quality gate pass rate

---

## References

**Implementation:**
- `backend/src/services/githubPR.service.ts` - Quality gates
- `backend/src/services/githubWebhookHandler.service.ts` - Events
- `backend/src/routes/github-webhooks.routes.ts` - Webhook endpoint

**Documentation:**
- `docs/guides/GITHUB_WEBHOOKS.md` - Webhook setup
- `docs/plans/SELF_HEALING_DEPLOYMENT.md` - Related deployment healing

**Investigations:**
- `docs/investigations/PR_TRACKING_INVESTIGATION_REPORT.md`
- `docs/investigations/STUCK_PRS_RESOLUTION.md`
- `docs/investigations/PR_CREATION_FAILURE_INVESTIGATION.md`

**Archived Plans (Consolidated):**
- See `docs/archive/` for individual plan history
