# PR Tracking & Merge Gate Architecture

**Purpose:** Comprehensive architecture of the automated pull request tracking, merge gate conditions, and automated merge system.

**Status:** Production (v0.2.0)

---

## Overview

The PR tracking system monitors pull requests created by dev-bots, evaluates 8 merge gate conditions, and automatically spawns fix tasks to address blocking issues. When all conditions are met, PRs are automatically merged without human intervention.

**Key Principles:**
- **NEVER merge unless ALL conditions met** - Zero-tolerance policy
- **Event-driven** - Webhook-based, no polling
- **Fingerprint-based deduplication** - Prevent duplicate fix tasks
- **Autonomous resolution** - Bots fix their own blocking issues
- **Human escalation** - Only after automation exhausts options

---

## System Architecture

### Core Components

| Component | Responsibility | Location |
|-----------|---------------|----------|
| `PRMonitorService` | Monitors PR state, triggers evaluations | `prMonitor.service.ts` |
| `PRConditionStateService` | Evaluates 8 merge conditions, spawns tasks | `prConditionState.service.ts` |
| `PRWorkflowOrchestrator` | Coordinates PR lifecycle | `prWorkflowOrchestrator.service.ts` |
| `PRSyncService` | Syncs PR metadata with GitHub | `prSync.service.ts` |
| `ReviewCommentTracker` | Tracks review comments and resolutions | `reviewCommentTracker.service.ts` |
| `PRConditions/` | 8 condition evaluators (one per condition) | `prConditions/evaluators/` |

### Data Flow

```
GitHub Webhook → PRMonitorService → PRConditionStateService → Condition Evaluators
                                            ↓
                                    Blocking Issues Found?
                                            ↓
                                         Yes → Spawn Fix Task
                                            ↓
                                         No → Auto-Merge PR
```

---

## 8 Merge Gate Conditions

### Condition 1: CI Checks Passing

**Requirement:** All GitHub Actions checks must pass

**Evaluator:** `CIChecksEvaluator`

**Blocking Issues:**
- Failed checks (test failures, lint errors, build failures)
- Pending checks (still running)
- Skipped checks (required checks not run)

**Fix Task Spawned:**
- **Type:** `fix`
- **Title:** "Fix failing CI check: {check_name}"
- **Agent:** Same as parent implementation
- **Context:** Check logs, error messages

**Fingerprint:** `ci_check:${check_name}:${commit_sha}`

---

### Condition 2: Comments Resolved

**Requirement:** All review comments marked as resolved

**Evaluator:** `CommentsResolvedEvaluator`

**Blocking Issues:**
- Unresolved review comments
- Comments requesting changes

**Fix Task Spawned:**
- **Type:** `fix`
- **Title:** "Address review comment: {comment_summary}"
- **Agent:** Same as parent implementation
- **Context:** Comment thread, requested changes

**Fingerprint:** `comment:${comment_id}`

**Special Handling:**
- Bot can resolve simple comments automatically
- Complex comments escalate to human review

---

### Condition 3: No Merge Conflicts

**Requirement:** PR branch has no conflicts with base branch

**Evaluator:** `MergeConflictsEvaluator`

**Blocking Issues:**
- Git merge conflicts in files

**Fix Task Spawned:**
- **Type:** `fix`
- **Title:** "Resolve merge conflicts in {file_paths}"
- **Agent:** Same as parent implementation
- **Context:** Conflict markers, base branch state

**Fingerprint:** `conflicts:${file_paths_hash}`

**Resolution Strategy:**
1. Pull latest base branch
2. Attempt automatic merge
3. If conflicts, create fix task
4. Bot resolves conflicts using context

---

### Condition 4: Branch Updated

**Requirement:** PR branch includes latest commits from base branch

**Evaluator:** `BranchUpdatedEvaluator`

**Blocking Issues:**
- PR branch behind base branch

**Fix Task Spawned:**
- **Type:** `fix`
- **Title:** "Update branch with latest from {base_branch}"
- **Agent:** Copilot (git operation)
- **Context:** Base branch SHA, commits behind count

**Fingerprint:** `branch_behind:${base_sha}`

**Resolution:**
- Automatic `git merge` or `git rebase`
- No code changes, just sync
- Re-run CI after update

---

### Condition 5: No Change Requests

**Requirement:** No pending change requests from reviewers

**Evaluator:** `ChangeRequestsEvaluator`

**Blocking Issues:**
- Open change requests
- Requested changes not addressed

**Fix Task Spawned:**
- **Type:** `fix`
- **Title:** "Address change request: {reviewer} - {summary}"
- **Agent:** Same as parent implementation
- **Context:** Change request details, reviewer feedback

**Fingerprint:** `change_request:${review_id}`

---

### Condition 6: Task Verification

**Requirement:** Original task's acceptance criteria met

**Evaluator:** `TaskVerificationEvaluator`

**Blocking Issues:**
- Acceptance criteria not met
- Files changed don't match task scope
- Required tests missing

**Fix Task Spawned:**
- **Type:** `fix`
- **Title:** "Complete task verification: {criterion}"
- **Agent:** Same as parent implementation
- **Context:** Acceptance criteria, current implementation

**Fingerprint:** `verification:${task_id}:${criterion_hash}`

---

### Condition 7: Copilot Review Completed

**Requirement:** GitHub Copilot automated review passed

**Evaluator:** `CopilotReviewEvaluator`

**Blocking Issues:**
- Copilot review pending
- Copilot found issues

**Fix Task Spawned:**
- **Type:** `fix`
- **Title:** "Fix Copilot review issue: {issue}"
- **Agent:** Same as parent implementation
- **Context:** Copilot review comments

**Fingerprint:** `copilot_review:${pr_number}`

---

### Condition 8: Final Validation Passed

**Requirement:** Final quality validation score ≥ 80/100

**Evaluator:** `FinalValidationEvaluator`

**Blocking Issues:**
- Accuracy issues (code doesn't match requirements)
- Entropy issues (dead code, unused imports)
- Redundancy issues (duplicate logic)
- Scope creep (changed more than necessary)

**Fix Task Spawned:**
- **Type:** `fix`
- **Title:** "Address final validation: {issue_category}"
- **Agent:** Claude (needs deep reasoning)
- **Context:** Validation report, quality issues

**Fingerprint:** `validation:${pr_number}:${attempt}`

**Escalation:** After 4 failed validation attempts, human review required

---

## Fingerprint-Based Deduplication

### Why Fingerprints?

**Problem:** Same blocking issue can be detected multiple times (e.g., on every webhook)

**Solution:** Generate unique fingerprint for each issue, only spawn task if fingerprint changes

### Fingerprint Generation

```typescript
function generateFingerprint(issue: BlockingIssue): string {
  const components = [
    issue.type,
    issue.github_ref_type,
    issue.github_ref_id,
    issue.severity
  ];
  
  return crypto.createHash('sha256')
    .update(components.join(':'))
    .digest('hex')
    .substring(0, 16);
}
```

### Deduplication Logic

```typescript
async function spawnFixTaskIfNeeded(
  prNumber: number,
  condition: string,
  issue: BlockingIssue
): Promise<string | null> {
  const fingerprint = generateFingerprint(issue);
  
  // Check if we already have active task for this fingerprint
  const existingTask = await db.get(
    `SELECT task_id FROM pr_condition_states 
     WHERE pr_number = ? 
     AND condition = ? 
     AND issue_fingerprint = ?
     AND task_status IN ('pending', 'active')`,
    [prNumber, condition, fingerprint]
  );
  
  if (existingTask) {
    return null; // Don't spawn duplicate
  }
  
  // Spawn new fix task
  const taskId = await createFixTask(prNumber, condition, issue);
  
  // Store fingerprint
  await db.run(
    `INSERT INTO pr_condition_states 
     (pr_number, condition, issue_fingerprint, task_id, task_status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [prNumber, condition, fingerprint, taskId]
  );
  
  return taskId;
}
```

---

## PR Lifecycle

### Phase 1: PR Creation

**Trigger:** Task completion creates PR

**Actions:**
1. Create branch from parent task
2. Push changes to branch
3. Open PR in GitHub
4. Register PR in `pr_metadata` table
5. Initialize condition state (all conditions: `not_ready`)

**Database State:**
```sql
INSERT INTO pr_metadata (task_id, pr_number, pr_url, branch_name, status)
VALUES ('task-123', 42, 'https://github.com/...', 'feature-123', 'open');

INSERT INTO pr_condition_states (pr_number, condition, status, last_checked)
VALUES 
  (42, 'ci_checks_passing', 'not_ready', NOW()),
  (42, 'comments_resolved', 'not_ready', NOW()),
  -- ... (8 conditions)
```

---

### Phase 2: Condition Evaluation

**Trigger:** GitHub webhook (push, check_run, pull_request_review, etc.)

**Flow:**
1. Webhook received → `PRMonitorService`
2. Identify affected PR
3. Trigger `PRConditionStateService.evaluatePR(prNumber)`
4. Evaluate all 8 conditions in parallel
5. Update condition states
6. Spawn fix tasks for unmet conditions
7. Check if all conditions met → Auto-merge

**Evaluation Locking:**
```typescript
// Prevent race conditions from concurrent webhooks
private evaluationLocks = new Map<number, Promise<void>>();

async evaluatePR(prNumber: number): Promise<void> {
  if (this.evaluationLocks.has(prNumber)) {
    await this.evaluationLocks.get(prNumber);
    return;
  }
  
  const evaluationPromise = this._evaluatePR(prNumber);
  this.evaluationLocks.set(prNumber, evaluationPromise);
  
  try {
    await evaluationPromise;
  } finally {
    this.evaluationLocks.delete(prNumber);
  }
}
```

---

### Phase 3: Fix Task Execution

**Trigger:** Unmet condition spawns fix task

**Flow:**
1. Fix task added to queue
2. Dev-bot pulls task
3. Bot analyzes issue context
4. Bot implements fix
5. Bot pushes to same PR branch
6. New commit triggers webhook
7. Conditions re-evaluated

**Chain Relationship:**
- Fix tasks inherit `chain_id` from parent implementation
- Fix tasks count against chain depth limit
- Fix tasks use same agent as parent

---

### Phase 4: Auto-Merge

**Trigger:** All 8 conditions met

**Prerequisites:**
```typescript
function canAutoMerge(conditionStates: PRConditionState): boolean {
  return Object.values(conditionStates.conditions)
    .every(c => c.status === 'met');
}
```

**Merge Strategy:**
1. Squash and merge (default)
2. Merge commit (if task metadata specifies)
3. Delete branch after merge

**Post-Merge Actions:**
1. Update PR status → `merged`
2. Complete task chain
3. Emit completion event
4. Clean up artifacts
5. Archive condition state

---

## Database Schema

### `pr_metadata`

```sql
CREATE TABLE pr_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'open', 'merged', 'closed'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  merged_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  UNIQUE(pr_number)
);
```

### `pr_condition_states`

```sql
CREATE TABLE pr_condition_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_number INTEGER NOT NULL,
  condition TEXT NOT NULL,  -- 'ci_checks_passing', 'comments_resolved', etc.
  status TEXT NOT NULL,     -- 'met', 'unmet', 'not_ready'
  issue_fingerprint TEXT,
  blocking_issues TEXT,     -- JSON array
  last_checked TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  FOREIGN KEY (pr_number) REFERENCES pr_metadata(pr_number),
  UNIQUE(pr_number, condition)
);
```

### `pr_fix_tasks`

```sql
CREATE TABLE pr_fix_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_number INTEGER NOT NULL,
  condition TEXT NOT NULL,
  issue_fingerprint TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_status TEXT NOT NULL,  -- 'pending', 'active', 'completed', 'failed'
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (pr_number) REFERENCES pr_metadata(pr_number),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  UNIQUE(pr_number, condition, issue_fingerprint)
);
```

---

## Event-Driven Updates

### GitHub Webhooks

**Subscribed Events:**
- `push` - New commits to PR branch
- `pull_request` - PR opened, closed, merged, labeled
- `pull_request_review` - Review submitted, dismissed
- `pull_request_review_comment` - Review comment created, resolved
- `check_run` - CI check started, completed
- `check_suite` - Check suite completed
- `status` - Commit status updated

**Webhook Handler:**
```typescript
async function handleGitHubWebhook(event: string, payload: any): Promise<void> {
  const prNumber = extractPRNumber(payload);
  if (!prNumber) return;
  
  // Map event to affected conditions
  const affectedConditions = getAffectedConditions(event);
  
  // Trigger evaluation
  await prConditionStateService.evaluatePR(prNumber, affectedConditions);
}

function getAffectedConditions(event: string): string[] {
  const mapping = {
    'check_run': ['ci_checks_passing'],
    'pull_request_review_comment': ['comments_resolved'],
    'push': ['no_merge_conflicts', 'branch_updated', 'task_verification'],
    'pull_request_review': ['no_change_requests', 'copilot_review_completed']
  };
  return mapping[event] || [];
}
```

### Internal Events

**PR Lifecycle Events:**
- `pr:created` - New PR opened
- `pr:updated` - PR commits updated
- `pr:condition_met` - Condition changed to met
- `pr:condition_unmet` - Condition changed to unmet
- `pr:merge_eligible` - All conditions met
- `pr:merged` - PR auto-merged
- `pr:fix_task_spawned` - Fix task created for blocking issue

---

## Partial Fix Detection

### Problem

**Scenario:** Bot partially fixes issue but doesn't fully resolve it

**Example:** CI check fails with 3 errors, bot fixes 2, 1 remains

### Solution: Fingerprint Changes

**Before Fix:** `ci_check:lint:error1+error2+error3`  
**After Fix:** `ci_check:lint:error3`  

**Outcome:** New fingerprint → new fix task spawned for remaining issue

**Implementation:**
```typescript
function generateCICheckFingerprint(check: CheckRun): string {
  const errorMessages = check.output.annotations
    .filter(a => a.annotation_level === 'failure')
    .map(a => a.message)
    .sort()
    .join('+');
  
  return `ci_check:${check.name}:${hash(errorMessages)}`;
}
```

---

## Human Escalation

### Escalation Triggers

**Automatic Escalation:**
1. **4th fix attempt fails** - Same fingerprint, 4 tasks completed, still unmet
2. **Chain depth limit** - 10 tasks in chain, still blocking
3. **Validation fails 4 times** - Final validation never reaches 80/100
4. **Manual escalation** - User clicks "Escalate to Human"

**Escalation Actions:**
1. Mark PR as `requires_human_review`
2. Create GitHub issue with summary
3. Assign to repository owner
4. Pause further automation
5. Log escalation event

**Escalation Payload:**
```typescript
interface EscalationPayload {
  prNumber: number;
  condition: string;
  issue: BlockingIssue;
  attempts: number;
  taskHistory: string[];  // IDs of failed fix tasks
  summary: string;        // AI-generated summary
  recommendedAction: string;
}
```

---

## Metrics & Monitoring

### PR Metrics

**Cycle Time:**
- PR creation → all conditions met
- PR creation → auto-merge
- Per-condition resolution time

**Success Rate:**
- Auto-merge rate (target: >80%)
- First-time condition pass rate
- Fix task success rate

**Condition Health:**
- Which conditions fail most often?
- Which require most fix attempts?
- Which escalate to humans?

### Condition Evaluator Performance

**Latency:**
- Time to evaluate each condition
- Total evaluation time (all 8 conditions)

**Accuracy:**
- False positives (marked unmet when actually met)
- False negatives (marked met when actually unmet)

---

## Configuration

### Environment Variables

**Required:**
- `GITHUB_TOKEN` - GitHub personal access token with repo permissions
- `GITHUB_WEBHOOK_SECRET` - Webhook signature validation secret

**Optional:**
- `PR_AUTO_MERGE_ENABLED` - Enable auto-merge (default: true)
- `PR_EVALUATION_DEBOUNCE_MS` - Debounce webhook events (default: 5000)
- `PR_MAX_FIX_ATTEMPTS` - Max fix attempts before escalation (default: 4)

### Merge Strategy

**Default:** Squash and merge

**Override:** Task metadata can specify:
```json
{
  "mergeStrategy": "merge_commit",
  "deleteBranchAfterMerge": true
}
```

---

## Security Considerations

### Webhook Validation

**Signature Verification:**
```typescript
function validateWebhookSignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expectedSignature}`)
  );
}
```

**Why:** Prevents malicious webhook events from triggering actions

### GitHub Token Permissions

**Required Scopes:**
- `repo` - Full repository access
- `workflow` - Trigger GitHub Actions

**Best Practice:** Use GitHub App installation token (scoped per-repository)

---

## Future Enhancements

**Planned:**
- Custom merge conditions (user-defined)
- Merge scheduling (merge during off-hours)
- Rollback detection (auto-revert if deployment fails)
- Learning from fix patterns (improve bot prompts)

**Not Planned:**
- Manual approval gates (defeats autonomy principle)
- Slack notifications (not a notification system)

---

## Related Documentation

- **Dev-Bots Architecture:** `docs/architecture/dev-bots-architecture.md`
- **Task Queue Architecture:** `docs/architecture/task-queue-architecture.md`
- **Error Recovery Design:** `docs/technicalDesigns/error-detection-and-recovery-design.md`
- **PR Sync Service Design:** `docs/technicalDesigns/pr-sync-service.md`
