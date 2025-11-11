# Continuous PR Self-Healing - Implementation Roadmap

**Version**: 1.0
**Created**: 2025-11-10
**Reference**: See [CONTINUOUS_PR_SELF_HEALING.md](./CONTINUOUS_PR_SELF_HEALING.md) for complete design

## Quick Overview

### What's Changing

**Current System** (One-time evaluation):
```
PR → Check Status → Spawn Task → Hope it fixes everything
```

**New System** (Continuous monitoring):
```
PR → Event → Evaluate ALL Conditions → Spawn Missing Tasks
     ↓
Event → Re-evaluate → Detect Changes → Spawn/Complete Tasks
     ↓
Event → Re-evaluate → Detect Partial Fixes → Spawn New Tasks
     ↓
... (until ALL conditions met) → Auto-Merge
```

### Key Concepts

1. **6 Merge Conditions** (ALL must be met):
   - CI checks passing
   - No unresolved comments
   - No merge conflicts
   - Branch up-to-date
   - No change requests
   - Task verification passed

2. **Condition State Tracking**:
   - Each PR has a `PRConditionState` object
   - Tracks which conditions are met/unmet
   - Tracks active fix tasks for each condition
   - Stores issue fingerprints to detect changes

3. **Event-Driven Re-evaluation**:
   - Every webhook event triggers condition re-evaluation
   - Different events check different conditions
   - System spawns tasks for NEW/changed issues only

4. **Duplicate Prevention**:
   - Issue fingerprinting (hash of failing tests, comments, etc.)
   - Never spawn task if one exists for same fingerprint
   - Auto-cleanup when tasks complete

5. **Partial Fix Handling**:
   - Detect when fix resolves SOME but not ALL issues
   - Example: 3 tests failing → fix → 1 still failing
   - Spawn new task for remaining issues

---

## Integration Strategy

**IMPORTANT**: We're NOT building a parallel system! This design extends existing infrastructure elegantly.

### Existing Services We Use (No Changes Needed!)

1. **Task Queue** (`taskQueue.sqlite.ts`):
   - ✅ Already has `followup_for_pr`, `pr_branch` fields
   - ✅ Use existing `createTask()` method
   - ✅ Task types already support classification

2. **Agent Selection** (`agentSelector.ts`):
   - ✅ Already routes tasks intelligently
   - ✅ Codex for analysis/review/documentation
   - ✅ Claude for implementation/refactoring
   - ✅ NO custom agent selection needed!

3. **Webhook Handlers** (`githubWebhookHandler.service.ts`):
   - ✅ Already handles PR events
   - ✅ Just add condition evaluation calls
   - ✅ Existing error handling, logging

4. **Task Completion** (`taskCompletion.service.ts`):
   - ✅ Already has quality gates, verification
   - ✅ Just add condition state update
   - ✅ Existing completion hooks

5. **PR Monitoring** (`prMonitor.service.ts`, `githubPR.service.ts`):
   - ✅ Already fetches PR data
   - ✅ Already has merge logic
   - ✅ Use existing services, don't duplicate!

### What We're Adding

**New Components**:
- 1 database table: `pr_condition_states`
- 1 service file: `prConditionState.service.ts`
- 3 webhook extensions: One-liner calls in existing handlers
- 1 task completion hook: if-block in existing service

**Integration Points**:
- Webhook handlers call condition evaluator
- Condition evaluator spawns tasks via existing task queue
- Task completion triggers condition re-evaluation
- AgentSelector routes all tasks (including validation)

### Implementation Approach

Each phase extends an existing service:

- **Phase 1**: New service + database (standalone)
- **Phase 2**: Implement condition evaluators (uses existing GitHub API service)
- **Phase 3**: Task spawning (uses existing task queue)
- **Phase 4**: Extend webhook handlers (3 one-liners)
- **Phase 5**: Copilot review detection (extends condition evaluator)
- **Phase 6**: Validation tasks (uses existing task queue + agent selector)

**Zero Disruption**: Each phase is backward compatible and additive.

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

**File to Create**: `src/services/prConditionState.service.ts`

#### 1.1 Database Migration

```sql
-- File: backend/migrations/007_pr_condition_states.sql

CREATE TABLE IF NOT EXISTS pr_condition_states (
  pr_number INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,
  last_evaluated INTEGER NOT NULL,
  last_updated INTEGER NOT NULL,
  merge_eligible BOOLEAN NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_pr_condition_states_last_evaluated
  ON pr_condition_states(last_evaluated);
CREATE INDEX idx_pr_condition_states_merge_eligible
  ON pr_condition_states(merge_eligible);

CREATE TABLE IF NOT EXISTS pr_condition_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_number INTEGER NOT NULL,
  condition_id TEXT NOT NULL,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  old_fingerprint TEXT,
  new_fingerprint TEXT,
  webhook_event TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (pr_number) REFERENCES pr_condition_states(pr_number)
);

CREATE INDEX idx_pr_condition_history_pr ON pr_condition_history(pr_number);
CREATE INDEX idx_pr_condition_history_timestamp ON pr_condition_history(timestamp);
```

#### 1.2 Core Service Skeleton

```typescript
// src/services/prConditionState.service.ts

export interface PRConditionState {
  pr_number: number;
  last_evaluated: number;
  last_updated: number;

  conditions: {
    ci_checks_passing: ConditionStatus;
    comments_resolved: ConditionStatus;
    no_merge_conflicts: ConditionStatus;
    branch_updated: ConditionStatus;
    no_change_requests: ConditionStatus;
    task_verification: ConditionStatus;
  };

  active_fix_tasks: {
    [condition_id: string]: ActiveFixTask[];
  };

  condition_history: ConditionChange[];
}

export interface ConditionStatus {
  id: string;
  status: 'met' | 'unmet' | 'evaluating';
  last_checked: number;
  issue_fingerprint: string;
  blocking_issues: any[];
  task_spawned: boolean;
}

export interface ActiveFixTask {
  task_id: string;
  created_at: number;
  issue_fingerprint: string;
}

export class PRConditionStateService {
  constructor(private db: DatabaseConnection) {}

  async initializePRConditionState(prNumber: number): Promise<PRConditionState> {
    // TODO: Implementation
  }

  async loadPRConditionState(prNumber: number): Promise<PRConditionState | null> {
    // TODO: Implementation
  }

  async savePRConditionState(state: PRConditionState): Promise<void> {
    // TODO: Implementation
  }

  async evaluateCondition(prNumber: number, conditionId: string): Promise<ConditionEvaluation> {
    // TODO: Implementation
  }

  allConditionsMet(state: PRConditionState): boolean {
    return Object.values(state.conditions).every(c => c.status === 'met');
  }
}
```

#### 1.3 Condition Evaluators

Each condition needs an evaluator function:

```typescript
// In PRConditionStateService class:

async evaluateCIChecksCondition(prNumber: number): Promise<ConditionEvaluation> {
  const prStatus = await this.githubPR.getPRStatus(prNumber);

  const failedChecks = prStatus.checks.filter(c =>
    c.status === 'failure' || c.status === 'error'
  );

  const fingerprint = this.generateCIChecksFingerprint(failedChecks);

  return {
    condition_id: 'ci_checks_passing',
    status: failedChecks.length === 0 ? 'met' : 'unmet',
    fingerprint,
    blocking_issues: failedChecks.map(c => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
      detailsUrl: c.detailsUrl
    }))
  };
}

private generateCIChecksFingerprint(failedChecks: PRCheckStatus[]): string {
  const checkNames = failedChecks.map(c => c.name).sort();
  return crypto.createHash('sha256').update(checkNames.join('|')).digest('hex');
}
```

Implement similar evaluators for all 6 conditions.

#### 1.4 Testing

```typescript
// src/services/prConditionState.service.test.ts

describe('PRConditionStateService', () => {
  it('should initialize condition state for new PR', async () => {
    const state = await service.initializePRConditionState(96);
    expect(state.pr_number).toBe(96);
    expect(state.conditions.ci_checks_passing.status).toBe('evaluating');
  });

  it('should detect failing CI checks', async () => {
    const evaluation = await service.evaluateCIChecksCondition(96);
    expect(evaluation.status).toBe('unmet');
    expect(evaluation.blocking_issues.length).toBeGreaterThan(0);
  });

  it('should generate consistent fingerprints', () => {
    const checks1 = [{ name: 'Test A' }, { name: 'Test B' }];
    const checks2 = [{ name: 'Test B' }, { name: 'Test A' }]; // Different order

    const fp1 = service.generateCIChecksFingerprint(checks1);
    const fp2 = service.generateCIChecksFingerprint(checks2);

    expect(fp1).toBe(fp2); // Should be same (sorted)
  });
});
```

---

### Phase 2: Event-Driven Spawning (Week 2)

**Files to Modify**:
- `src/services/githubWebhookHandler.service.ts`
- `src/services/prMonitor.service.ts`

#### 2.1 Refactor Webhook Handler

```typescript
// src/services/githubWebhookHandler.service.ts

export class GitHubWebhookHandler {
  constructor(
    private taskQueue: TaskQueueService,
    private prMonitor: PRMonitorService,
    private conditionState: PRConditionStateService, // NEW
    private reviewCommentTracker: ReviewCommentTracker
  ) {}

  async handleCheckSuiteCompleted(payload: GitHubCheckSuitePayload) {
    const prNumber = extractPRNumber(payload);

    // 1. Load condition state
    const state = await this.conditionState.loadPRConditionState(prNumber);
    if (!state) {
      logger.warn('No condition state for PR - initializing');
      await this.conditionState.initializePRConditionState(prNumber);
    }

    // 2. Evaluate CI checks condition
    const ciEvaluation = await this.conditionState.evaluateCIChecksCondition(prNumber);

    // 3. Compare with previous state
    const previousFingerprint = state.conditions.ci_checks_passing.issue_fingerprint;
    const fingerprintChanged = ciEvaluation.fingerprint !== previousFingerprint;

    if (ciEvaluation.status === 'unmet') {
      // Checks failed

      if (fingerprintChanged) {
        // Issues changed - check for partial fix
        const partialFix = await this.detectPartialFix(
          prNumber,
          'ci_checks_passing',
          state.conditions.ci_checks_passing,
          ciEvaluation
        );

        if (partialFix.isPartialFix) {
          logger.info('Partial fix detected', partialFix);
        }
      }

      // Spawn task if needed
      await this.spawnTaskIfNeeded(prNumber, 'ci_checks_passing', ciEvaluation);

    } else {
      // Checks passed - mark tasks complete
      await this.markConditionTasksComplete(prNumber, 'ci_checks_passing');
    }

    // 4. Re-evaluate ALL conditions
    await this.evaluateAndSpawnForAllConditions(prNumber);

    // 5. Attempt merge if all conditions met
    if (this.conditionState.allConditionsMet(state)) {
      await this.prMonitor.mergePR(prNumber);
    }
  }
}
```

#### 2.2 Task Spawning Logic

```typescript
// In GitHubWebhookHandler

async spawnTaskIfNeeded(
  prNumber: number,
  conditionId: string,
  evaluation: ConditionEvaluation
): Promise<Task | null> {
  const state = await this.conditionState.loadPRConditionState(prNumber);

  // Check for active task with same fingerprint
  const activeTasks = state.active_fix_tasks[conditionId] || [];
  const hasActiveTask = activeTasks.some(task => {
    const taskObj = this.taskQueue.getTask(task.task_id);
    return taskObj &&
           taskObj.status !== 'completed' &&
           taskObj.status !== 'failed' &&
           task.issue_fingerprint === evaluation.fingerprint;
  });

  if (hasActiveTask) {
    logger.info('Active task exists for this fingerprint - skipping spawn');
    return null;
  }

  // Spawn task
  logger.info(`Spawning task for ${conditionId}`);
  return await this.prMonitor.spawnTaskForCondition(prNumber, conditionId, evaluation);
}
```

#### 2.3 Partial Fix Detection

```typescript
async detectPartialFix(
  prNumber: number,
  conditionId: string,
  oldCondition: ConditionStatus,
  newEvaluation: ConditionEvaluation
): Promise<PartialFixResult> {
  // Still unmet?
  if (newEvaluation.status === 'met') {
    return { isPartialFix: false, reason: 'Fully fixed' };
  }

  // Fingerprint changed?
  if (oldCondition.issue_fingerprint === newEvaluation.fingerprint) {
    return { isPartialFix: false, reason: 'Issues unchanged' };
  }

  // Fewer issues?
  const oldCount = oldCondition.blocking_issues.length;
  const newCount = newEvaluation.blocking_issues.length;

  if (newCount >= oldCount) {
    return { isPartialFix: false, reason: 'Issue count increased' };
  }

  // Partial fix!
  return {
    isPartialFix: true,
    old_count: oldCount,
    new_count: newCount,
    fixed_count: oldCount - newCount,
    progress: `${oldCount - newCount}/${oldCount} issues fixed`
  };
}
```

---

### Phase 3: Continuous Re-evaluation (Week 3)

#### 3.1 Task Completion Hook

```typescript
// In task executor or webhook handler

async onTaskComplete(taskId: string) {
  const task = this.taskQueue.getTask(taskId);

  if (!task.followup_for_pr) return;

  const prNumber = task.followup_for_pr;

  // Remove from active tasks
  const state = await this.conditionState.loadPRConditionState(prNumber);
  for (const [conditionId, tasks] of Object.entries(state.active_fix_tasks)) {
    state.active_fix_tasks[conditionId] = tasks.filter(t => t.task_id !== taskId);
  }
  await this.conditionState.savePRConditionState(state);

  // Trigger re-evaluation
  logger.info('Task completed - re-evaluating PR conditions');
  await this.evaluateAndSpawnForAllConditions(prNumber);
}
```

#### 3.2 Re-evaluate All Conditions

```typescript
async evaluateAndSpawnForAllConditions(prNumber: number) {
  const state = await this.conditionState.loadPRConditionState(prNumber);

  // Evaluate each condition
  const conditionIds = [
    'ci_checks_passing',
    'comments_resolved',
    'no_merge_conflicts',
    'branch_updated',
    'no_change_requests',
    'task_verification'
  ];

  for (const conditionId of conditionIds) {
    const evaluation = await this.conditionState.evaluateCondition(prNumber, conditionId);

    // Update state
    state.conditions[conditionId] = {
      id: conditionId,
      status: evaluation.status,
      last_checked: Date.now(),
      issue_fingerprint: evaluation.fingerprint,
      blocking_issues: evaluation.blocking_issues,
      task_spawned: false
    };

    // Spawn task if needed
    if (evaluation.status === 'unmet') {
      await this.spawnTaskIfNeeded(prNumber, conditionId, evaluation);
    }
  }

  // Save updated state
  await this.conditionState.savePRConditionState(state);

  // Check merge eligibility
  if (this.conditionState.allConditionsMet(state)) {
    logger.info('All conditions met - attempting merge');
    await this.prMonitor.mergePR(prNumber);
  }
}
```

---

### Phase 4: Observability (Week 4)

#### 4.1 API Endpoint

```typescript
// src/routes/prConditions.routes.ts

router.get('/api/pr-conditions/:prNumber', async (req, res) => {
  const prNumber = parseInt(req.params.prNumber);
  const state = await conditionStateService.loadPRConditionState(prNumber);

  if (!state) {
    return res.status(404).json({ error: 'PR not found' });
  }

  // Transform for UI
  const response = {
    pr_number: prNumber,
    merge_eligible: conditionStateService.allConditionsMet(state),
    last_evaluated: new Date(state.last_evaluated).toISOString(),

    conditions: Object.entries(state.conditions).map(([id, condition]) => ({
      id,
      status: condition.status,
      blocking_issues_count: condition.blocking_issues.length,
      blocking_issues: condition.blocking_issues,
      active_tasks: state.active_fix_tasks[id]?.length || 0
    })),

    active_tasks_total: Object.values(state.active_fix_tasks).flat().length,

    history: state.condition_history.slice(-10) // Last 10 changes
  };

  res.json(response);
});
```

#### 4.2 Metrics

```typescript
// Add to webhook handler

this.metrics = {
  condition_evaluations: new Counter({
    name: 'pr_conditions_evaluated_total',
    help: 'Total PR condition evaluations',
    labelNames: ['condition_id', 'status']
  }),

  tasks_spawned: new Counter({
    name: 'pr_tasks_spawned_total',
    help: 'Total fix tasks spawned',
    labelNames: ['condition_id']
  }),

  tasks_spawn_skipped: new Counter({
    name: 'pr_tasks_spawn_skipped_duplicate',
    help: 'Task spawns skipped due to duplicate prevention',
    labelNames: ['condition_id']
  }),

  partial_fixes: new Counter({
    name: 'pr_partial_fixes_detected_total',
    help: 'Partial fixes detected',
    labelNames: ['condition_id']
  })
};
```

---

### Phase 5: Copilot Review Detection (Week 5)

**Goal**: Ensure all PRs are reviewed by Copilot before merge

#### 5.1 Copilot Review Evaluator

```typescript
// In PRConditionStateService

async evaluateCopilotReviewCondition(prNumber: number): Promise<ConditionEvaluation> {
  const prStatus = await this.github.getPRStatus(prNumber);

  // Check for Copilot reviews
  const copilotReviews = prStatus.reviews.filter(review =>
    review.author.toLowerCase().includes('copilot') ||
    review.author.toLowerCase().includes('github-advanced-security')
  );

  const hasCopilotReview = copilotReviews.length > 0;

  // Check how long ago PR was opened/updated
  const prCreatedAt = prStatus.createdAt;
  const prUpdatedAt = prStatus.updatedAt;
  const now = Date.now();
  const minutesSinceUpdate = (now - new Date(prUpdatedAt).getTime()) / 60000;

  return {
    condition_id: 'copilot_review_completed',
    status: hasCopilotReview ? 'met' : 'unmet',
    fingerprint: hasCopilotReview ? 'copilot-reviewed' : 'awaiting-copilot',
    blocking_issues: hasCopilotReview ? [] : [{
      reason: 'Copilot has not reviewed PR yet',
      minutes_elapsed: minutesSinceUpdate
    }]
  };
}
```

#### 5.2 Waiting Strategy

```typescript
// In webhook handler

async handleCopilotReviewWaiting(prNumber: number) {
  const evaluation = await this.conditionState.evaluateCopilotReviewCondition(prNumber);

  if (evaluation.status === 'unmet') {
    const minutesElapsed = evaluation.blocking_issues[0].minutes_elapsed;

    if (minutesElapsed > 60) {
      // Over 1 hour - create notification task
      logger.warn('Copilot review pending > 1 hour', { pr_number: prNumber });

      await this.taskQueue.createTask({
        title: `Copilot review pending for PR #${prNumber}`,
        description: `
Copilot has not reviewed PR #${prNumber} for over 1 hour.

**Actions**:
1. Check if Copilot review is enabled in repository settings
2. Manually request review from Copilot via PR interface
3. Investigate if there's an issue with GitHub Copilot integration

PR URL: ${this.github.getPRUrl(prNumber)}
        `.trim(),
        type: 'manual-intervention',
        priority: 6,
        assigned_agent: 'human'
      });
    } else if (minutesElapsed > 30) {
      // Log warning
      logger.warn('Copilot review pending > 30 minutes', { pr_number: prNumber });
    }
  }
}
```

#### 5.3 Testing

```typescript
describe('Copilot Review Condition', () => {
  it('should detect Copilot review when present', async () => {
    const evaluation = await service.evaluateCopilotReviewCondition(96);
    expect(evaluation.status).toBe('met');
  });

  it('should wait for Copilot review', async () => {
    const evaluation = await service.evaluateCopilotReviewCondition(97);
    expect(evaluation.status).toBe('unmet');
    expect(evaluation.blocking_issues[0].reason).toContain('not reviewed');
  });

  it('should create notification after 1 hour', async () => {
    // Mock PR updated 61 minutes ago
    await handler.handleCopilotReviewWaiting(98);
    const tasks = await taskQueue.findByType('manual-intervention');
    expect(tasks.some(t => t.title.includes('Copilot review pending'))).toBe(true);
  });
});
```

**Deliverables**:
- Copilot review detection logic
- Waiting/timeout strategy
- Notification tasks for delayed reviews
- Tests

---

### Phase 6: Final Validation via Task Spawning (Week 6)

**Goal**: AI-powered comprehensive review before merge (via task system)

**Key Insight**: Validation is NOT a direct API call - it's a TASK that gets spawned when all other conditions are met. The agent selector chooses the best agent (Codex, Claude, specialized reviewer).

#### 6.1 Final Validation Condition Evaluator

```typescript
// In PRConditionStateService

async evaluateFinalValidationCondition(prNumber: number): Promise<ConditionEvaluation> {
  // First check if all OTHER conditions are met
  const state = await this.loadPRConditionState(prNumber);

  const otherConditions = [
    'ci_checks_passing',
    'comments_resolved',
    'no_merge_conflicts',
    'branch_updated',
    'no_change_requests',
    'task_verification',
    'copilot_review_completed'
  ];

  const allOtherConditionsMet = otherConditions.every(
    id => state.conditions[id].status === 'met'
  );

  if (!allOtherConditionsMet) {
    return {
      condition_id: 'final_validation_passed',
      status: 'not_ready',
      fingerprint: 'waiting-for-other-conditions',
      blocking_issues: []
    };
  }

  // All other conditions met - check validation state
  const validationState = await this.getValidationState(prNumber);

  // Check if validation passed
  if (validationState.passed) {
    return {
      condition_id: 'final_validation_passed',
      status: 'met',
      fingerprint: 'validation-passed',
      blocking_issues: []
    };
  }

  // Check if escalated to human
  if (validationState.human_escalation_triggered) {
    return {
      condition_id: 'final_validation_passed',
      status: 'unmet',
      fingerprint: 'escalated-to-human',
      blocking_issues: [{
        type: 'human_review_required',
        reason: 'Failed validation twice - manual review required'
      }]
    };
  }

  // Needs validation task
  return {
    condition_id: 'final_validation_passed',
    status: 'unmet',
    fingerprint: `validation-needed-attempt-${validationState.attempts}`,
    blocking_issues: [{
      type: 'needs_comprehensive_review',
      reason: 'All conditions met, needs final validation review'
    }]
  };
}
```

#### 6.2 Validation Task Spawning

```typescript
// In task spawning logic

async spawnValidationTask(prNumber: number, prContext: PRContext) {
  const validationState = await this.getValidationState(prNumber);

  // Increment attempt count
  validationState.attempts++;
  await this.saveValidationState(prNumber, validationState);

  // Build validation prompt
  const validationPrompt = this.buildValidationPrompt(prContext);

  // Spawn TASK (not direct API call!)
  const task = await this.taskQueue.createTask({
    title: `Comprehensive validation review for PR #${prNumber}`,
    description: validationPrompt,
    type: 'pr-validation', // Special task type
    priority: 9, // Critical - blocking merge
    followup_for_pr: prNumber,
    pr_branch: prContext.pr_branch,
    metadata: {
      validation_attempt: validationState.attempts,
      pr_number: prNumber,
      pr_diff_url: `https://github.com/${prContext.repo}/pull/${prNumber}.diff`,
      parent_task_id: prContext.task_id,
      task_acceptance_criteria: prContext.task.acceptance_criteria
    }
  });

  logger.info({
    category: 'pr-workflow',
    action: 'validation_task_spawned',
    message: `Spawned validation task for PR #${prNumber}`,
    details: {
      pr_number: prNumber,
      task_id: task.id,
      validation_attempt: validationState.attempts
    }
  });

  return task;
}

private buildValidationPrompt(prContext: PRContext): string {
  return `
# Comprehensive Validation Review for PR #${prContext.pr_number}

**PR Title**: ${prContext.title}
**Task**: ${prContext.task.title}
**Task ID**: ${prContext.task.id}

## Acceptance Criteria
${prContext.task.acceptance_criteria.map((c, i) => `${i+1}. ${c}`).join('\n')}

## PR Changes
View full diff: ${prContext.pr_diff_url}

## Validation Dimensions

Evaluate the PR across 6 dimensions and provide a score (0-100) for each:

### 1. Accuracy (0-100)
Does the implementation accurately match the requirements and acceptance criteria?
- Are all acceptance criteria satisfied?
- Does the implementation do what it claims to do?
- Are edge cases handled correctly?

### 2. Entropy (0-100)
Is the code clean, well-structured, and maintainable?
- Clear naming conventions?
- Appropriate abstraction levels?
- Low cyclomatic complexity?
- Good separation of concerns?

### 3. Redundancy (0-100)
Is there any duplicate code or logic?
- DRY principle followed?
- Shared logic extracted to utilities?
- No copy-paste code patterns?

### 4. Scope Creep (0-100)
Are changes within the task scope?
- No unrelated features added?
- No unnecessary refactoring beyond task requirements?
- Focused on the specific task at hand?

### 5. Requirements (0-100)
Are all requirements truly satisfied?
- Each acceptance criterion met?
- No requirements partially implemented?
- Quality standards maintained?

### 6. Code Quality (0-100)
Does the code follow best practices?
- Language idioms followed?
- Security best practices?
- Performance considerations?
- Error handling appropriate?

## Output Format

Provide validation results in the following format:

**Overall Score**: X/100 (average of all dimensions)

**Passed**: YES/NO (≥80 required to pass)

**Dimension Scores**:
- Accuracy: X/100
- Entropy: X/100
- Redundancy: X/100
- Scope Creep: X/100
- Requirements: X/100
- Code Quality: X/100

**Issues Found**: (if score < 80)
- [Dimension] [Severity]: Description (file:line if applicable)
- ...

**Recommendation**: PASS / FIX_REQUIRED / ESCALATE

## Task Completion

If validation passes (≥80):
- Update task verification data with score and results
- Mark this task as completed

If validation fails (< 80):
- Document all issues found
- Create a NEW task to fix the validation issues
- Include specific file:line references in the fix task
  `.trim();
}
```

#### 6.3 Validation Task Completion Handler

```typescript
// Hook when pr-validation task completes

async handleValidationTaskCompletion(taskId: string, taskResult: TaskResult) {
  const task = await this.taskQueue.getTask(taskId);
  const prNumber = task.metadata.pr_number;
  const validationAttempt = task.metadata.validation_attempt;

  // Parse validation result from task verification data
  const validationResult = this.parseValidationResult(taskResult.verification_data);

  // Update validation state
  const validationState = await this.getValidationState(prNumber);
  validationState.validation_history.push({
    attempt_number: validationAttempt,
    timestamp: Date.now(),
    score: validationResult.score,
    issues_found: validationResult.issues,
    task_id: taskId
  });
  validationState.last_validation_score = validationResult.score;
  validationState.passed = validationResult.score >= 80;

  await this.saveValidationState(prNumber, validationState);

  if (validationResult.score >= 80) {
    // PASSED! Update condition state
    logger.info({
      category: 'pr-workflow',
      action: 'validation_passed',
      message: `PR #${prNumber} passed validation (score: ${validationResult.score})`,
      details: { pr_number: prNumber, score: validationResult.score }
    });

    // Trigger condition re-evaluation → will detect all conditions met → attempt merge
    await this.handlePRConditionChange(prNumber);
  } else {
    // FAILED - check attempt count
    if (validationAttempt >= 2) {
      // ESCALATE TO HUMAN
      await this.escalateValidationFailure(prNumber, validationState);
    } else {
      // Spawn fix task
      await this.spawnValidationFixTask(prNumber, validationResult);
    }
  }
}

async spawnValidationFixTask(prNumber: number, validationResult: ValidationResult) {
  const issuesList = validationResult.issues
    .map(i => `- [${i.severity}] ${i.category}: ${i.description}${i.file ? ` (${i.file}:${i.line})` : ''}`)
    .join('\n');

  await this.taskQueue.createTask({
    title: `Fix validation issues in PR #${prNumber}`,
    description: `
Validation review found issues (score: ${validationResult.score}/100, threshold: 80):

${issuesList}

**Required Actions**:
1. Address each issue listed above
2. Make changes to the PR branch
3. Push changes (will trigger re-validation)

**Important**: Work from existing PR branch, do NOT create new PR.
    `,
    type: 'refactoring',
    priority: 9,
    followup_for_pr: prNumber,
    pr_branch: task.metadata.pr_branch,
    parent_task_id: task.id
  });
}

async escalateValidationFailure(prNumber: number, validationState: ValidationState) {
  validationState.human_escalation_triggered = true;
  await this.saveValidationState(prNumber, validationState);

  await this.taskQueue.createTask({
    title: `HUMAN REVIEW REQUIRED: PR #${prNumber} failed validation twice`,
    description: `
PR #${prNumber} has failed comprehensive validation ${validationState.attempts} times.

**Validation History**:
${validationState.validation_history.map(v =>
  `- Attempt ${v.attempt_number}: Score ${v.score}/100 (${v.score >= 80 ? 'PASS' : 'FAIL'})`
).join('\n')}

**Latest Issues**:
${validationState.validation_history[validationState.attempts - 1].issues_found.map(i =>
  `- [${i.severity}] ${i.category}: ${i.description}`
).join('\n')}

**Action Required**: Manual review to determine if:
1. Validation is accurate → PR needs more work
2. Validation has false positives → Override and merge manually
3. PR should be closed → Not meeting quality standards

**DO NOT MERGE** without explicit human approval.
    `,
    type: 'manual-intervention',
    priority: 10,
    assigned_agent: 'human',
    followup_for_pr: prNumber
  });

  // Mark PR with labels
  await this.github.updatePRLabels(prNumber, ['human-review-required', 'do-not-merge']);

  logger.error({
    category: 'pr-workflow',
    action: 'validation_escalated',
    message: `PR #${prNumber} escalated to human after ${validationState.attempts} validation failures`,
    details: {
      pr_number: prNumber,
      validation_history: validationState.validation_history
    }
  });
}
```

#### 6.4 Testing

```typescript
describe('Final Validation Task Spawning', () => {
  it('should spawn validation task when all other conditions met', async () => {
    // Set up: all other conditions met
    await setAllOtherConditionsMet(96);

    // Trigger evaluation
    await conditionState.evaluateConditions(96);

    // Verify validation task spawned
    const tasks = await taskQueue.findByType('pr-validation');
    expect(tasks.some(t => t.metadata.pr_number === 96)).toBe(true);
  });

  it('should not spawn validation task if other conditions unmet', async () => {
    // Set up: CI checks failing
    await setCIChecksFailing(96);

    await conditionState.evaluateConditions(96);

    const tasks = await taskQueue.findByType('pr-validation');
    expect(tasks.some(t => t.metadata.pr_number === 96)).toBe(false);
  });

  it('should spawn fix task on validation failure', async () => {
    const validationResult = { score: 65, passed: false, issues: [...] };

    await handler.handleValidationTaskCompletion(taskId, {
      verification_data: validationResult
    });

    const fixTasks = await taskQueue.findByType('refactoring');
    expect(fixTasks.some(t => t.title.includes('Fix validation issues'))).toBe(true);
  });

  it('should escalate after 2 validation failures', async () => {
    // Fail validation twice
    await failValidation(96, 70);
    await failValidation(96, 65);

    const state = await conditionState.getValidationState(96);
    expect(state.human_escalation_triggered).toBe(true);

    const escalationTasks = await taskQueue.findByType('manual-intervention');
    expect(escalationTasks.some(t => t.title.includes('HUMAN REVIEW REQUIRED'))).toBe(true);
  });

  it('should attempt merge when validation passes', async () => {
    const validationResult = { score: 85, passed: true, issues: [] };

    await handler.handleValidationTaskCompletion(taskId, {
      verification_data: validationResult
    });

    // Should trigger merge attempt
    const pr = await github.getPR(96);
    expect(pr.merged).toBe(true);
  });
});
```

**Deliverables**:
- Validation condition evaluator
- Task spawning logic (NOT direct API calls)
- Validation task prompt builder
- Task completion handler
- Fix task spawning
- Escalation logic with human tasks
- Tests

---

## Getting Started - First Steps

### Step 1: Review Design Document

Read the complete design: [CONTINUOUS_PR_SELF_HEALING.md](./CONTINUOUS_PR_SELF_HEALING.md)

Key sections to understand:
- Merge Conditions (what blocks merge)
- PR Condition State Machine (data model)
- Event-Driven Spawning (when tasks are created)
- Duplicate Prevention (how we avoid duplicate tasks)
- Partial Fix Handling (how we handle partial fixes)

### Step 2: Create Database Migration

```bash
cd backend
# Create migration file
touch migrations/007_pr_condition_states.sql
# Add SQL from Phase 1.1
```

### Step 3: Implement Core Service

```bash
# Create new service file
touch src/services/prConditionState.service.ts
# Implement skeleton from Phase 1.2
```

### Step 4: Write Tests

```bash
# Create test file
touch src/services/prConditionState.service.test.ts
# Add tests from Phase 1.4
```

### Step 5: Run Migration

```bash
npm run migrate
# Verify tables created
sqlite3 tasks.db ".schema pr_condition_states"
```

---

## Testing Strategy

### Unit Tests

Test each condition evaluator independently:

```typescript
describe('evaluateCIChecksCondition', () => {
  it('should return met when all checks pass');
  it('should return unmet when any check fails');
  it('should generate fingerprint based on failing check names');
  it('should detect fingerprint change when different tests fail');
});
```

### Integration Tests

Test event-driven workflow:

```typescript
describe('Continuous PR Workflow', () => {
  it('should spawn task on first check failure');
  it('should not spawn duplicate task on re-evaluation');
  it('should detect partial fix and spawn new task');
  it('should attempt merge when all conditions met');
});
```

### E2E Tests

Test complete PR lifecycle:

```typescript
describe('PR Lifecycle E2E', () => {
  it('should handle PR from creation to merge', async () => {
    // 1. Create PR → initialize state
    // 2. Checks fail → spawn fix task
    // 3. Partial fix → spawn new task
    // 4. All fixed → merge
  });
});
```

---

## Migration from Current System

### Compatibility

New system is **backward compatible**:
- Existing webhook handlers continue to work
- New condition evaluation runs alongside
- Gradual migration per condition

### Migration Steps

1. **Phase 1**: Deploy core infrastructure (DB, service)
   - No behavioral changes yet
   - Just tracking state

2. **Phase 2**: Enable condition evaluation
   - Log evaluations but don't spawn tasks
   - Verify fingerprints work correctly

3. **Phase 3**: Enable task spawning for ONE condition
   - Start with `ci_checks_passing`
   - Monitor for duplicates
   - Verify partial fix detection

4. **Phase 4**: Enable all conditions
   - Roll out remaining conditions
   - Monitor metrics

5. **Phase 5**: Deprecate old logic
   - Remove old `shouldCreateFollowup` logic
   - Fully event-driven

---

## Success Criteria

System is successful when:

1. **Zero Duplicate Tasks**: No tasks spawned for same fingerprint
2. **Partial Fixes Handled**: 100% of partial fixes spawn new tasks
3. **Continuous Re-evaluation**: Every webhook event re-checks conditions
4. **Merge Only When Perfect**: 0 merges with unmet conditions
5. **Copilot Review Required**: 100% of PRs have Copilot review before merge (even if 0 comments)
6. **Final Validation Required**: 100% of PRs pass AI validation (score ≥80) before merge
7. **Escalation Works**: PRs failing validation twice are flagged for human review
8. **Observable State**: Can view condition state via API
9. **Fast Response**: < 5 seconds from webhook to task spawn
10. **No False Positives**: Validation accurately identifies real issues, < 10% false positives

---

## Next Actions

1. **Review design document** with team
2. **Create database migration**
3. **Implement `PRConditionStateService` skeleton**
4. **Write condition evaluator tests**
5. **Deploy Phase 1 to staging**

Questions? See [CONTINUOUS_PR_SELF_HEALING.md](./CONTINUOUS_PR_SELF_HEALING.md) for complete details.
