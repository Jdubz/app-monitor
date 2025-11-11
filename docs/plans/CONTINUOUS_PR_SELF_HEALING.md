# Continuous PR Self-Healing Workflow - Comprehensive Design

**Version**: 2.0
**Status**: Design Phase
**Created**: 2025-11-10
**Owner**: PR Workflow Team

## Executive Summary

This document defines a **continuous, event-driven PR monitoring and self-healing system** that ensures PRs are NEVER merged unless ALL quality conditions are satisfied. The system continuously monitors each PR, spawning condition-specific fix tasks until all blocking issues are resolved.

### Core Principles

1. **Never Merge Unless Perfect**: Auto-merge ONLY when ALL conditions are satisfied simultaneously
2. **Continuous Monitoring**: Every webhook event triggers complete condition re-evaluation
3. **Condition-Specific Tasks**: Each unmet condition spawns a dedicated fix task
4. **Duplicate Prevention**: Never spawn multiple tasks for the same issue
5. **Partial Fix Handling**: If a fix resolves some but not all issues, spawn new task for remaining
6. **Event-Driven Spawning**: Different webhook types trigger different evaluation logic

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Integration with Existing Systems](#integration-with-existing-systems)
3. [Merge Conditions](#merge-conditions)
4. [PR Condition State Machine](#pr-condition-state-machine)
5. [Issue Tracking & Fingerprinting](#issue-tracking--fingerprinting)
6. [Event-Driven Spawning](#event-driven-spawning)
7. [Task Spawning Logic](#task-spawning-logic)
8. [Duplicate Prevention](#duplicate-prevention)
9. [Partial Fix Handling](#partial-fix-handling)
10. [Data Model](#data-model)
11. [Implementation Plan](#implementation-plan)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Webhook Events                        │
│  pull_request | check_suite | check_run | pull_request_review   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Event Router & Dispatcher                      │
│  • Identifies PR number                                          │
│  • Routes to appropriate handler                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                 PR Condition Evaluator (CORE)                    │
│  • Fetches current PR state from GitHub                         │
│  • Evaluates ALL merge conditions                               │
│  • Compares against previous state                              │
│  • Identifies new/resolved/changed issues                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                   ┌────────┴────────┐
                   │                 │
                   ▼                 ▼
         ┌──────────────┐   ┌──────────────┐
         │ Conditions   │   │    ALL       │
         │   Failed     │   │ Conditions   │
         │              │   │   MET        │
         └──────┬───────┘   └──────┬───────┘
                │                  │
                ▼                  ▼
    ┌───────────────────┐  ┌──────────────┐
    │ Issue Tracker     │  │  Attempt     │
    │ • Fingerprint     │  │  Auto-Merge  │
    │ • Active tasks?   │  │              │
    │ • Spawn if needed │  └──────────────┘
    └───────────────────┘
                │
                ▼
    ┌───────────────────┐
    │ Spawn Condition-  │
    │ Specific Tasks    │
    │ (if not exists)   │
    └───────────────────┘
```

### Continuous Monitoring Flow

**NOT a one-time flow!** The system continuously re-evaluates conditions on every webhook event:

```
PR Created
    ↓
Webhook Event 1 (pull_request.opened)
    → Evaluate ALL conditions
    → Spawn tasks for unmet conditions
    ↓
Webhook Event 2 (check_suite.completed)
    → Re-evaluate ALL conditions
    → Check if existing tasks resolved issues
    → Spawn new tasks for NEW/remaining issues
    ↓
Webhook Event 3 (pull_request.synchronize - fix pushed)
    → Re-evaluate ALL conditions
    → Update issue fingerprints
    → Spawn tasks for still-failing issues
    ↓
Webhook Event 4 (pull_request_review.submitted)
    → Re-evaluate ALL conditions
    → Check if comments addressed
    → Spawn tasks if comments remain
    ↓
... (continues until ALL conditions met OR PR closed)
    ↓
ALL CONDITIONS MET
    → Attempt auto-merge
    → Record metrics
    → Mark tasks complete
```

---

## Integration with Existing Systems

**KEY INSIGHT**: This design integrates elegantly with the existing dev-bots task queue and agent selection infrastructure. We are NOT building a parallel system - we're extending what already exists!

### Existing Infrastructure We Leverage

#### 1. Task Queue System (`taskQueue.sqlite.ts`)

**Already Has Everything We Need!**

```typescript
interface Task {
  // Standard fields
  id: string;
  type: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: number;
  assigned_agent: string;

  // PR workflow fields (ALREADY EXISTS!)
  followup_for_pr?: number;        // ✅ Links fix tasks to PRs
  pr_branch?: string;              // ✅ Branch to work on
  pr_number?: number;              // ✅ PR tracking
  pr_status?: string;              // ✅ PR lifecycle state

  // Agent selection fields (ALREADY EXISTS!)
  task_category?: 'implementation' | 'analysis' | 'documentation' | 'review' | 'planning';
  file_patterns?: string;          // ✅ JSON array of file extensions
  estimated_complexity?: 'simple' | 'medium' | 'complex';
  preferred_agent?: 'claude' | 'codex' | 'copilot';

  // Task linking (ALREADY EXISTS!)
  parent_initiative?: string;      // ✅ Parent task tracking
  related_tasks?: string[];        // ✅ Task relationships
  original_task_id?: string;       // ✅ For repair/followup tasks
}
```

**What This Means**:
- ✅ NO new task queue needed
- ✅ NO new task spawning mechanism needed
- ✅ Simply use existing `taskQueue.createTask()` with `followup_for_pr` field
- ✅ Task completion already tracked, we just hook into it

#### 2. Agent Selection (`agentSelector.ts`)

**Intelligent Agent Selection ALREADY EXISTS!**

```typescript
class AgentSelector {
  selectAgent(criteria: AgentSelectionCriteria): AgentSelection {
    // Routes based on task type:
    // - 'implementation', 'refactoring' → Claude
    // - 'analysis', 'documentation', 'review', 'planning' → Codex
    // - 'polish', 'simple-fix' → Copilot
  }
}
```

**What This Means**:
- ✅ For PR validation tasks: Create task with `type: 'pr-validation'`
- ✅ AgentSelector will route to Codex (review/analysis task!)
- ✅ For fix tasks: Task type determines agent automatically
- ✅ Can override with `preferred_agent` if needed

**Example Validation Task**:
```typescript
await taskQueue.createTask({
  type: 'pr-validation',  // AgentSelector sees this as 'review' category
  task_category: 'review',
  title: `Comprehensive validation review for PR #${prNumber}`,
  description: validationPrompt,
  priority: 9,
  followup_for_pr: prNumber,
  pr_branch: prBranch
  // NO preferred_agent needed - AgentSelector chooses Codex automatically!
});
```

#### 3. GitHub Webhook Handlers (`githubWebhookHandler.service.ts`)

**Extension Points ALREADY EXIST!**

```typescript
class GitHubWebhookHandler {
  async handleCheckSuite(payload) {
    // Existing logic...

    // 🆕 ADD: Evaluate PR conditions
    const prNumber = payload.pull_request.number;
    await this.conditionState.evaluateConditions(prNumber);
  }

  async handlePullRequest(payload) {
    // Existing logic...

    // 🆕 ADD: Evaluate PR conditions
    await this.conditionState.evaluateConditions(payload.number);
  }

  async handlePullRequestReview(payload) {
    // Existing logic...

    // 🆕 ADD: Evaluate PR conditions
    await this.conditionState.evaluateConditions(payload.pull_request.number);
  }
}
```

**What This Means**:
- ✅ NO new webhook infrastructure needed
- ✅ Simply add 1 line to each existing handler
- ✅ Condition evaluation happens automatically on every event

#### 4. Task Completion Hooks (`taskCompletion.service.ts`)

**Hook Point ALREADY EXISTS!**

```typescript
class TaskCompletionService {
  async completeTask(task: Task) {
    // Existing logic: verification, quality gates, PR extraction...

    // 🆕 ADD: Update condition state if this is a PR fix task
    if (task.followup_for_pr) {
      await this.conditionState.handleTaskCompletion(task);

      // This will:
      // 1. Re-evaluate conditions for that PR
      // 2. Check if issue fingerprint changed (partial fix?)
      // 3. Spawn new task if issues remain
      // 4. Attempt merge if all conditions met
    }
  }
}
```

**What This Means**:
- ✅ NO new completion mechanism needed
- ✅ Simply add condition state update on completion
- ✅ Automatic cascade: fix task completes → conditions re-evaluated → new tasks spawn if needed

#### 5. Existing PR Workflow Services

**Already Have PR Monitoring!**

- `prMonitor.service.ts`: PR state tracking, metrics
- `prWorkflowOrchestrator.service.ts`: Workflow management
- `githubPR.service.ts`: GitHub API operations

**What This Means**:
- ✅ Leverage existing PR data fetching
- ✅ Use existing PR state tracking
- ✅ Extend existing workflow orchestration

### What We're Actually Building

Given all the existing infrastructure, we're only adding:

#### 1. New Database Table

```sql
CREATE TABLE pr_condition_states (
  pr_number INTEGER PRIMARY KEY,
  -- 8 condition statuses
  -- Active fix task tracking (by fingerprint)
  -- Validation state tracking
);
```

#### 2. New Service: `PRConditionStateService`

```typescript
class PRConditionStateService {
  // Core: Evaluate all conditions for a PR
  async evaluateConditions(prNumber: number): Promise<void>

  // Check individual conditions
  async evaluateCIChecksCondition(prNumber: number): Promise<ConditionEvaluation>
  async evaluateCommentsCondition(prNumber: number): Promise<ConditionEvaluation>
  // ... (8 condition evaluators)

  // Task spawning (uses existing task queue!)
  async spawnFixTaskIfNeeded(prNumber: number, condition: ConditionEvaluation): Promise<void>

  // Completion handling
  async handleTaskCompletion(task: Task): Promise<void>

  // Merge attempt (uses existing prMonitor.mergePR()!)
  async attemptMergeIfReady(prNumber: number): Promise<void>
}
```

#### 3. Webhook Handler Extensions

Just add ONE line to each existing handler:
```typescript
await this.conditionState.evaluateConditions(prNumber);
```

#### 4. Task Completion Extension

Just add ONE block to existing completion:
```typescript
if (task.followup_for_pr) {
  await this.conditionState.handleTaskCompletion(task);
}
```

### Integration Flow Example

**PR with Failing Tests & Behind Main**:

1. **Webhook: `check_suite.completed`**
   ```typescript
   handleCheckSuite(payload) {
     // Existing: Extract PR info, update metrics

     // NEW (1 line):
     await this.conditionState.evaluateConditions(prNumber);
     // This evaluates all 8 conditions and spawns fix tasks via existing task queue
   }
   ```

2. **Condition Evaluator Spawns Tasks**:
   ```typescript
   // Task 1: Fix failing tests (via existing task queue!)
   await this.taskQueue.createTask({
     type: 'bugfix',
     title: 'Fix failing tests in PR #96',
     followup_for_pr: 96,  // Existing field!
     pr_branch: 'feat/task-context',  // Existing field!
     task_category: 'implementation',  // AgentSelector → Claude
     // ...
   });

   // Task 2: Update branch (via existing task queue!)
   await this.taskQueue.createTask({
     type: 'maintenance',
     title: 'Update PR #96 with latest main',
     followup_for_pr: 96,
     pr_branch: 'feat/task-context',
     task_category: 'implementation',  // AgentSelector → Claude
     // ...
   });
   ```

3. **Agent Executes Tasks** (existing flow):
   - AgentSelector routes to Claude (implementation tasks)
   - Ephemeral worker executes in Docker
   - Changes pushed to PR branch
   - Webhook `pull_request.synchronize` fires

4. **Webhook Triggers Re-Evaluation**:
   ```typescript
   handlePullRequest(payload) {
     // NEW (1 line):
     await this.conditionState.evaluateConditions(96);
     // Re-checks: Are tests passing now? Is branch updated?
   }
   ```

5. **Task Completion Updates State**:
   ```typescript
   completeTask(task) {
     // Existing: Mark task complete, update DB

     // NEW:
     if (task.followup_for_pr === 96) {
       await this.conditionState.handleTaskCompletion(task);
       // Updates fingerprints, checks for partial fix
     }
   }
   ```

6. **All Conditions Met → Validation Task**:
   ```typescript
   evaluateConditions(96) {
     // Conditions 1-7: ✅ All met
     // Condition 8 (validation): ❌ Unmet

     // Spawn validation task (via existing task queue!)
     await this.taskQueue.createTask({
       type: 'pr-validation',
       task_category: 'review',  // AgentSelector → Codex (code review!)
       title: 'Comprehensive validation for PR #96',
       followup_for_pr: 96,
       // ...
     });
   }
   ```

7. **Validation Completes → Merge**:
   ```typescript
   handleTaskCompletion(validationTask) {
     // Task completed with score ≥80
     await this.conditionState.attemptMergeIfReady(96);

     // Uses existing prMonitor.mergePR()!
     await this.prMonitor.mergePR(96);
   }
   ```

### Summary: Elegant Integration

**What We're NOT Building**:
- ❌ New task queue
- ❌ New agent selection
- ❌ New webhook infrastructure
- ❌ New PR monitoring
- ❌ New task spawning mechanism
- ❌ New task completion handling

**What We ARE Building**:
- ✅ `pr_condition_states` table (1 new table)
- ✅ `PRConditionStateService` (1 new service)
- ✅ Condition evaluators (8 functions)
- ✅ Fingerprinting logic (1 utility)
- ✅ Webhook extensions (3 one-liners)
- ✅ Task completion extension (1 if-block)

**Result**: Powerful continuous PR self-healing that integrates seamlessly with existing infrastructure!

---

## Merge Conditions

A PR is **ONLY** eligible for auto-merge when **ALL** of these conditions are **TRUE simultaneously**:

### Condition 1: All CI Checks Passing

```typescript
condition_id: 'ci_checks_passing'
status: 'met' | 'unmet'
blocking_issues: string[] // Names of failing checks
```

**Criteria:**
- All required checks have status `SUCCESS`
- No checks with status `FAILURE` or `ERROR`
- No checks with status `CANCELLED` (indicates infrastructure issues)

**Spawns Task**: `fix-failing-checks`
- **Type**: `bugfix`
- **Priority**: 9 (critical)
- **Description**: Specific failing check names with log URLs
- **Acceptance Criteria**: "All CI checks pass: [Backend Tests, Frontend Lint, ...]"

---

### Condition 2: No Unresolved Review Comments

```typescript
condition_id: 'comments_resolved'
status: 'met' | 'unmet'
blocking_issues: CommentFingerprint[] // Unresolved blocking comments
```

**Criteria:**
- All blocking review comments have been addressed
- Fingerprint comparison shows comments resolved (code changed at file:line)
- No new blocking comments added

**Spawns Task**: `address-review-comments`
- **Type**: `review-feedback`
- **Priority**: 8 (high)
- **Description**: List of all unresolved comments with file:line references
- **Acceptance Criteria**: "All [N] blocking comments addressed"

---

### Condition 3: No Merge Conflicts

```typescript
condition_id: 'no_merge_conflicts'
status: 'met' | 'unmet'
blocking_issues: string[] // Conflicting files
```

**Criteria:**
- PR `mergeable` state is `MERGEABLE` (not `CONFLICTING`)
- GitHub can automatically merge the PR

**Spawns Task**: `resolve-merge-conflicts`
- **Type**: `bugfix`
- **Priority**: 9 (critical)
- **Description**: List of conflicting files with instructions
- **Acceptance Criteria**: "All merge conflicts resolved, PR mergeable state is MERGEABLE"

---

### Condition 4: Branch Up-to-Date with Base

```typescript
condition_id: 'branch_updated'
status: 'met' | 'unmet'
blocking_issues: number // Commits behind base
```

**Criteria:**
- PR `mergeStateStatus` is NOT `BEHIND`
- Branch includes all commits from base branch
- **Note**: This can be scripted, but may cause other conditions to fail!

**Spawns Task**: `update-pr-branch`
- **Type**: `maintenance`
- **Priority**: 7 (medium-high)
- **Description**: Instructions to merge base into PR branch (NOT rebase)
- **Acceptance Criteria**: "Branch is up-to-date with main (merged, NOT rebased)"
- **Warning**: "After updating, CI checks will re-run. Monitor for new failures."

**Special Handling:**
```typescript
// After branch update task completes:
// 1. Wait for check_suite.completed webhook
// 2. Re-evaluate ALL other conditions
// 3. Spawn new tasks if checks fail after merge
```

---

### Condition 5: No Human Change Requests

```typescript
condition_id: 'no_change_requests'
status: 'met' | 'unmet'
blocking_issues: string[] // Reviewer usernames requesting changes
```

**Criteria:**
- No reviews with state `CHANGES_REQUESTED` from human reviewers
- All change request reviews have been dismissed or superseded by approval

**Spawns Task**: `address-change-requests`
- **Type**: `review-feedback`
- **Priority**: 9 (critical)
- **Description**: List of reviewers and their requested changes
- **Acceptance Criteria**: "All change requests addressed, reviewers approve or dismiss"

---

### Condition 6: Task Verification Passed

```typescript
condition_id: 'task_verification'
status: 'met' | 'unmet'
blocking_issues: string[] // Unmet acceptance criteria
```

**Criteria:**
- Task verification service reports ≥80% acceptance criteria met
- No critical acceptance criteria failed

**Spawns Task**: `complete-task-requirements`
- **Type**: `implementation`
- **Priority**: 8 (high)
- **Description**: List of unmet acceptance criteria
- **Acceptance Criteria**: "All original task acceptance criteria met (≥80%)"

---

### Condition 7: Copilot Review Completed

```typescript
condition_id: 'copilot_review_completed'
status: 'met' | 'unmet'
blocking_issues: { reason: string } // Why review not completed
```

**Criteria:**
- GitHub Copilot has submitted at least one review on the PR
- Review can have 0 comments - just needs to exist
- Review must be from Copilot, not human

**Spawns Task**: NONE - waits for Copilot to review
- **Note**: This is a waiting condition, not a fixable issue
- System logs warning if Copilot hasn't reviewed after 30 minutes
- After 1 hour, creates notification task for human to request review

**Special Handling**:
```typescript
// After PR opened or synchronized, check for Copilot review
if (!hasCopilotReview && elapsedMinutes > 30) {
  logger.warn('Copilot has not reviewed PR yet', { pr_number, elapsed_minutes });
}

if (!hasCopilotReview && elapsedMinutes > 60) {
  // Create notification task (not a fix task)
  await createNotificationTask({
    title: `Copilot review pending for PR #${prNumber} (>1 hour)`,
    description: 'Manually request Copilot review or investigate why review not triggered',
    type: 'manual-intervention',
    priority: 6
  });
}
```

**Why This Matters**:
- Ensures ALL PRs get AI review, even if no issues found
- Copilot's "no comments" review is valuable signal (code looks good)
- Prevents merging before AI has chance to review

---

### Condition 8: Final Validation Passed

```typescript
condition_id: 'final_validation_passed'
status: 'met' | 'unmet' | 'not_ready'
blocking_issues: ValidationIssue[] // Issues found during final review
validation_attempts: number // How many times validation run
```

**Criteria:**
- This is the **LAST** condition checked before merge
- Only evaluated when ALL other 7 conditions are met
- When unmet, spawns a **validation task** (not a direct API call)
- The validation task performs comprehensive automated review for:
  - **Accuracy**: Does implementation match requirements?
  - **Entropy**: Is code clean and well-structured?
  - **Redundancy**: Any duplicate code or logic?
  - **Scope Creep**: Changes beyond task scope?
  - **Requirements**: All acceptance criteria truly satisfied?
  - **Code Quality**: Follows best practices?
- Validation task produces a scored validation report (0-100)
- **Threshold**: Score must be ≥80 to pass

**Spawns Task**: `pr-validation`
- **Type**: `pr-validation` (special task type for comprehensive review)
- **Priority**: 9 (critical - blocking merge)
- **Agent Selection**: Agent selector chooses best agent (Codex, Claude, specialized code reviewer)
- **Task Description**:
  ```
  Perform comprehensive validation review for PR #${prNumber}

  Validate across 6 dimensions (score 0-100 for each):
  1. Accuracy - matches requirements?
  2. Entropy - clean & maintainable?
  3. Redundancy - no duplication?
  4. Scope Creep - within task scope?
  5. Requirements - criteria satisfied?
  6. Code Quality - best practices?

  Must score ≥80 overall to pass.

  Output validation report in task verification data.
  ```
- **Acceptance Criteria**: "Validation score ≥80, all critical issues resolved"
- **Task Completion**: Updates `final_validation_passed` condition state with score and issues

**Validation Failure Tracking**:
```typescript
interface FinalValidationState {
  pr_number: number;
  validation_attempts: number;    // Incremented each validation
  last_validation_score: number;  // 0-100
  validation_history: ValidationAttempt[];
  human_escalation_triggered: boolean;
}

interface ValidationAttempt {
  attempt_number: number;
  timestamp: number;
  score: number;
  issues_found: ValidationIssue[];
  spawned_task_id?: string;
}
```

**How Validation Works (Task-Based)**:

1. **Condition Evaluation** detects all other conditions met:
   ```typescript
   async evaluateFinalValidationCondition(prNumber: number): Promise<ConditionEvaluation> {
     const otherConditionsMet = this.checkAllOtherConditions(prNumber);

     if (!otherConditionsMet) {
       return { status: 'not_ready', reason: 'Other conditions not met yet' };
     }

     // Check if validation task already exists and passed
     const validationState = await this.getValidationState(prNumber);

     if (validationState.passed) {
       return { status: 'met', fingerprint: 'validation-passed' };
     }

     // Needs validation
     return {
       status: 'unmet',
       fingerprint: `validation-attempt-${validationState.attempts}`,
       blocking_issues: [{ type: 'needs_comprehensive_review' }]
     };
   }
   ```

2. **Task Spawned** with validation instructions:
   ```typescript
   await this.taskQueue.createTask({
     title: `Comprehensive validation review for PR #${prNumber}`,
     description: buildValidationPrompt(prContext),
     type: 'pr-validation',
     priority: 9,
     followup_for_pr: prNumber,
     pr_branch: prBranch,
     metadata: {
       validation_attempt: validationState.attempts + 1,
       pr_diff_url: `https://github.com/.../pulls/${prNumber}.diff`,
       parent_task_id: taskId
     }
   });
   ```

3. **Agent Selector** chooses appropriate agent:
   - Could be GitHub Codex (code-specific)
   - Could be Claude (general review)
   - Could be specialized code review agent
   - Agent performs 6-dimension validation

4. **Task Completion** updates condition state:
   ```typescript
   // Agent completes validation task with score
   await this.updateValidationState(prNumber, {
     score: 85,
     passed: true,
     issues_found: [],
     attempt_number: 1
   });

   // This triggers condition re-evaluation
   // All conditions now met → merge attempt
   ```

5. **If Validation Finds Issues** (score < 80):
   ```typescript
   // Agent completes validation task with failures
   await this.updateValidationState(prNumber, {
     score: 65,
     passed: false,
     issues_found: [
       { category: 'scope_creep', severity: 'high', description: '...' },
       { category: 'redundancy', severity: 'medium', description: '...' }
     ],
     attempt_number: 1
   });

   // Validation task spawns FIX task
   await this.taskQueue.createTask({
     title: `Fix validation issues in PR #${prNumber}`,
     description: `Validation found issues (score: 65/100):\n\n${issuesList}`,
     type: 'refactoring',
     priority: 9,
     followup_for_pr: prNumber,
     pr_branch: prBranch
   });
   ```

**Escalation Logic**:
```typescript
// After 2nd validation failure
if (validationAttempts >= 2 && validationScore < 80) {
  // ESCALATE TO HUMAN
  logger.error({
    category: 'pr-workflow',
    action: 'final_validation_failed_twice',
    message: `PR #${prNumber} failed final validation twice - escalating to human`,
    details: {
      pr_number: prNumber,
      validation_attempts: validationAttempts,
      last_score: validationScore,
      validation_history: validationHistory
    }
  });

  // Create human escalation task
  await this.taskQueue.createTask({
    title: `HUMAN REVIEW REQUIRED: PR #${prNumber} failed validation twice`,
    description: `
PR #${prNumber} has failed comprehensive validation ${validationAttempts} times.

**Validation History**:
${validationHistory.map(v => `- Attempt ${v.attempt_number}: Score ${v.score}/100`).join('\n')}

**Latest Issues**:
${latestIssues.map(i => `- [${i.severity}] ${i.category}: ${i.description}`).join('\n')}

**Action Required**: Manual review to determine if:
1. Validation is accurate → PR needs more work
2. Validation has false positives → Override and merge
3. PR should be closed → Not meeting quality standards

DO NOT MERGE without human approval.
    `,
    type: 'manual-intervention',
    priority: 10,
    assigned_agent: 'human',
    followup_for_pr: prNumber
  });

  // Mark PR as DO NOT MERGE
  await this.github.updatePRLabels(prNumber, ['human-review-required', 'do-not-merge']);

  // Block any merge attempts
  await this.updatePRConditionState(prNumber, {
    'final_validation_passed': {
      status: 'unmet',
      human_escalation_triggered: true
    }
  });
}
```

**Cascade Handling**:
- Final validation may find issues that require code changes
- Code changes trigger `pull_request.synchronize` webhook
- This re-runs CI checks (may fail!)
- System handles cascade: fix validation → tests fail → fix tests → validate again
- **Maximum 2 validation attempts** before human escalation

**Example Validation Issues**:
```typescript
interface ValidationIssue {
  category: 'accuracy' | 'entropy' | 'redundancy' | 'scope_creep' | 'requirements' | 'code_quality';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

// Example issues:
[
  {
    category: 'scope_creep',
    severity: 'high',
    description: 'Implementation includes database migration not mentioned in task requirements',
    file: 'migrations/008_new_table.sql',
    suggestion: 'Remove migration or update task acceptance criteria to include it'
  },
  {
    category: 'redundancy',
    severity: 'medium',
    description: 'Duplicate validation logic found in two services',
    file: 'src/services/validator.ts',
    line: 45,
    suggestion: 'Extract to shared utility function'
  },
  {
    category: 'requirements',
    severity: 'critical',
    description: 'Acceptance criteria "Support pagination" not implemented in API endpoint',
    suggestion: 'Add pagination support or mark criterion as out of scope'
  }
]
```

---

## PR Condition State Machine

Each PR maintains a condition state object that tracks all conditions and their status:

```typescript
interface PRConditionState {
  pr_number: number;
  last_evaluated: number; // Timestamp
  last_updated: number;   // Last time GitHub PR was updated

  conditions: {
    ci_checks_passing: ConditionStatus;
    comments_resolved: ConditionStatus;
    no_merge_conflicts: ConditionStatus;
    branch_updated: ConditionStatus;
    no_change_requests: ConditionStatus;
    task_verification: ConditionStatus;
    copilot_review_completed: ConditionStatus;  // NEW: Must have Copilot review
    final_validation_passed: ConditionStatus;   // NEW: Final comprehensive check
  };

  // Track active fix tasks for each condition
  active_fix_tasks: {
    [condition_id: string]: {
      task_id: string;
      created_at: number;
      issue_fingerprint: string; // Hash of the issues being fixed
    }[];
  };

  // Final validation tracking
  final_validation_state: {
    validation_attempts: number;
    last_validation_score: number;  // 0-100
    validation_history: ValidationAttempt[];
    human_escalation_triggered: boolean;
  };

  // History of condition changes
  condition_history: ConditionChange[];
}

interface ConditionStatus {
  id: string;
  status: 'met' | 'unmet' | 'evaluating';
  last_checked: number;
  issue_fingerprint: string;  // Hash of current issues
  blocking_issues: any[];     // Specific issues preventing merge
  task_spawned: boolean;
}

interface ConditionChange {
  timestamp: number;
  condition_id: string;
  old_status: 'met' | 'unmet';
  new_status: 'met' | 'unmet';
  old_fingerprint: string;
  new_fingerprint: string;
  webhook_event: string;
}
```

### State Storage

**Database Table**: `pr_condition_states`

```sql
CREATE TABLE pr_condition_states (
  pr_number INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,  -- JSON serialized PRConditionState
  last_evaluated INTEGER NOT NULL,
  last_updated INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_pr_condition_states_last_evaluated ON pr_condition_states(last_evaluated);
```

---

## Issue Tracking & Fingerprinting

To prevent duplicate task spawning and detect partial fixes, we use **issue fingerprinting**.

### Fingerprint Generation

Each condition type has a specific fingerprinting algorithm:

#### 1. CI Checks Fingerprint

```typescript
function generateCIChecksFingerprint(checks: PRCheckStatus[]): string {
  const failedChecks = checks
    .filter(c => c.status === 'failure' || c.status === 'error')
    .map(c => c.name)
    .sort();

  return crypto
    .createHash('sha256')
    .update(failedChecks.join('|'))
    .digest('hex');
}

// Example:
// Failing: ["Backend Tests", "Frontend Lint"]
// Fingerprint: "a3f2c1..."

// After fix, still failing: ["Frontend Lint"]
// Fingerprint: "b8d4e2..." (DIFFERENT - spawn new task!)
```

**Partial Fix Detection:**
```typescript
if (oldFingerprint !== newFingerprint && stillHasFailures) {
  // Some tests fixed, but not all
  // Spawn new task for remaining failures
  logger.info('Partial fix detected: some checks fixed, spawning task for remaining');
  spawnTask('fix-remaining-checks', remainingFailures);
}
```

#### 2. Review Comments Fingerprint

```typescript
function generateCommentsFingerprint(comments: PRComment[]): string {
  const blockingComments = comments
    .filter(c => isBlockingComment(c))
    .map(c => `${c.path}:${c.line}:${c.body}`)
    .sort();

  return crypto
    .createHash('sha256')
    .update(blockingComments.join('|'))
    .digest('hex');
}
```

**Already Implemented**: ReviewCommentTracker service

#### 3. Merge Conflicts Fingerprint

```typescript
function generateConflictsFingerprint(conflictingFiles: string[]): string {
  return crypto
    .createHash('sha256')
    .update(conflictingFiles.sort().join('|'))
    .digest('hex');
}
```

#### 4. Branch Update Fingerprint

```typescript
function generateBranchUpdateFingerprint(behindCount: number, baseRef: string): string {
  return crypto
    .createHash('sha256')
    .update(`${baseRef}:behind:${behindCount}`)
    .digest('hex');
}
```

**Special Case**: Branch update fingerprint changes with EVERY base branch commit
- Don't spawn multiple update tasks if one already exists
- Task should be marked as "may need re-run if base advances again"

---

## Event-Driven Spawning

**CRITICAL PRINCIPLE**: Each event type only triggers evaluation of RELATED conditions and task spawning for those specific conditions. We do NOT evaluate/spawn all tasks on every event!

### Event-to-Condition Mapping

| Event Type | Conditions to Evaluate | Tasks to Spawn | Check Merge Ready? |
|------------|------------------------|----------------|-------------------|
| `pull_request.opened` | NONE (initialize state only) | NONE (wait for checks) | ❌ NO |
| `check_suite.completed` | ✅ CI Checks | Fix failing tests | ✅ YES |
| `pull_request_review.submitted` | ✅ Comments<br>✅ Change Requests | Address comments<br>Respond to changes | ✅ YES |
| `pull_request.synchronize` | ✅ Comments (may be resolved by code)<br>✅ Merge Conflicts<br>✅ Branch Updated | Address remaining comments<br>Resolve conflicts<br>Update branch | ✅ YES |
| `push` (to base branch) | ✅ Branch Updated | Update PR branch | ✅ YES |
| Task Completion | ✅ Condition task was fixing | Spawn followup if partial fix | ✅ YES |

**Merge Ready Check (All Events)**: Every event handler checks if ALL 8 conditions are met. If yes, spawn final validation task (if not done) or attempt merge (if validation passed).

**Key Rules**:
1. **CI check events** → ONLY spawn test fix tasks
2. **Review events** → ONLY spawn comment/review response tasks
3. **Code push events** → Re-evaluate code-related conditions (comments resolved? conflicts resolved?)
4. **NEVER spawn unrelated tasks** (e.g., review comment event does NOT spawn test fix task)
5. **ALL events check merge readiness** as final step

**Examples of Correct Behavior**:

✅ **CORRECT**:
- `check_suite.completed` (tests failed) → Spawn "Fix failing tests" task
- `pull_request_review.submitted` (comment added) → Spawn "Address review comments" task
- `pull_request.synchronize` (code pushed) → Check if comments resolved by code

❌ **INCORRECT** (What NOT to do):
- `pull_request_review.submitted` (comment added) → Spawn "Fix failing tests" task ❌ NO!
- `check_suite.completed` (tests failed) → Spawn "Address review comments" task ❌ NO!
- Every event → Spawn all possible tasks ❌ NO!

**Why This Matters**:
- Reduces noise: Only relevant tasks spawned
- Faster response: No unnecessary condition checks
- Clearer intent: Task origin is obvious
- Better debugging: Event → Task relationship is one-to-one for related conditions

### Detailed Event Logic

Different webhook events trigger different evaluation and spawning logic:

### Event 1: `pull_request.opened`

**Trigger**: New PR created

**Evaluation Logic:**
```typescript
async handlePROpened(payload: GitHubPullRequestPayload) {
  const prNumber = payload.number;

  // 1. Create initial PR condition state
  const conditionState = await initializePRConditionState(prNumber);

  // 2. Wait for initial CI checks to start (grace period: 30s)
  await sleep(30000);

  // 3. Evaluate all conditions
  const evaluation = await evaluateAllConditions(prNumber);

  // 4. Spawn tasks for unmet conditions (all will likely be unmet initially)
  await spawnTasksForUnmetConditions(prNumber, evaluation);

  // Note: Don't spawn tasks yet - wait for check_suite.completed
  // Just initialize state and track PR
}
```

**Task Spawning**: NONE (wait for checks to complete)

---

### Event 2: `check_suite.completed`

**Trigger**: All CI checks finished

**Conditions to Evaluate**: ✅ CI Checks ONLY

**Evaluation Logic:**
```typescript
async handleCheckSuiteCompleted(payload: GitHubCheckSuitePayload) {
  const prNumber = extractPRNumber(payload);
  const conclusion = payload.check_suite.conclusion;

  // 1. Load current condition state
  const state = await loadPRConditionState(prNumber);

  // 2. Evaluate CI checks condition ONLY (this event is about CI checks!)
  const ciEvaluation = await evaluateCIChecksCondition(prNumber);

  // 3. Compare with previous state
  const previousFingerprint = state.conditions.ci_checks_passing.issue_fingerprint;
  const currentFingerprint = ciEvaluation.fingerprint;

  if (previousFingerprint !== currentFingerprint) {
    // CI check results changed!

    if (ciEvaluation.status === 'unmet') {
      // Still have failures (or new failures)

      // Check if we have an active task for the OLD fingerprint
      const activeTask = state.active_fix_tasks.ci_checks_passing?.find(
        task => task.issue_fingerprint === previousFingerprint
      );

      if (activeTask && currentFingerprint !== previousFingerprint) {
        // Partial fix! Some checks fixed, but not all
        logger.info('Partial fix detected for CI checks');
        await spawnTask('fix-remaining-checks', {
          type: 'bugfix',
          pr_number: prNumber,
          remaining_failures: ciEvaluation.blocking_issues,
          previously_failing: state.conditions.ci_checks_passing.blocking_issues
        });
      } else if (!hasActiveTaskForFingerprint(state, 'ci_checks_passing', currentFingerprint)) {
        // No active task for current failures - spawn one
        await spawnTask('fix-failing-checks', {
          type: 'bugfix',
          ...ciEvaluation
        });
      }
    } else {
      // CI checks now passing! Mark active fix tasks as complete
      await markActiveTasksComplete(state, 'ci_checks_passing');
    }
  }

  // 4. Update condition state
  state.conditions.ci_checks_passing = {
    status: ciEvaluation.status,
    issue_fingerprint: currentFingerprint,
    blocking_issues: ciEvaluation.blocking_issues,
    last_checked: Date.now()
  };

  // 5. Check if ALL conditions are now met (for merge)
  if (allConditionsMet(state)) {
    await spawnFinalValidationOrMerge(prNumber, state);
  }

  // 6. Save updated state
  await savePRConditionState(state);
}
```

**Task Spawning** (CI-related ONLY):
- `fix-failing-checks` if CI checks failed
- `fix-remaining-checks` if partial fix detected
- **NO OTHER TASKS** (don't spawn comment tasks, conflict tasks, etc.)

---

### Event 3: `pull_request.synchronize`

**Trigger**: New commits pushed to PR branch

**Conditions to Evaluate**: ✅ Comments (may be resolved), ✅ Merge Conflicts, ✅ Branch Updated

**Evaluation Logic:**
```typescript
async handlePRSynchronize(payload: GitHubPullRequestPayload) {
  const prNumber = payload.number;

  // 1. Load condition state
  const state = await loadPRConditionState(prNumber);

  // 2. Update "last_updated" timestamp
  state.last_updated = Date.now();

  // 3. Re-evaluate review comments (code changes may resolve comments)
  const commentsEvaluation = await evaluateCommentsCondition(prNumber);

  const previousCommentsFingerprint = state.conditions.comments_resolved.issue_fingerprint;
  const currentCommentsFingerprint = commentsEvaluation.fingerprint;

  if (currentCommentsFingerprint !== previousCommentsFingerprint) {
    if (commentsEvaluation.status === 'met') {
      // Comments resolved by code changes!
      logger.info('Review comments resolved after code push');
      await markActiveTasksComplete(state, 'comments_resolved');
    } else {
      // Still have unresolved comments (partial fix?)
      if (!hasActiveTaskForFingerprint(state, 'comments_resolved', currentCommentsFingerprint)) {
        await spawnTask('address-remaining-comments', {
          type: 'review-feedback',
          ...commentsEvaluation
        });
      }
    }
  }

  // 4. Evaluate merge conflicts (code changes may introduce/resolve conflicts)
  const conflictsEvaluation = await evaluateMergeConflictsCondition(prNumber);

  if (conflictsEvaluation.status === 'unmet') {
    if (!hasActiveTaskForFingerprint(state, 'no_merge_conflicts', conflictsEvaluation.fingerprint)) {
      await spawnTask('resolve-merge-conflicts', {
        type: 'maintenance',
        ...conflictsEvaluation
      });
    }
  } else {
    // Conflicts resolved
    await markActiveTasksComplete(state, 'no_merge_conflicts');
  }

  // 5. Check if branch is now behind (base advanced while working)
  const branchEvaluation = await evaluateBranchUpdateCondition(prNumber);

  if (branchEvaluation.status === 'unmet') {
    if (!hasActiveTaskForCondition(state, 'branch_updated')) {
      logger.warn('Branch fell behind base during fix work');
      await spawnTask('update-pr-branch', {
        type: 'maintenance',
        ...branchEvaluation
      });
    }
  } else {
    // Branch is up-to-date
    await markActiveTasksComplete(state, 'branch_updated');
  }

  // 6. Update condition states
  state.conditions.comments_resolved = {
    status: commentsEvaluation.status,
    issue_fingerprint: currentCommentsFingerprint,
    blocking_issues: commentsEvaluation.blocking_issues,
    last_checked: Date.now()
  };

  state.conditions.no_merge_conflicts = {
    status: conflictsEvaluation.status,
    issue_fingerprint: conflictsEvaluation.fingerprint,
    blocking_issues: conflictsEvaluation.blocking_issues,
    last_checked: Date.now()
  };

  state.conditions.branch_updated = {
    status: branchEvaluation.status,
    issue_fingerprint: branchEvaluation.fingerprint,
    blocking_issues: branchEvaluation.blocking_issues,
    last_checked: Date.now()
  };

  // 7. NOTE: New CI checks will be triggered by this push
  //    Wait for check_suite.completed event to evaluate CI checks
  //    Do NOT spawn check tasks here!

  // 8. Check if ALL conditions are now met (for merge)
  if (allConditionsMet(state)) {
    await spawnFinalValidationOrMerge(prNumber, state);
  }

  // 9. Save updated state
  await savePRConditionState(state);
}
```

**Task Spawning** (Code-change-related ONLY):
- `address-remaining-comments` if comments still unresolved after code changes
- `resolve-merge-conflicts` if code changes introduced/didn't resolve conflicts
- `update-pr-branch` if branch fell behind during fix work
- **WAIT for `check_suite.completed`** to spawn CI check fix tasks

---

### Event 4: `pull_request_review.submitted`

**Trigger**: Human or bot submits review

**Conditions to Evaluate**: ✅ Comments & ✅ Change Requests ONLY

**Evaluation Logic:**
```typescript
async handlePRReviewSubmitted(payload: GitHubPullRequestReviewPayload) {
  const prNumber = payload.pull_request.number;
  const reviewState = payload.review.state; // APPROVED | CHANGES_REQUESTED | COMMENTED

  // 1. Load condition state
  const state = await loadPRConditionState(prNumber);

  // 2. Evaluate change requests condition ONLY (review-related!)
  const changeRequestsEvaluation = await evaluateChangeRequestsCondition(prNumber);

  if (reviewState === 'CHANGES_REQUESTED') {
    // New change request - spawn task if not already exists
    if (!hasActiveTaskForCondition(state, 'no_change_requests')) {
      await spawnTask('address-change-requests', {
        type: 'review-feedback',
        ...changeRequestsEvaluation
      });
    }
  } else if (reviewState === 'APPROVED') {
    // Change requests resolved - mark tasks complete
    await markActiveTasksComplete(state, 'no_change_requests');
  }

  // 3. Evaluate review comments condition ONLY (review-related!)
  const commentsEvaluation = await evaluateCommentsCondition(prNumber);

  if (commentsEvaluation.status === 'unmet') {
    // New blocking comments added or exist
    const previousFingerprint = state.conditions.comments_resolved.issue_fingerprint;
    const currentFingerprint = commentsEvaluation.fingerprint;

    if (currentFingerprint !== previousFingerprint) {
      // Comments changed
      if (!hasActiveTaskForFingerprint(state, 'comments_resolved', currentFingerprint)) {
        await spawnTask('address-review-comments', {
          type: 'review-feedback',
          ...commentsEvaluation
        });
      }
    }
  } else {
    // Comments resolved - mark tasks complete
    await markActiveTasksComplete(state, 'comments_resolved');
  }

  // 4. Update condition states
  state.conditions.no_change_requests = {
    status: changeRequestsEvaluation.status,
    issue_fingerprint: changeRequestsEvaluation.fingerprint,
    blocking_issues: changeRequestsEvaluation.blocking_issues,
    last_checked: Date.now()
  };

  state.conditions.comments_resolved = {
    status: commentsEvaluation.status,
    issue_fingerprint: commentsEvaluation.fingerprint,
    blocking_issues: commentsEvaluation.blocking_issues,
    last_checked: Date.now()
  };

  // 5. Check if ALL conditions are now met (for merge)
  if (allConditionsMet(state)) {
    await spawnFinalValidationOrMerge(prNumber, state);
  }

  // 6. Save updated state
  await savePRConditionState(state);
}
```

**Task Spawning** (Review-related ONLY):
- `address-change-requests` if changes requested
- `address-review-comments` if blocking comments added
- **NO OTHER TASKS** (don't spawn test fix tasks, conflict resolution, etc.)

---

### Event 5: `push` (to base branch - main)

**Trigger**: Base branch advanced

**Evaluation Logic:**
```typescript
async handleBaseBranchPush(payload: GitHubPushPayload) {
  const baseBranch = payload.ref; // refs/heads/main

  // 1. Find all open PRs targeting this base branch
  const openPRs = await findOpenPRsToBase(baseBranch);

  // 2. For each PR, check if it's now behind
  for (const prNumber of openPRs) {
    const state = await loadPRConditionState(prNumber);
    const branchEvaluation = await evaluateBranchUpdateCondition(prNumber);

    if (branchEvaluation.status === 'unmet') {
      // PR is now behind base

      // Check if we already have an active update task
      if (!hasActiveTaskForCondition(state, 'branch_updated')) {
        logger.info(`PR #${prNumber} fell behind base branch - spawning update task`);
        await spawnTask('update-pr-branch', branchEvaluation);
      } else {
        logger.info(`PR #${prNumber} behind base, but update task already exists`);
      }
    }
  }
}
```

**Task Spawning**:
- `update-pr-branch` for each PR that fell behind

**Note**: This is a proactive check, not triggered by PR events

---

## Task Spawning Logic

### Core Spawning Function

```typescript
async function spawnTaskForCondition(
  prNumber: number,
  conditionId: string,
  evaluation: ConditionEvaluation
): Promise<Task | null> {
  // 1. Load PR condition state
  const state = await loadPRConditionState(prNumber);

  // 2. Check if we already have an active task for this exact issue
  const activeTask = state.active_fix_tasks[conditionId]?.find(
    task => task.issue_fingerprint === evaluation.fingerprint
  );

  if (activeTask) {
    logger.info({
      category: 'pr-workflow',
      action: 'task_spawn_skipped',
      message: `Active task already exists for ${conditionId}`,
      details: {
        pr_number: prNumber,
        condition_id: conditionId,
        active_task_id: activeTask.task_id,
        fingerprint: evaluation.fingerprint
      }
    });
    return null; // Don't spawn duplicate
  }

  // 3. Get PR and parent task info
  const prStatus = await this.githubPR.getPRStatus(prNumber);
  const parentTask = await this.taskQueue.findByPRNumber(prNumber)[0];

  if (!parentTask) {
    logger.error('Cannot spawn task - no parent task found for PR');
    return null;
  }

  // 4. Check followup limits
  const limitCheck = await this.checkFollowupLimits(prNumber, parentTask.id);
  if (!limitCheck.allowed) {
    await this.createEscalationTask(prNumber, parentTask.id, limitCheck.reason!, limitCheck.depth, limitCheck.total);
    return null;
  }

  // 5. Build condition-specific task
  const taskSpec = buildTaskSpecForCondition(conditionId, evaluation, prStatus, parentTask);

  // 6. Create task
  const task = this.taskQueue.createTask(taskSpec);

  // 7. Update PR condition state to track this active task
  if (!state.active_fix_tasks[conditionId]) {
    state.active_fix_tasks[conditionId] = [];
  }
  state.active_fix_tasks[conditionId].push({
    task_id: task.id,
    created_at: Date.now(),
    issue_fingerprint: evaluation.fingerprint
  });
  await savePRConditionState(state);

  // 8. Update parent task
  const followupTasks = parentTask.followup_tasks || [];
  followupTasks.push(task.id);
  this.taskQueue.updateTask(parentTask.id, { followup_tasks: [...followupTasks] });

  logger.info({
    category: 'pr-workflow',
    action: 'condition_task_spawned',
    message: `Spawned task for ${conditionId} on PR #${prNumber}`,
    details: {
      pr_number: prNumber,
      condition_id: conditionId,
      task_id: task.id,
      fingerprint: evaluation.fingerprint,
      blocking_issues: evaluation.blocking_issues
    }
  });

  return task;
}
```

### Task Specifications by Condition

#### 1. Fix Failing CI Checks

```typescript
function buildTaskForFailingChecks(evaluation, prStatus, parentTask): TaskSpec {
  const failedChecks = evaluation.blocking_issues; // Array of check names

  return {
    title: `Fix failing CI checks on PR #${prStatus.number}`,
    description: `
❌ Failed CI checks (${failedChecks.length}):

${failedChecks.map(check => `
- **${check.name}**
  Status: ${check.status}
  Conclusion: ${check.conclusion}
  Details: ${check.detailsUrl || 'No URL available'}
`).join('\n')}

⚠️ IMPORTANT: Work from the existing PR branch "${prStatus.head.ref}"
- Checkout: git fetch origin ${prStatus.head.ref} && git checkout ${prStatus.head.ref}
- Fix the failing checks
- Run checks locally: npm test (or appropriate command)
- Push to same branch: git push origin ${prStatus.head.ref}
- This will update the existing PR #${prStatus.number}
- DO NOT create a new PR

After pushing, CI will automatically re-run. Monitor the PR for results.
    `.trim(),

    type: 'bugfix',
    priority: 9,

    acceptance_criteria: [
      `All CI checks pass: ${failedChecks.map(c => c.name).join(', ')}`,
      `No new check failures introduced`,
      `Changes pushed to existing PR #${prStatus.number} (do NOT create new PR)`
    ],

    followup_for_pr: prStatus.number,
    pr_branch: prStatus.head.ref,
    assigned_agent: parentTask.assigned_agent || 'backend-specialist'
  };
}
```

#### 2. Address Review Comments

```typescript
function buildTaskForReviewComments(evaluation, prStatus, parentTask): TaskSpec {
  const comments = evaluation.blocking_issues; // Array of comment objects

  return {
    title: `Address review comments on PR #${prStatus.number}`,
    description: `
💬 ${comments.length} unresolved blocking comment(s):

${comments.map(comment => `
- **[${comment.path || 'General'}${comment.line ? `:${comment.line}` : ''}]**
  Author: ${comment.author}
  ${comment.body.substring(0, 200)}
  ${comment.body.length > 200 ? '...' : ''}
`).join('\n')}

⚠️ IMPORTANT: Work from the existing PR branch "${prStatus.head.ref}"
- Checkout: git fetch origin ${prStatus.head.ref} && git checkout ${prStatus.head.ref}
- Address each comment by modifying the code at the specified file:line
- Optionally reply to comments explaining your fixes
- Push to same branch: git push origin ${prStatus.head.ref}
- This will update the existing PR #${prStatus.number}
- DO NOT create a new PR

After pushing, request re-review if needed.
    `.trim(),

    type: 'review-feedback',
    priority: 8,

    acceptance_criteria: [
      `All ${comments.length} blocking comment(s) addressed`,
      `Code changes resolve the concerns raised`,
      `Changes pushed to existing PR #${prStatus.number} (do NOT create new PR)`
    ],

    followup_for_pr: prStatus.number,
    pr_branch: prStatus.head.ref,
    assigned_agent: parentTask.assigned_agent || 'backend-specialist'
  };
}
```

#### 3. Update PR Branch

```typescript
function buildTaskForBranchUpdate(evaluation, prStatus, parentTask): TaskSpec {
  const behindCount = evaluation.blocking_issues.behind_count;
  const baseBranch = prStatus.base.ref;

  return {
    title: `Update PR #${prStatus.number} with latest ${baseBranch}`,
    description: `
⚠️ PR is ${behindCount} commit(s) behind base branch "${baseBranch}"

**Required Action**: Merge latest ${baseBranch} into this PR branch

**Commands**:
\`\`\`bash
# Checkout PR branch
git fetch origin ${prStatus.head.ref}
git checkout ${prStatus.head.ref}

# Fetch and merge latest base branch (do NOT rebase!)
git fetch origin ${baseBranch}
git merge origin/${baseBranch}

# Resolve any merge conflicts if they occur
# (If conflicts, edit files, then: git add . && git commit)

# Push updated branch
git push origin ${prStatus.head.ref}
\`\`\`

⚠️ **IMPORTANT NOTES**:
- DO NOT rebase (git rebase) - use merge only!
- DO NOT force push (git push --force)
- After merging, CI checks will automatically re-run
- Monitor the PR - the merge may cause tests to fail
- If tests fail after merge, a new task will be created to fix them
- This updates existing PR #${prStatus.number} - do NOT create new PR

**Expected Outcome**: Branch is up-to-date, PR shows "This branch is up to date"
    `.trim(),

    type: 'maintenance',
    priority: 7,

    acceptance_criteria: [
      `Branch is up-to-date with ${baseBranch} (merged, NOT rebased)`,
      `All merge conflicts resolved`,
      `No force push used`,
      `Changes pushed to existing PR #${prStatus.number}`
    ],

    followup_for_pr: prStatus.number,
    pr_branch: prStatus.head.ref,
    assigned_agent: parentTask.assigned_agent || 'backend-specialist',

    metadata: {
      warning: 'CI checks will re-run after update. Monitor for new failures.'
    }
  };
}
```

#### 4. Resolve Merge Conflicts

```typescript
function buildTaskForMergeConflicts(evaluation, prStatus, parentTask): TaskSpec {
  const conflictingFiles = evaluation.blocking_issues.conflicting_files || [];

  return {
    title: `Resolve merge conflicts on PR #${prStatus.number}`,
    description: `
⚠️ PR has merge conflicts that must be resolved

**Conflicting Files**:
${conflictingFiles.length > 0
  ? conflictingFiles.map(file => `- ${file}`).join('\n')
  : '- (GitHub will show conflicting files in PR)'}

**Resolution Steps**:
\`\`\`bash
# Checkout PR branch
git fetch origin ${prStatus.head.ref}
git checkout ${prStatus.head.ref}

# Merge latest base branch
git fetch origin ${prStatus.base.ref}
git merge origin/${prStatus.base.ref}

# Git will report conflicting files
# Edit each file to resolve conflicts (look for <<<<<<< markers)

# After resolving all conflicts:
git add .
git commit -m "Resolve merge conflicts with ${prStatus.base.ref}"

# Push resolution
git push origin ${prStatus.head.ref}
\`\`\`

⚠️ **CONFLICT RESOLUTION GUIDE**:
- Look for conflict markers: <<<<<<< HEAD, =======, >>>>>>>
- Choose which changes to keep (or combine both)
- Remove conflict markers
- Test that code still works
- Commit and push

This updates existing PR #${prStatus.number} - do NOT create new PR
    `.trim(),

    type: 'bugfix',
    priority: 9,

    acceptance_criteria: [
      `All merge conflicts resolved`,
      `PR mergeable state is MERGEABLE`,
      `Code compiles and tests pass`,
      `Changes pushed to existing PR #${prStatus.number}`
    ],

    followup_for_pr: prStatus.number,
    pr_branch: prStatus.head.ref,
    assigned_agent: parentTask.assigned_agent || 'backend-specialist'
  };
}
```

#### 5. Address Change Requests

```typescript
function buildTaskForChangeRequests(evaluation, prStatus, parentTask): TaskSpec {
  const reviewers = evaluation.blocking_issues.reviewers; // Array of reviewer usernames

  return {
    title: `Address change requests on PR #${prStatus.number}`,
    description: `
👤 Human reviewer(s) requested changes: ${reviewers.join(', ')}

**Review the requested changes**:
- Go to PR: ${prStatus.html_url}
- Read the review comments from ${reviewers.join(', ')}
- Understand the concerns raised

**Address the feedback**:
- Checkout PR branch: git fetch origin ${prStatus.head.ref} && git checkout ${prStatus.head.ref}
- Make the requested changes to the code
- Reply to review comments explaining your changes (optional but recommended)
- Push changes: git push origin ${prStatus.head.ref}

**Request re-review**:
- After pushing, GitHub will automatically notify reviewers
- Or manually request re-review via PR interface

⚠️ This updates existing PR #${prStatus.number} - do NOT create new PR
    `.trim(),

    type: 'review-feedback',
    priority: 9,

    acceptance_criteria: [
      `All requested changes implemented`,
      `Reviewers approve or dismiss their change requests`,
      `Changes pushed to existing PR #${prStatus.number}`
    ],

    followup_for_pr: prStatus.number,
    pr_branch: prStatus.head.ref,
    assigned_agent: parentTask.assigned_agent || 'backend-specialist'
  };
}
```

---

## Duplicate Prevention

### Strategy 1: Fingerprint Matching

**Rule**: Never spawn a task if an active task exists with the same issue fingerprint

```typescript
function hasActiveTaskForFingerprint(
  state: PRConditionState,
  conditionId: string,
  fingerprint: string
): boolean {
  const activeTasks = state.active_fix_tasks[conditionId] || [];

  return activeTasks.some(task => {
    // Check if task is still active
    const taskObj = taskQueue.getTask(task.task_id);
    if (!taskObj || taskObj.status === 'completed' || taskObj.status === 'failed') {
      return false; // Task no longer active
    }

    return task.issue_fingerprint === fingerprint;
  });
}
```

### Strategy 2: Condition Lock

**Rule**: Only one active task per condition at a time (unless fingerprint changes)

```typescript
function hasActiveTaskForCondition(
  state: PRConditionState,
  conditionId: string
): boolean {
  const activeTasks = state.active_fix_tasks[conditionId] || [];

  return activeTasks.some(task => {
    const taskObj = taskQueue.getTask(task.task_id);
    return taskObj &&
           taskObj.status !== 'completed' &&
           taskObj.status !== 'failed';
  });
}
```

**Exception**: If fingerprint changes (partial fix), new task can be spawned

### Strategy 3: Task Completion Cleanup

**Rule**: When a task completes, remove it from active_fix_tasks

```typescript
async function onTaskComplete(taskId: string) {
  // 1. Find PR associated with this task
  const task = taskQueue.getTask(taskId);
  if (!task.followup_for_pr) return;

  const prNumber = task.followup_for_pr;

  // 2. Load condition state
  const state = await loadPRConditionState(prNumber);

  // 3. Remove from active tasks
  for (const [conditionId, tasks] of Object.entries(state.active_fix_tasks)) {
    state.active_fix_tasks[conditionId] = tasks.filter(t => t.task_id !== taskId);
  }

  // 4. Save updated state
  await savePRConditionState(state);

  // 5. Trigger re-evaluation
  logger.info(`Task ${taskId} completed - triggering PR condition re-evaluation`);
  await evaluateAndSpawnForAllConditions(prNumber, state);
}
```

---

## Partial Fix Handling

When a fix task resolves **some but not all** issues, the system spawns a new task for remaining issues.

### Detection Algorithm

```typescript
async function detectPartialFix(
  prNumber: number,
  conditionId: string,
  oldEvaluation: ConditionEvaluation,
  newEvaluation: ConditionEvaluation
): Promise<PartialFixResult> {
  // 1. Check if condition is still unmet
  if (newEvaluation.status === 'met') {
    return { isPartialFix: false, reason: 'Fully fixed' };
  }

  // 2. Compare fingerprints
  if (oldEvaluation.fingerprint === newEvaluation.fingerprint) {
    return { isPartialFix: false, reason: 'Issues unchanged' };
  }

  // 3. Compare issue counts
  const oldIssueCount = oldEvaluation.blocking_issues.length;
  const newIssueCount = newEvaluation.blocking_issues.length;

  if (newIssueCount >= oldIssueCount) {
    return {
      isPartialFix: false,
      reason: 'Issue count increased or unchanged'
    };
  }

  // 4. Partial fix detected!
  const resolvedIssues = oldEvaluation.blocking_issues.filter(
    oldIssue => !newEvaluation.blocking_issues.includes(oldIssue)
  );

  return {
    isPartialFix: true,
    resolved_issues: resolvedIssues,
    remaining_issues: newEvaluation.blocking_issues,
    progress: `${resolvedIssues.length}/${oldIssueCount} issues fixed`
  };
}
```

### Example: Failing Tests

**Initial State**:
- Failing tests: `["UserService.test", "AuthService.test", "PaymentService.test"]`
- Fingerprint: `a1b2c3...`
- Task spawned: `fix-failing-checks`

**After Fix Task Completes**:
- Failing tests: `["PaymentService.test"]` (2 fixed, 1 remaining)
- Fingerprint: `d4e5f6...` (DIFFERENT)
- Detection: Partial fix (2/3 fixed)
- **Action**: Spawn new task `fix-remaining-checks`

**New Task Description**:
```markdown
❌ Remaining failing CI check:

- **Backend Tests** (1 test still failing)
  Previously failing: UserService.test, AuthService.test, PaymentService.test
  Still failing: PaymentService.test

✅ Progress: 2/3 tests fixed by previous task

Fix the remaining failing test and push to PR branch.
```

---

## Final Validation Service

The `FinalValidationService` performs a comprehensive AI-powered review of the PR **ONLY after all other conditions are met**. This is the last gate before merge.

### When Final Validation Runs

```typescript
// In webhook handler after ALL conditions evaluated

async evaluateAndAttemptMerge(prNumber: number) {
  const state = await this.conditionState.loadPRConditionState(prNumber);

  // Check if ALL conditions met (excluding final_validation)
  const otherConditionsMet = [
    'ci_checks_passing',
    'comments_resolved',
    'no_merge_conflicts',
    'branch_updated',
    'no_change_requests',
    'task_verification',
    'copilot_review_completed'
  ].every(conditionId => state.conditions[conditionId].status === 'met');

  if (!otherConditionsMet) {
    // Still have unmet conditions - don't run final validation yet
    return;
  }

  // ALL other conditions met - NOW run final validation
  logger.info('All base conditions met - running final validation');

  const validationResult = await this.finalValidation.validate(prNumber);

  if (validationResult.passed) {
    // Final validation passed - MERGE!
    logger.info('Final validation passed - attempting merge');
    await this.prMonitor.mergePR(prNumber);
  } else {
    // Final validation failed - handle based on attempt count
    await this.handleFinalValidationFailure(prNumber, validationResult);
  }
}
```

### Validation Algorithm

```typescript
class FinalValidationService {
  constructor(
    private anthropic: AnthropicClient,
    private github: GitHubPRService,
    private db: DatabaseConnection
  ) {}

  async validate(prNumber: number): Promise<ValidationResult> {
    // 1. Load validation state
    const validationState = await this.loadValidationState(prNumber);

    // 2. Increment attempt counter
    validationState.validation_attempts++;

    // 3. Gather PR context
    const context = await this.gatherPRContext(prNumber);

    // 4. Build validation prompt
    const prompt = this.buildValidationPrompt(context);

    // 5. Call Claude AI for comprehensive review
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // 6. Parse validation response
    const validationResult = this.parseValidationResponse(response);

    // 7. Record attempt in history
    validationState.validation_history.push({
      attempt_number: validationState.validation_attempts,
      timestamp: Date.now(),
      score: validationResult.score,
      issues_found: validationResult.issues,
      spawned_task_id: null // Will be set if task spawned
    });

    validationState.last_validation_score = validationResult.score;

    // 8. Save validation state
    await this.saveValidationState(validationState);

    return validationResult;
  }

  private async gatherPRContext(prNumber: number): Promise<PRContext> {
    const prStatus = await this.github.getPRStatus(prNumber);
    const diff = await this.github.getPRDiff(prNumber);
    const task = await this.findOriginalTask(prNumber);

    return {
      pr_number: prNumber,
      title: prStatus.title,
      description: prStatus.body,
      diff: diff,
      files_changed: prStatus.files,
      task: {
        title: task.title,
        description: task.description,
        acceptance_criteria: task.acceptance_criteria,
        type: task.type
      }
    };
  }

  private buildValidationPrompt(context: PRContext): string {
    return `
You are a senior code reviewer performing a final comprehensive validation of a pull request before merge.

# PR Information
**Title**: ${context.title}
**Description**: ${context.description}

# Original Task
**Task Type**: ${context.task.type}
**Task Title**: ${context.task.title}
**Task Description**:
${context.task.description}

**Acceptance Criteria**:
${context.task.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

# Changes Made
\`\`\`diff
${context.diff}
\`\`\`

# Files Changed
${context.files_changed.map(f => `- ${f.filename} (+${f.additions}, -${f.deletions})`).join('\n')}

---

# Your Task

Perform a comprehensive validation of this PR across 6 dimensions. For each dimension, provide:
- **Score** (0-100)
- **Issues Found** (list specific problems)
- **Severity** (critical/high/medium/low)

## 1. Accuracy (Does implementation match requirements?)

Verify:
- All acceptance criteria are truly implemented
- No criteria partially implemented or skipped
- Implementation matches task description intent

## 2. Entropy (Is code clean and well-structured?)

Verify:
- Code is readable and maintainable
- No unnecessary complexity
- Proper error handling
- Good variable/function naming

## 3. Redundancy (Any duplicate code or logic?)

Verify:
- No copy-pasted code blocks
- No duplicate validation/transformation logic
- Shared logic extracted to utilities where appropriate

## 4. Scope Creep (Changes beyond task scope?)

Verify:
- All changes are within task scope
- No "while I'm here" refactoring unrelated to task
- No new features not in acceptance criteria
- Database migrations match task requirements

## 5. Requirements (All acceptance criteria satisfied?)

Verify:
- Each acceptance criterion checked individually
- Evidence of implementation for each
- No assumptions made without implementation

## 6. Code Quality (Follows best practices?)

Verify:
- No security vulnerabilities (SQL injection, XSS, etc.)
- No performance issues (N+1 queries, inefficient loops)
- Proper TypeScript types used
- Tests cover new code (if test task)
- Documentation updated if needed

---

# Response Format

Return a JSON object with this exact structure:

\`\`\`json
{
  "overall_score": <0-100>,
  "passed": <true if score >= 80, false otherwise>,
  "dimensions": {
    "accuracy": {
      "score": <0-100>,
      "issues": [
        {
          "severity": "critical|high|medium|low",
          "description": "...",
          "file": "path/to/file.ts",
          "line": 123,
          "suggestion": "..."
        }
      ]
    },
    "entropy": { ... },
    "redundancy": { ... },
    "scope_creep": { ... },
    "requirements": { ... },
    "code_quality": { ... }
  },
  "summary": "Brief summary of validation result"
}
\`\`\`

Be thorough but fair. A clean, well-implemented PR should score 90-100.
`;
  }

  private parseValidationResponse(response: any): ValidationResult {
    const content = response.content[0].text;

    // Extract JSON from response (may be wrapped in markdown)
    const jsonMatch = content.match(/```json\n([\s\S]+?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    const result = JSON.parse(jsonStr);

    // Flatten issues from all dimensions
    const allIssues: ValidationIssue[] = [];
    for (const [dimension, data] of Object.entries(result.dimensions)) {
      for (const issue of data.issues || []) {
        allIssues.push({
          category: dimension as any,
          severity: issue.severity,
          description: issue.description,
          file: issue.file,
          line: issue.line,
          suggestion: issue.suggestion
        });
      }
    }

    return {
      score: result.overall_score,
      passed: result.passed,
      issues: allIssues,
      summary: result.summary,
      dimensions: result.dimensions
    };
  }
}
```

### Handling Validation Failures

```typescript
async handleFinalValidationFailure(
  prNumber: number,
  validationResult: ValidationResult
) {
  const state = await this.conditionState.loadPRConditionState(prNumber);
  const validationAttempts = state.final_validation_state.validation_attempts;

  if (validationAttempts >= 2) {
    // Second failure - ESCALATE TO HUMAN
    logger.error({
      category: 'pr-workflow',
      action: 'final_validation_failed_twice',
      message: `PR #${prNumber} failed final validation twice - escalating`,
      details: {
        pr_number: prNumber,
        attempts: validationAttempts,
        score: validationResult.score,
        issues_count: validationResult.issues.length
      }
    });

    // Create human escalation task
    const escalationTask = await this.taskQueue.createTask({
      title: `ESCALATION: PR #${prNumber} failed final validation twice`,
      description: `
⚠️ **CRITICAL**: This PR has failed final validation ${validationAttempts} times and requires human review.

## Validation History

${state.final_validation_state.validation_history.map((attempt, i) => `
### Attempt ${attempt.attempt_number}
**Score**: ${attempt.score}/100
**Timestamp**: ${new Date(attempt.timestamp).toISOString()}
**Issues Found**: ${attempt.issues_found.length}
`).join('\n')}

## Latest Validation Result

**Score**: ${validationResult.score}/100
**Summary**: ${validationResult.summary}

### Issues Found (${validationResult.issues.length})

${validationResult.issues.map(issue => `
#### ${issue.category.toUpperCase()} - ${issue.severity.toUpperCase()}
${issue.description}
${issue.file ? `**File**: ${issue.file}${issue.line ? `:${issue.line}` : ''}` : ''}
${issue.suggestion ? `**Suggestion**: ${issue.suggestion}` : ''}
`).join('\n')}

## Required Actions

1. **Review PR manually**: ${this.github.getPRUrl(prNumber)}
2. **Decide**:
   - Fix issues and retry validation (if fixable)
   - Merge anyway (if validation false positive)
   - Close PR (if fundamentally flawed)
3. **Document decision** in PR comments

⚠️ **PR is marked DO NOT AUTO-MERGE** until human decision made.
      `.trim(),
      type: 'manual-intervention',
      priority: 10, // Highest priority
      assigned_agent: 'human',
      metadata: {
        pr_number: prNumber,
        validation_attempts: validationAttempts,
        validation_score: validationResult.score,
        escalation_reason: 'final_validation_failed_twice'
      }
    });

    // Update PR labels
    await this.github.addLabels(prNumber, [
      'human-review-required',
      'do-not-auto-merge',
      'validation-failed'
    ]);

    // Mark escalation triggered
    state.final_validation_state.human_escalation_triggered = true;
    await this.conditionState.savePRConditionState(state);

    // DO NOT MERGE
    return;
  }

  // First failure - spawn fix task
  logger.warn({
    category: 'pr-workflow',
    action: 'final_validation_failed_first_attempt',
    message: `PR #${prNumber} failed final validation (attempt ${validationAttempts}) - spawning fix task`,
    details: {
      pr_number: prNumber,
      score: validationResult.score,
      issues_count: validationResult.issues.length
    }
  });

  const fixTask = await this.prMonitor.spawnTaskForCondition(
    prNumber,
    'final_validation_passed',
    {
      condition_id: 'final_validation_passed',
      status: 'unmet',
      fingerprint: this.generateValidationFingerprint(validationResult),
      blocking_issues: validationResult.issues
    }
  );

  if (fixTask) {
    // Record task ID in validation history
    const lastAttempt = state.final_validation_state.validation_history[
      state.final_validation_state.validation_history.length - 1
    ];
    lastAttempt.spawned_task_id = fixTask.id;
    await this.conditionState.savePRConditionState(state);
  }
}
```

### Task Specification for Validation Fixes

```typescript
function buildTaskForValidationIssues(
  evaluation: ConditionEvaluation,
  prStatus: PRStatus,
  parentTask: Task
): TaskSpec {
  const issues = evaluation.blocking_issues as ValidationIssue[];

  // Group issues by category
  const byCategory = issues.reduce((acc, issue) => {
    if (!acc[issue.category]) acc[issue.category] = [];
    acc[issue.category].push(issue);
    return acc;
  }, {} as Record<string, ValidationIssue[]>);

  return {
    title: `Fix final validation issues on PR #${prStatus.number}`,
    description: `
⚠️ PR failed final comprehensive validation (score: ${evaluation.validation_score}/100)

**Validation Summary**: ${evaluation.validation_summary}

## Issues by Category

${Object.entries(byCategory).map(([category, categoryIssues]) => `
### ${category.toUpperCase()} (${categoryIssues.length} issue${categoryIssues.length > 1 ? 's' : ''})

${categoryIssues.map(issue => `
#### ${issue.severity.toUpperCase()}: ${issue.description}
${issue.file ? `**Location**: ${issue.file}${issue.line ? `:${issue.line}` : ''}` : ''}
${issue.suggestion ? `**Suggestion**: ${issue.suggestion}` : ''}
`).join('\n')}
`).join('\n')}

---

⚠️ **IMPORTANT**: Work from the existing PR branch "${prStatus.head.ref}"

1. **Checkout PR branch**:
   \`\`\`bash
   git fetch origin ${prStatus.head.ref}
   git checkout ${prStatus.head.ref}
   \`\`\`

2. **Fix each issue** listed above
   - Pay special attention to CRITICAL and HIGH severity issues
   - Follow suggestions provided
   - Maintain code quality and test coverage

3. **Test changes locally**:
   \`\`\`bash
   npm test
   npm run lint
   \`\`\`

4. **Push to same branch**:
   \`\`\`bash
   git push origin ${prStatus.head.ref}
   \`\`\`

⚠️ **CRITICAL**: After pushing, CI will re-run AND final validation will run again.
- If validation passes (score ≥80), PR will auto-merge
- If validation fails again, PR will be escalated to human review
- This is attempt ${evaluation.validation_attempts}/2 - next failure escalates!

**DO NOT create a new PR** - update this existing PR #${prStatus.number}
    `.trim(),

    type: 'refactoring', // or 'implementation' based on issue types
    priority: 10,

    acceptance_criteria: [
      `All ${issues.length} validation issues resolved`,
      `Final validation score ≥80`,
      `No new issues introduced`,
      `All tests still pass`,
      `Changes pushed to existing PR #${prStatus.number}`
    ],

    followup_for_pr: prStatus.number,
    pr_branch: prStatus.head.ref,
    assigned_agent: parentTask.assigned_agent || 'backend-specialist',

    metadata: {
      validation_attempt: evaluation.validation_attempts,
      validation_score: evaluation.validation_score,
      warning: 'Next validation failure will escalate to human review'
    }
  };
}
```

### Validation Score Calculation

**Overall Score**: Average of all dimension scores, weighted by severity of issues

```typescript
function calculateOverallScore(dimensions: ValidationDimensions): number {
  const dimensionScores = Object.values(dimensions).map(d => d.score);
  const averageScore = dimensionScores.reduce((a, b) => a + b, 0) / dimensionScores.length;

  // Apply penalty for critical issues
  const criticalIssues = Object.values(dimensions)
    .flatMap(d => d.issues)
    .filter(i => i.severity === 'critical');

  const penalty = criticalIssues.length * 10; // -10 points per critical issue

  return Math.max(0, Math.min(100, averageScore - penalty));
}
```

---

## Data Model

### Database Schema

#### Table: `pr_condition_states`

```sql
CREATE TABLE IF NOT EXISTS pr_condition_states (
  pr_number INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,        -- JSON serialized PRConditionState
  last_evaluated INTEGER NOT NULL, -- Unix timestamp
  last_updated INTEGER NOT NULL,   -- Last time PR was updated on GitHub
  merge_eligible BOOLEAN NOT NULL DEFAULT 0, -- All conditions met?
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_pr_condition_states_last_evaluated
  ON pr_condition_states(last_evaluated);
CREATE INDEX idx_pr_condition_states_merge_eligible
  ON pr_condition_states(merge_eligible);
```

#### Table: `pr_condition_history`

```sql
CREATE TABLE IF NOT EXISTS pr_condition_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_number INTEGER NOT NULL,
  condition_id TEXT NOT NULL,
  old_status TEXT NOT NULL,        -- 'met' | 'unmet'
  new_status TEXT NOT NULL,
  old_fingerprint TEXT,
  new_fingerprint TEXT,
  webhook_event TEXT,              -- Event that triggered change
  timestamp INTEGER NOT NULL,

  FOREIGN KEY (pr_number) REFERENCES pr_condition_states(pr_number)
);

CREATE INDEX idx_pr_condition_history_pr ON pr_condition_history(pr_number);
CREATE INDEX idx_pr_condition_history_timestamp ON pr_condition_history(timestamp);
```

### Service Interface

```typescript
class PRConditionStateService {
  /**
   * Initialize condition state for new PR
   */
  async initializePRConditionState(prNumber: number): Promise<PRConditionState>;

  /**
   * Load existing condition state
   */
  async loadPRConditionState(prNumber: number): Promise<PRConditionState | null>;

  /**
   * Save condition state
   */
  async savePRConditionState(state: PRConditionState): Promise<void>;

  /**
   * Evaluate all conditions for a PR
   */
  async evaluateAllConditions(prNumber: number): Promise<ConditionEvaluation[]>;

  /**
   * Evaluate single condition
   */
  async evaluateCondition(
    prNumber: number,
    conditionId: string
  ): Promise<ConditionEvaluation>;

  /**
   * Check if all conditions are met
   */
  allConditionsMet(state: PRConditionState): boolean;

  /**
   * Record condition change in history
   */
  async recordConditionChange(
    prNumber: number,
    conditionId: string,
    oldStatus: string,
    newStatus: string,
    oldFingerprint: string,
    newFingerprint: string,
    webhookEvent: string
  ): Promise<void>;

  /**
   * Get condition change history for PR
   */
  async getConditionHistory(prNumber: number): Promise<ConditionChange[]>;

  /**
   * Cleanup completed/failed tasks from active_fix_tasks
   */
  async cleanupInactiveTasks(prNumber: number): Promise<void>;
}
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

**Goal**: Build the foundation for continuous monitoring

1. **Create `PRConditionStateService`**
   - Database schema migration
   - CRUD operations for condition states
   - Condition evaluation functions
   - Fingerprint generation utilities

2. **Implement Condition Evaluators**
   - `evaluateCIChecksCondition()`
   - `evaluateCommentsCondition()`
   - `evaluateMergeConflictsCondition()`
   - `evaluateBranchUpdateCondition()`
   - `evaluateChangeRequestsCondition()`
   - `evaluateTaskVerificationCondition()`

3. **Testing**
   - Unit tests for each evaluator
   - Fingerprint generation tests
   - State persistence tests

**Deliverables**:
- `src/services/prConditionState.service.ts`
- Database migration script
- Unit tests

---

### Phase 2: Event-Driven Spawning (Week 2)

**Goal**: Implement event handlers and task spawning logic

1. **Refactor `GitHubWebhookHandler`**
   - Add `PRConditionStateService` dependency
   - Implement event-specific handlers
   - Add condition re-evaluation logic

2. **Implement Task Spawning**
   - `spawnTaskForCondition()` function
   - Condition-specific task builders
   - Duplicate prevention checks

3. **Partial Fix Detection**
   - `detectPartialFix()` algorithm
   - Fingerprint comparison logic
   - Progressive task spawning

4. **Testing**
   - Integration tests for each webhook event
   - Duplicate prevention tests
   - Partial fix scenario tests

**Deliverables**:
- Updated `src/services/githubWebhookHandler.service.ts`
- Task spawning logic in `src/services/prMonitor.service.ts`
- Integration tests

---

### Phase 3: Continuous Re-evaluation (Week 3)

**Goal**: Ensure continuous monitoring and re-evaluation

1. **Task Completion Hooks**
   - `onTaskComplete()` handler
   - Auto-trigger condition re-evaluation
   - Cleanup active_fix_tasks

2. **Base Branch Push Handler**
   - Monitor for base branch updates
   - Detect PRs that fell behind
   - Spawn update tasks proactively

3. **Periodic Health Check** (Optional)
   - Background job to check all open PRs
   - Detect stale PRs (> 24 hours no activity)
   - Re-evaluate conditions every 30 minutes

4. **Testing**
   - End-to-end workflow tests
   - Multi-event sequence tests
   - Stress tests (rapid webhook events)

**Deliverables**:
- Task lifecycle hooks
- Base branch monitoring
- Periodic health check job (optional)
- E2E tests

---

### Phase 4: Observability & Metrics (Week 4)

**Goal**: Add comprehensive monitoring and debugging

1. **Condition State Dashboard**
   - API endpoint: `GET /api/pr-conditions/:prNumber`
   - Returns current state, history, active tasks
   - Visualization-friendly format

2. **Metrics & Logging**
   - Condition transition metrics
   - Task spawning metrics
   - Partial fix detection metrics
   - Duplicate prevention metrics

3. **Debugging Tools**
   - Condition state inspector
   - Fingerprint comparison tool
   - Task spawn simulation (dry-run mode)

4. **Documentation**
   - API documentation
   - Troubleshooting guide
   - Runbook for common scenarios

**Deliverables**:
- `/api/pr-conditions` endpoint
- Metrics dashboard
- Debugging CLI tools
- Updated documentation

---

## Metrics & Monitoring

### Key Metrics

1. **Condition Metrics**
   - `pr_conditions_evaluated_total` (counter)
   - `pr_conditions_met_total` (counter by condition_id)
   - `pr_conditions_unmet_total` (counter by condition_id)
   - `pr_condition_transitions_total` (counter by condition_id, from_status, to_status)

2. **Task Spawning Metrics**
   - `pr_tasks_spawned_total` (counter by condition_id)
   - `pr_tasks_spawn_skipped_duplicate` (counter by condition_id)
   - `pr_partial_fixes_detected_total` (counter by condition_id)

3. **PR Health Metrics**
   - `pr_merge_eligible_total` (gauge)
   - `pr_time_to_merge_eligible_seconds` (histogram)
   - `pr_condition_blocking_duration_seconds` (histogram by condition_id)

4. **Task Success Metrics**
   - `pr_fix_tasks_completed_total` (counter by condition_id)
   - `pr_fix_tasks_failed_total` (counter by condition_id)
   - `pr_fix_success_rate` (gauge by condition_id)

### Logging Strategy

**Log Categories**:
- `pr-condition-evaluation`: Condition checks
- `pr-condition-transition`: State changes
- `pr-task-spawning`: Task creation
- `pr-duplicate-prevention`: Prevented duplicates
- `pr-partial-fix`: Partial fix detection
- `pr-merge-attempt`: Auto-merge attempts

**Log Levels**:
- INFO: Normal operations
- WARN: Unusual patterns (rapid re-evaluations, many spawns)
- ERROR: System errors, missing data

---

## Troubleshooting Guide

### Problem: Tasks Keep Getting Spawned for Same Issue

**Symptom**: Multiple tasks with same title for same PR

**Diagnosis**:
```bash
# Check condition state
curl http://localhost:5000/api/pr-conditions/96

# Look for:
# - Multiple tasks in active_fix_tasks with same fingerprint
# - Fingerprint not changing between evaluations
```

**Root Cause**: Duplicate prevention not working

**Fix**:
1. Check fingerprint generation logic
2. Verify active task cleanup
3. Check hasActiveTaskForFingerprint logic

---

### Problem: Partial Fix Not Detected

**Symptom**: All tests fixed, but new task not spawned for remaining issues

**Diagnosis**:
```bash
# Check condition history
curl http://localhost:5000/api/pr-conditions/96/history

# Look for fingerprint changes
```

**Root Cause**: Fingerprint generation issue or comparison logic

**Fix**:
1. Verify fingerprint changes when issues change
2. Check detectPartialFix logic
3. Ensure proper issue comparison

---

### Problem: Merge Not Attempted When All Conditions Met

**Symptom**: All conditions show 'met' but PR not merged

**Diagnosis**:
```bash
# Check condition state
curl http://localhost:5000/api/pr-conditions/96

# Verify:
# - All conditions.*.status === 'met'
# - merge_eligible === true
```

**Root Cause**: allConditionsMet logic or merge attempt logic

**Fix**:
1. Check allConditionsMet implementation
2. Verify merge attempt triggered in webhook handler
3. Check auto-merge configuration

---

## Example Scenarios

### Scenario 1: PR with Failing Tests → Partial Fix → Full Fix

**Timeline**:

1. **PR Created** (`pull_request.opened`)
   - CI checks start
   - State initialized

2. **Checks Complete** (`check_suite.completed`)
   - 3 tests failing: `[A, B, C]`
   - Fingerprint: `fp1`
   - Condition `ci_checks_passing`: unmet
   - **Action**: Spawn task `fix-failing-checks` for `[A, B, C]`

3. **Fix Pushed** (`pull_request.synchronize`)
   - New commits pushed
   - CI checks re-run

4. **Checks Complete** (`check_suite.completed`)
   - 1 test still failing: `[C]`
   - Fingerprint: `fp2` (DIFFERENT)
   - **Partial fix detected!** (2/3 fixed)
   - **Action**: Spawn task `fix-remaining-checks` for `[C]`

5. **Fix Pushed** (`pull_request.synchronize`)
   - New commits pushed
   - CI checks re-run

6. **Checks Complete** (`check_suite.completed`)
   - 0 tests failing: `[]`
   - Fingerprint: `fp3`
   - Condition `ci_checks_passing`: met
   - **Action**: Mark both tasks complete, re-evaluate all conditions

7. **All Conditions Met**
   - **Action**: Attempt auto-merge
   - PR merged successfully!

---

### Scenario 2: Branch Falls Behind During Fix Work

**Timeline**:

1. **PR Created**
   - Branch up-to-date with main
   - Condition `branch_updated`: met

2. **Failing Tests** (`check_suite.completed`)
   - **Action**: Spawn task `fix-failing-checks`

3. **Main Branch Advances** (`push` to main)
   - PR now behind by 2 commits
   - Condition `branch_updated`: unmet
   - **Action**: Spawn task `update-pr-branch`

4. **Branch Updated** (`pull_request.synchronize`)
   - Branch merged with main
   - Condition `branch_updated`: met
   - CI checks re-run automatically

5. **Checks Fail After Merge** (`check_suite.completed`)
   - Merge introduced new test failure
   - Fingerprint changed
   - **Action**: Spawn new task `fix-failing-checks` for new failure

6. **Fix Pushed**
   - All checks pass
   - All conditions met
   - **Action**: Auto-merge!

---

### Scenario 3: Review Comments Added Mid-Fix

**Timeline**:

1. **PR Created**
   - No review comments
   - Condition `comments_resolved`: met

2. **Failing Tests**
   - **Action**: Spawn task `fix-failing-checks`

3. **Copilot Reviews** (`pull_request_review.submitted`)
   - 2 blocking comments added
   - Condition `comments_resolved`: unmet
   - **Action**: Spawn task `address-review-comments`

4. **Tests Fixed** (`pull_request.synchronize`)
   - Condition `ci_checks_passing`: met
   - Condition `comments_resolved`: still unmet

5. **Comments Addressed** (`pull_request.synchronize`)
   - Code changed at commented lines
   - Condition `comments_resolved`: met
   - **Action**: Mark comment task complete

6. **All Conditions Met**
   - **Action**: Auto-merge!

---

## Conclusion

This continuous PR self-healing system provides:

1. **Guaranteed Quality**: PRs NEVER merge unless ALL conditions satisfied
2. **Intelligent Automation**: Condition-specific tasks with clear instructions
3. **Adaptive Healing**: Handles partial fixes and changing conditions
4. **Zero Duplicates**: Fingerprint-based deduplication
5. **Complete Observability**: Full history and metrics for debugging

The system transforms PR workflow from reactive (merge → fail → manual fix) to proactive (detect → fix → verify → merge), ensuring only the highest quality code enters the main branch.

**Next Steps**: Begin Phase 1 implementation of core infrastructure.
