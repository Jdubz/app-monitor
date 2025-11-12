# PR Self-Healing: Event-Driven Design Investigation

**Date**: 2025-11-12  
**Status**: Design Investigation Complete - Ready for Implementation Planning  
**Priority**: P0 - Critical for Full Autonomy

## Executive Summary

This document proposes an **event-driven PR self-healing architecture** using GitHub webhooks to create an intelligent, responsive system that automatically fixes PR issues without polling. The system leverages existing infrastructure (webhooks, condition states, task queue) and implements targeted fix tasks spawned in response to specific webhook events.

## Core Design Philosophy

**From Master Design Intent**:
- PR healing is the same as all task healing - uses the unified REVIEW → FIX → COMPLETE pipeline
- PR tracking tasks are no different from other tasks regarding healing
- Event-driven architecture - polling is only a last resort
- Any information available from GitHub should NOT be stored in our DB
- NEVER use in-memory storage
- Chain-aware task spawning with depth limits

## GitHub Webhook Events Available

Based on investigation of GitHub's webhook API and existing `githubWebhookHandler.service.ts`, we support:

### 1. **pull_request** Events
Actions: `opened`, `synchronize`, `reopened`, `closed`, `edited`, `ready_for_review`

**Use Cases:**
- PR opened → Register in DB, start condition tracking
- PR synchronize (new commits pushed) → Reset CI checks, re-evaluate branch currency
- PR closed → Cancel all associated tasks
- PR ready_for_review → Start Copilot review process

### 2. **check_suite** Events  
Actions: `completed`, `requested`, `rerequested`

**Use Cases:**
- CI suite completed → Evaluate check results, spawn fix task if failures detected
- Suite re-requested → Reset condition state, clear previous fix tasks

### 3. **check_run** Events
Actions: `created`, `completed`, `rerequested`

**Use Cases:**
- Individual check completed → Update condition state in real-time
- Check failed → Fingerprint failure type (lint, test, build), spawn targeted fix task

### 4. **pull_request_review** Events
Actions: `submitted`, `edited`, `dismissed`

**Use Cases:**
- Review submitted with changes_requested → Spawn fix task for requested changes
- Review dismissed → Re-evaluate condition state
- Copilot review submitted → Mark copilot_review_completed

### 5. **push** Events
Branch pushes that affect open PRs

**Use Cases:**
- Main branch updated → Trigger branch update evaluation for all open PRs
- PR branch updated → Re-evaluate all conditions

## The Eight Condition Gates

From `010_pr_condition_states.sql`, each PR tracks:

| Condition | Webhook Trigger | Fix Task Type | Notes |
|-----------|----------------|---------------|-------|
| `ci_checks_passing` | check_run.completed | FIX_CI_FAILURE | Fingerprint: lint/test/build |
| `comments_resolved` | pull_request_review.submitted | FIX_REVIEW_COMMENTS | Parse comment requirements |
| `no_merge_conflicts` | pull_request.synchronize | FIX_MERGE_CONFLICT | Git conflict resolution |
| `branch_updated` | push (to base branch) | UPDATE_BRANCH | Rebase/merge from main |
| `no_change_requests` | pull_request_review.submitted | ADDRESS_CHANGE_REQUESTS | Structured review responses |
| `task_verification` | (task completion) | VERIFY_TASK | Post-implementation checks |
| `copilot_review_completed` | pull_request_review.submitted | REQUEST_COPILOT_REVIEW | Delegation to Copilot |
| `final_validation_passed` | (condition evaluation) | FINAL_VALIDATION | Pre-merge smoke tests |

## Event-Driven Self-Healing Flow

### Scenario 1: CI Check Fails

```
1. GitHub → Webhook: check_run.completed (conclusion: FAILURE)
   ↓
2. githubWebhookHandler.handleCheckRun()
   ↓
3. prConditionState.evaluateAndHandleCheckStatus(prNumber)
   ↓
4. Fingerprint failure:
   - Backend Lint → spawn FIX_LINT task
   - Frontend Test → spawn FIX_TEST task
   - Build Error → spawn FIX_BUILD task
   ↓
5. Task spawned with context:
   {
     type: 'FIX',
     title: 'Fix failing linter in PR #96',
     followup_for_pr: 96,
     chain_id: <original_task_chain>,
     context: {
       failureType: 'lint',
       checkName: 'Backend Lint',
       logUrl: <check_run.html_url>,
       prBranch: 'feature/nginx-routing'
     }
   }
   ↓
6. Fix task executes → pushes fix → triggers PR synchronize webhook
   ↓
7. Webhook triggers re-evaluation → check passes → condition met
```

### Scenario 2: Branch Falls Behind

```
1. GitHub → Webhook: push (to main)
   ↓
2. githubWebhookHandler.handlePush()
   ↓
3. Query: SELECT pr_number FROM pr_condition_states WHERE branch_updated = 0
   ↓
4. For each behind PR:
   prConditionState.evaluateAndHandleBranchUpdate(prNumber)
   ↓
5. Spawn UPDATE_BRANCH task:
   {
     type: 'FIX',
     title: 'Update PR #96 with latest main',
     followup_for_pr: 96,
     context: {
       baseBranch: 'main',
       prBranch: 'feature/nginx-routing',
       strategy: 'rebase' // or 'merge'
     }
   }
```

### Scenario 3: Copilot Review Required

```
1. All conditions except copilot_review_completed = met
   ↓
2. Periodic evaluation detects missing Copilot review
   ↓
3. Check Copilot throttle limits (future: track active Copilot tasks)
   ↓
4. If under limit → Use Copilot delegation (preferred)
   {
     action: 'request_copilot_review',
     prNumber: 96,
     context: 'Full PR review before auto-merge'
   }
   ↓
5. If throttled → Spawn bot REVIEW task
   {
     type: 'REVIEW',
     title: 'Review PR #96 before merge',
     followup_for_pr: 96
   }
   ↓
6. Copilot/bot completes review → webhook: pull_request_review.submitted
   ↓
7. Mark copilot_review_completed = 1
```

## Implementation Architecture

### Core Components

#### 1. **PRConditionStateService** (Existing - Enhance)
**Location**: `backend/src/services/prConditionState.service.ts`

**Current State**: Evaluates conditions, stores state in `pr_condition_states` table

**Enhancements Needed**:
```typescript
// Add fingerprinting for intelligent fix task generation
async evaluateAndHandleCheckStatus(prNumber: number): Promise<void> {
  const prStatus = await this.githubPR.getPRStatus(prNumber);
  const condition = await this.getOrCreateConditionState(prNumber);
  
  // Fingerprint each failing check
  const failedChecks = prStatus.checks.filter(c => c.status === 'failure');
  
  for (const check of failedChecks) {
    const fingerprint = this.fingerprintCheckFailure(check);
    
    // Check if we already have an active fix task for this fingerprint
    if (!this.hasActiveFixTask(prNumber, fingerprint)) {
      await this.spawnFixTask(prNumber, fingerprint, check);
    }
  }
  
  // Update condition state
  await this.updateCondition(prNumber, {
    ci_checks_passing: failedChecks.length === 0
  });
}

private fingerprintCheckFailure(check: PRCheckStatus): string {
  // Categorize failure types
  if (check.name.includes('lint')) return 'lint_failure';
  if (check.name.includes('test')) return 'test_failure';
  if (check.name.includes('build')) return 'build_failure';
  if (check.name.includes('type')) return 'type_failure';
  return 'unknown_failure';
}

private async spawnFixTask(
  prNumber: number,
  fingerprint: string,
  check: PRCheckStatus
): Promise<string> {
  // Get PR details from GitHub (NOT from DB - per master design)
  const prStatus = await this.githubPR.getPRStatus(prNumber);
  
  // Get original task chain for this PR
  const originalTask = await this.taskQueue.getTaskByPR(prNumber);
  
  // Create fix task
  const fixTask = await this.taskQueue.createTask({
    type: 'FIX',
    title: `Fix ${fingerprint} in PR #${prNumber}`,
    description: `Automated fix for failing check: ${check.name}`,
    followup_for_pr: prNumber,
    chain_id: originalTask?.chain_id, // Maintain chain awareness
    priority: 8, // Higher than normal
    context: {
      fixType: fingerprint,
      checkName: check.name,
      checkUrl: check.detailsUrl,
      prNumber,
      prBranch: prStatus.head_ref,
      baseBranch: prStatus.base_ref,
      prUrl: prStatus.html_url
    }
  });
  
  // Track active fix task in condition state
  await this.addActiveFixTask(prNumber, fingerprint, fixTask.id);
  
  return fixTask.id;
}
```

#### 2. **GitHubWebhookHandler** (Existing - Enhance)
**Location**: `backend/src/services/githubWebhookHandler.service.ts`

**Current State**: Handles PR events, updates task status

**Enhancements Needed**:
```typescript
async handleCheckRun(payload: GitHubCheckRunPayload): Promise<void> {
  const prNumbers = payload.check_run.pull_requests.map(pr => pr.number);
  
  for (const prNumber of prNumbers) {
    // Trigger condition evaluation which spawns fix tasks if needed
    await this.prConditionState.evaluateAndHandleCheckStatus(prNumber);
  }
}

async handlePush(payload: GitHubPushPayload): Promise<void> {
  // Only care about pushes to main/base branches
  if (!payload.ref.endsWith('/main') && !payload.ref.endsWith('/master')) {
    return;
  }
  
  // Find all PRs that might be behind
  const openPRs = await this.prConditionState.getPRsNeedingBranchUpdate();
  
  for (const prNumber of openPRs) {
    await this.prConditionState.evaluateAndHandleBranchUpdate(prNumber);
  }
}

async handlePullRequestReview(payload: GitHubPullRequestReviewPayload): Promise<void> {
  const prNumber = payload.pull_request.number;
  const review = payload.review;
  
  // Check if this is a Copilot review
  if (review.user.login.includes('copilot')) {
    await this.prConditionState.markCopilotReviewCompleted(prNumber);
  }
  
  // Handle change requests
  if (review.state === 'changes_requested') {
    await this.prConditionState.evaluateAndHandleChangeRequests(prNumber);
  }
  
  // Re-evaluate all conditions
  await this.prConditionState.evaluateConditions(prNumber);
}
```

#### 3. **Task Execution with Healing** (Existing)
**Location**: `backend/src/services/taskExecution.service.ts`

**Current State**: Executes tasks with failure recovery

**No Changes Needed**: Already uses the unified healing system per master design

### Schema Enhancements

The existing schema already supports everything we need:

**✅ Tasks Table** (`tasks`):
- `followup_for_pr` - Links fix tasks to PR
- `chain_id` - Maintains chain awareness (if added)
- `status` - Tracks task lifecycle

**✅ PR Condition States** (`pr_condition_states`):
- All 8 condition flags
- `state_json` - Stores active fix task fingerprints
- `has_active_tasks` / `active_task_count`

**Minimal Addition Needed**:
```sql
-- Add to tasks table if not already present
ALTER TABLE tasks ADD COLUMN chain_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id);
```

## Copilot Limits & Throttling

### Current Understanding
- GitHub Copilot API does not expose rate limits via headers/endpoints
- Must track active Copilot tasks internally

### Tracking System Design

**Option 1: Simple Counter (Recommended for MVP)**
```typescript
class CopilotThrottleManager {
  private readonly MAX_ACTIVE_COPILOT_TASKS = 3; // Conservative limit
  
  async canUseCopilot(): Promise<boolean> {
    const activeCopilotTasks = await this.taskQueue.getActiveCopilotTasks();
    return activeCopilotTasks.length < this.MAX_ACTIVE_COPILOT_TASKS;
  }
  
  async requestCopilotTask(prNumber: number, type: 'review' | 'fix'): Promise<void> {
    if (!await this.canUseCopilot()) {
      throw new Error('Copilot throttle limit reached - use bot instead');
    }
    
    // Make Copilot API call
    // Track task in DB with agent_type = 'copilot'
  }
}
```

**Option 2: Time-Window Tracking (Future)**
- Track requests per hour/day
- Implement backoff on 429 responses
- Learn actual limits through observation

**Decision**: Start with Option 1, monitor for errors, adjust limits as needed

## Dependency Order & Parallel Execution

### Question: Does Dependency Order Matter?

**Answer: NO** - As long as all 8 conditions are eventually met, order doesn't matter.

**Why This Works**:
1. Each webhook spawns tasks for its specific failure type
2. Tasks execute in parallel (up to bot concurrency limit)
3. Condition state is evaluated atomically after each task completes
4. Auto-merge only triggers when ALL conditions = met
5. If new failures appear (e.g., rebase causes conflict), new fix tasks spawn

### Example: Parallel Fix Execution

```
PR #96 Initial State:
- ci_checks_passing: ❌ (lint failing)
- branch_updated: ❌ (behind main)
- comments_resolved: ❌ (2 review comments)

Webhooks fire nearly simultaneously:
1. check_run.completed → Spawn FIX_LINT task
2. push (main updated) → Spawn UPDATE_BRANCH task
3. pull_request_review → Spawn FIX_REVIEW_COMMENTS task

All 3 tasks execute in parallel (if bots available):
- Bot 1: Fixes linter errors
- Bot 2: Rebases on main
- Bot 3: Addresses review comments

Potential Conflict:
- Bot 2 pushes rebase → triggers PR synchronize webhook
- Bot 1 & 3's work might conflict with new base

Resolution:
- Git push fails for Bot 1 or 3 (outdated base)
- Task healing system detects push failure
- REVIEW task analyzes: "Need to pull latest changes"
- FIX task re-applies changes on new base
- Success!

All conditions eventually met → Auto-merge triggers
```

## Chain Awareness & Blocked Chain Handling

### From Master Design Intent

**Chain Rules**:
- Max concurrent chains = number of bots (e.g., 3)
- All fix tasks for a PR belong to the original implementation chain
- Blocked chains (4+ fix attempts) drop from active count
- Human can unblock → chain resumes with fresh fix counter

### Chain Lifecycle for PR Healing

```
1. Implementation task creates PR #96 (chain_id: abc-123)
   Active chains: 1
   
2. Webhook detects lint failure
   → Spawn FIX task (chain_id: abc-123, attempt: 1)
   Active chains: 1 (same chain)
   
3. Fix task fails (typo in fix)
   → Healing system spawns REVIEW task
   → REVIEW spawns FIX v2 (attempt: 2)
   Active chains: 1
   
4. Fix v2 fails
   → REVIEW → FIX v3 (attempt: 3)
   
5. Fix v3 fails
   → REVIEW → FIX v4 (attempt: 4)
   
6. Fix v4 fails
   → REVIEW detects: attempt >= 4
   → Mark chain as BLOCKED
   → Surface in dev-monitor with alert
   Active chains: 0 (dropped from count)
   
7. Human investigates → fixes root issue manually → Unblocks chain
   → Next webhook triggers fresh fix task (attempt counter RESETS to 1)
   Active chains: 1 (re-enters)
   
8. All conditions met → Auto-merge
   → Chain closes
   Active chains: 0
```

### Deploy Restart Handling

**Scenario**: Webhook handler receives event → persists task to DB → server restarts

**What Happens**:
1. Task is in DB with status='pending'
2. After restart, task queue worker picks up task
3. Task executes normally
4. Webhook events during downtime:
   - If using webhook queue: Events are queued in DB, replayed on startup
   - If not: GitHub will retry webhooks (up to 3 times over 24 hours)
   - Worst case: Periodic evaluation (fallback) catches missed events

**State Persistence**:
- ✅ Tasks: In SQLite DB
- ✅ PR condition states: In SQLite DB
- ✅ Chain tracking: In SQLite DB (if chain_id column added)
- ❌ In-flight webhook processing: Lost (acceptable - idempotent handlers)

**Blue/Green Deploy Strategy**:
- Nginx routes to new instance only if healthy
- New instance reads same SQLite DB
- Tasks continue processing seamlessly
- WebSocket connections reconnect to new instance

## Implementation Questions & Answers

### Q1: What fixes are needed for each condition?

**Answer**: GitHub GraphQL/REST API provides exact error details:

```graphql
query {
  repository(owner: "jdubz-d3v", name: "app-monitor") {
    pullRequest(number: 96) {
      # Condition: ci_checks_passing
      commits(last: 1) {
        nodes {
          commit {
            checkSuites(first: 10) {
              nodes {
                checkRuns(first: 30) {
                  nodes {
                    name
                    conclusion  # FAILURE, SUCCESS, etc.
                    detailsUrl  # Link to logs
                  }
                }
              }
            }
          }
        }
      }
      
      # Condition: no_merge_conflicts
      mergeable  # MERGEABLE, CONFLICTING, UNKNOWN
      
      # Condition: branch_updated
      baseRefOid  # Compare with PR head
      headRefOid
      
      # Condition: comments_resolved
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments {
            body
          }
        }
      }
      
      # Condition: no_change_requests
      reviews(last: 100) {
        nodes {
          state  # APPROVED, CHANGES_REQUESTED, etc.
          body
        }
      }
    }
  }
}
```

### Q2: Should Copilot reviews be event-driven?

**Answer**: YES - Use `pull_request_review` webhook

```typescript
async handlePullRequestReview(payload) {
  if (payload.review.user.login.includes('copilot')) {
    // Copilot review completed
    await prConditionState.markCopilotReviewCompleted(payload.pull_request.number);
    
    // Check for change requests from Copilot
    if (payload.review.state === 'changes_requested') {
      await prConditionState.evaluateAndHandleChangeRequests(
        payload.pull_request.number,
        payload.review.body
      );
    }
  }
}
```

### Q3: Do we need a webhook queue/persistence?

**Answer**: NO - Overly complex for our needs

**Rationale**:
1. Webhook handlers are idempotent (can safely re-process same event)
2. DB writes are immediate (task persisted before handler returns)
3. GitHub retries failed webhooks automatically
4. Periodic evaluation provides safety net
5. Blue/green deploy ensures minimal downtime

**Previous Over-Engineering**: Webhook queue system was proposed and partially implemented, then correctly reverted

### Q4: How do we avoid duplicate fix tasks?

**Answer**: Fingerprinting + active task tracking

```typescript
async spawnFixTask(prNumber: number, fingerprint: string) {
  // Check active_fix_tasks in pr_condition_states.state_json
  const condition = await this.getConditionState(prNumber);
  const activeTasks = JSON.parse(condition.state_json).active_fix_tasks || {};
  
  if (activeTasks[fingerprint]) {
    logger.info(`Fix task already active for ${fingerprint} on PR #${prNumber}`);
    return; // Don't spawn duplicate
  }
  
  // Spawn task
  const taskId = await this.taskQueue.createTask({...});
  
  // Track in condition state
  activeTasks[fingerprint] = taskId;
  await this.updateConditionState(prNumber, {
    state_json: JSON.stringify({ ...condition, active_fix_tasks: activeTasks })
  });
}
```

### Q5: What about blocked chains resuming?

**Answer**: Chain-aware context + reset fix counter

```typescript
async unblockChain(chainId: string, reason: string) {
  // Reset fix attempt counter for this chain
  await this.db.prepare(`
    UPDATE tasks
    SET retry_count = 0, status = 'pending'
    WHERE chain_id = ? AND status = 'blocked'
  `).run(chainId);
  
  // Log human intervention
  logger.info(`Chain ${chainId} unblocked by human: ${reason}`);
  
  // Next fix task will have attempt = 1 (fresh start)
}
```

**More Likely Scenario**: Human fixed the issue manually

```typescript
// When unblocking, first check if manual fix resolved issue
const prNumber = await getPRNumberForChain(chainId);
const conditions = await evaluateConditions(prNumber);

if (conditions.allMet) {
  logger.info(`Manual fix resolved all issues for chain ${chainId}`);
  await closeChain(chainId, 'manually_resolved');
  return;
}

// If issues remain, spawn REVIEW task to reassess
await spawnReviewTask({
  chainId,
  prNumber,
  context: 'Chain unblocked after manual intervention - reassess remaining issues'
});
```

### Q6: What about PR tracking vs healing confusion?

**Answer**: They're the same system - unified healing

**Clarification**:
- PR tracking = monitoring PR condition states
- PR healing = spawning fix tasks when conditions unmet
- Both use the same task queue, healing system, and execution pipeline
- No separate "PR healing" code needed
- Fix tasks are just regular tasks with `followup_for_pr` set

**Architecture**:
```
Task Execution Service (unified)
  └─> Executes ALL tasks (implementation, fix, review, etc.)
       └─> On failure → Failure Recovery Service
            └─> Spawn REVIEW task
                 └─> REVIEW analyzes → spawns FIX task
                      └─> Repeat up to 4 attempts
                           └─> 5th attempt → Escalate to human
```

### Q7: Should we store GitHub data in our DB?

**Answer**: NO - Query GitHub when needed

**What to Store**:
- ✅ PR number (identifier only)
- ✅ Task IDs (our internal tracking)
- ✅ Condition states (our evaluation results)
- ✅ Active fix task fingerprints (our spawn tracking)

**What NOT to Store**:
- ❌ PR title, description (query from GitHub)
- ❌ Check results (query from GitHub)
- ❌ Review comments (query from GitHub)
- ❌ Commit SHAs (query from GitHub)
- ❌ Branch names (query from GitHub)

**Why**: GitHub is the source of truth. Storing creates sync issues.

**Exception**: Temporary caching in condition state evaluation is OK, but always re-query on state changes.

## Recommended Implementation Plan

### Phase 1: Event-Driven Fix Task Spawning (2-3 days)

**Deliverables**:
1. Enhance `PRConditionStateService`:
   - Add `evaluateAndHandleCheckStatus()` with fingerprinting
   - Add `evaluateAndHandleBranchUpdate()`
   - Add `evaluateAndHandleChangeRequests()`
   - Add `spawnFixTask()` with duplicate prevention

2. Enhance `GitHubWebhookHandler`:
   - Update `handleCheckRun()` to trigger condition evaluation
   - Update `handlePush()` to check all PRs for branch updates
   - Update `handlePullRequestReview()` to handle Copilot reviews

3. Add chain_id support:
   - Migration to add `chain_id` column
   - Update task creation to propagate chain_id
   - Track chain depth for blocking logic

**Testing**:
- Unit tests for fingerprinting logic
- Integration tests for webhook → fix task flow
- Manual testing with real PRs

### Phase 2: Copilot Throttle & Delegation (1 day)

**Deliverables**:
1. `CopilotThrottleManager` service
2. Track Copilot tasks in DB (agent_type column)
3. AgentSelector integration (prefer Copilot when available)

### Phase 3: Blocked Chain Handling (1 day)

**Deliverables**:
1. Chain depth tracking
2. Auto-block after 4 attempts
3. Dev-monitor alerts for blocked chains
4. Unblock API endpoint

### Phase 4: Auto-Merge Implementation (2 days)

**Deliverables**:
1. Condition evaluation triggers auto-merge when all met
2. Pre-merge validation
3. Post-merge cleanup (close tasks, archive state)
4. Monitoring & alerts

**Total Estimated Time**: 6-7 days

## Success Criteria

**Metrics**:
- 90%+ of PR issues self-heal without human intervention
- Fix task spawn latency < 30 seconds (from webhook to task creation)
- Zero duplicate fix tasks spawned
- Blocked chains surface in dev-monitor within 1 minute
- Auto-merge success rate > 95% (when all conditions met)

**Observability**:
- Dashboard showing PR condition states
- Active fix task counts per PR
- Blocked chain alerts
- Copilot vs bot usage metrics
- Self-healing success/failure rates

## Open Items for Discussion

1. **Copilot Rate Limits**: Start conservative (3 concurrent), increase based on observation?
2. **Fix Task Prioritization**: Should fix tasks jump ahead of new implementation tasks?
3. **Branch Update Strategy**: Rebase vs merge - make configurable per PR?
4. **Blocked Chain Threshold**: 4 attempts too conservative? Should be configurable?
5. **Webhook Retry Logic**: Rely on GitHub's built-in retries or add our own?

## References

- [Master Design Intent](../architecture/master-design-intent.md)
- [PR Self-Healing Design](../technicalDesigns/pr-self-healing-and-resilience.md)
- [Healing System Design](../architecture/healing-system-design.md)
- [PR Tracking Critical Bugs](./PR_TRACKING_CRITICAL_BUGS.md)
- [GitHub Webhooks Guide](../guides/GITHUB_WEBHOOKS.md)

---

**Next Steps**: 
1. Review this design with architecture owner
2. Get approval on Copilot throttle approach
3. Create implementation tickets for each phase
4. Begin Phase 1 implementation
