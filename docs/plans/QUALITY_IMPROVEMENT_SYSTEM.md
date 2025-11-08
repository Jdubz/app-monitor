# Quality Improvement System - Implementation Plan

**Created:** November 7, 2025
**Status:** Planning
**Priority:** Critical for POC

## Executive Summary

Transform the current pass/fail verification system into an observational quality improvement system that automatically spawns follow-up tasks to address quality issues on the same PR branch, ensuring all work is tracked in a single PR.

## Current State Analysis

### What We Have
1. **TaskVerificationService** - Validates acceptance criteria, test coverage, and scope boundaries
2. **QualityGateValidator** - Runs linting, testing, type checking, documentation, git, and build checks
3. **SimpleFailureRecovery** - Creates cleanup tasks for failed tasks
4. **TaskCompletionService** - Orchestrates task completion with quality checks
5. **PR Workflow** - Tracks PRs from creation to merge

### Current Problems
- Tasks fail when quality thresholds aren't met
- No automated remediation for quality issues
- Quality fixes require new PRs instead of updating existing ones
- Manual intervention needed for common quality problems

## Proposed Architecture

### Core Principle
**"Observe, Record, and Improve"** - Never fail a task for quality issues. Instead, record observations and spawn improvement tasks that commit to the same branch.

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                 Task Execution Flow                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Initial Task Execution                              │
│     └─> Creates PR on feature branch                    │
│                                                          │
│  2. Quality Observation (Non-blocking)                  │
│     ├─> Acceptance Criteria Check → Record              │
│     ├─> Test Coverage Check → Record                    │
│     ├─> Scope Boundary Check → Record                   │
│     └─> Quality Gates Check → Record                    │
│                                                          │
│  3. Quality Analysis                                    │
│     └─> Identify improvement opportunities              │
│                                                          │
│  4. Improvement Task Generation                         │
│     ├─> Coverage Improvement Task                       │
│     ├─> Lint Fix Task                                   │
│     ├─> Documentation Update Task                       │
│     └─> Test Addition Task                              │
│                                                          │
│  5. Improvement Execution                               │
│     └─> Each task commits to same branch                │
│                                                          │
│  6. PR Update & Monitoring                              │
│     └─> Single PR tracks all improvements               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Quality Observation System (Week 1)

#### 1.1 Create QualityObservationService
```typescript
interface QualityObservation {
  taskId: string;
  prNumber?: number;
  branch: string;
  timestamp: string;
  observations: {
    acceptanceCriteria: AcceptanceCriteriaObservation;
    testCoverage: TestCoverageObservation;
    scopeBoundaries: ScopeBoundaryObservation;
    qualityGates: QualityGateObservation[];
  };
  improvementOpportunities: ImprovementOpportunity[];
  overallScore: number;
}

interface ImprovementOpportunity {
  type: 'coverage' | 'lint' | 'test' | 'docs' | 'criteria' | 'scope';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  estimatedEffort: number; // minutes
  automatable: boolean;
  suggestedFix: string;
}
```

**Files to Create:**
- `backend/src/services/qualityObservation.service.ts`
- `backend/src/services/qualityObservation.service.test.ts`

#### 1.2 Update TaskVerificationService
- Change from pass/fail to observation recording
- Remove `passed` boolean from result
- Add `observations` and `opportunities` arrays
- Generate improvement recommendations

**Files to Modify:**
- `backend/src/services/taskVerification.service.ts`
- `backend/src/services/taskCompletion.service.ts`

### Phase 2: Improvement Task Generation (Week 1-2)

#### 2.1 Create QualityImprovementTaskGenerator
```typescript
interface ImprovementTask {
  parentTaskId: string;
  prNumber: number;
  branch: string;
  type: 'quality-improvement';
  subtype: 'coverage' | 'lint' | 'test' | 'docs' | 'criteria';
  title: string;
  description: string;
  acceptanceCriteria: string[];
  estimatedEffort: {
    hours: number;
    complexity: 'trivial' | 'simple' | 'moderate';
    confidence: 'high';
  };
  autoExecutable: boolean;
  contextFromParent: {
    files: string[];
    issues: QualityIssue[];
    targetMetrics: QualityMetrics;
  };
}
```

**Files to Create:**
- `backend/src/services/qualityImprovementTaskGenerator.ts`
- `backend/src/services/qualityImprovementTemplates.ts`

#### 2.2 Improvement Task Templates

**Coverage Improvement Task:**
```typescript
{
  title: "Increase test coverage to 80% for PR #${prNumber}",
  description: "Add missing tests to meet coverage threshold",
  acceptanceCriteria: [
    "Test coverage >= 80%",
    "All new tests pass",
    "No existing tests broken"
  ],
  instructions: [
    "Run npm test:coverage to identify gaps",
    "Focus on uncovered branches and functions",
    "Add unit tests for critical paths",
    "Ensure tests are meaningful, not just coverage padding"
  ]
}
```

**Lint Fix Task:**
```typescript
{
  title: "Fix linting errors for PR #${prNumber}",
  description: "Resolve all ESLint errors and warnings",
  acceptanceCriteria: [
    "npm run lint passes with no errors",
    "No --no-verify flags used",
    "Code remains functional"
  ]
}
```

**Documentation Update Task:**
```typescript
{
  title: "Update documentation for PR #${prNumber}",
  description: "Ensure documentation reflects code changes",
  acceptanceCriteria: [
    "README updated if needed",
    "API docs updated for new endpoints",
    "JSDoc comments added for new functions",
    "No broken documentation links"
  ]
}
```

**Acceptance Criteria Completion Task:**
```typescript
{
  title: "Complete unmet criteria for PR #${prNumber}",
  description: "Address remaining acceptance criteria items",
  acceptanceCriteria: originalUnmetCriteria,
  context: {
    whatWasMissed: string[],
    suggestedApproach: string
  }
}
```

### Phase 3: Branch-Aware Task Execution (Week 2)

#### 3.1 Update EphemeralWorkerService
- Add branch context to worker creation
- Ensure workers check out correct branch
- Preserve branch state between tasks

**Modifications Required:**
```typescript
async createWorker(task: Task, agent: AgentPersonality): Promise<EphemeralWorker> {
  // If improvement task, checkout parent branch
  if (task.type === 'quality-improvement') {
    const parentTask = this.taskQueue.getTask(task.parentTaskId);
    const branch = parentTask.pr_branch || `task-${parentTask.id}`;
    await this.checkoutBranch(branch);
  }
}
```

#### 3.2 Update Git Workflow
- Ensure improvement tasks commit to existing branch
- No new branches for improvement tasks
- Preserve commit history

### Phase 4: PR Update Integration (Week 2)

#### 4.1 Update PRWorkflowOrchestrator
- Track improvement tasks per PR
- Update PR description with improvement status
- Monitor combined quality metrics

**PR Description Template:**
```markdown
## Original Task
- **ID**: ${taskId}
- **Title**: ${taskTitle}
- **Status**: ✅ Complete

## Quality Improvements
| Task | Type | Status | Score |
|------|------|--------|-------|
| #123 | Coverage | ✅ Complete | +15% |
| #124 | Linting | 🔄 Running | - |
| #125 | Docs | ⏳ Queued | - |

## Overall Quality Score
- **Before**: 65/100
- **Current**: 82/100
- **Target**: 90/100

## Checks
- [ ] Acceptance Criteria: 100%
- [x] Test Coverage: 82% (target: 80%)
- [x] Linting: Passing
- [x] Type Check: Passing
- [ ] Documentation: In Progress
```

### Phase 5: Automated Improvement Execution (Week 3)

#### 5.1 Auto-executable Improvements
Some improvements can be fully automated:

**Auto-fixable:**
- ESLint fixes (`eslint --fix`)
- Prettier formatting
- Simple import sorting
- Basic documentation generation

**Semi-automated:**
- Test generation (with AI assistance)
- Coverage improvement (identify and generate tests)
- Documentation updates (generate from code)

#### 5.2 Create AutoImprovementExecutor
```typescript
class AutoImprovementExecutor {
  async executeAutoFixes(task: ImprovementTask): Promise<ExecutionResult> {
    switch(task.subtype) {
      case 'lint':
        return this.runESLintFix(task);
      case 'format':
        return this.runPrettier(task);
      case 'imports':
        return this.organizeImports(task);
    }
  }
}
```

### Phase 6: Quality Tracking & Learning (Week 3-4)

#### 6.1 Quality Metrics Database
Track quality improvements over time:

```sql
CREATE TABLE quality_metrics (
  id INTEGER PRIMARY KEY,
  task_id TEXT NOT NULL,
  pr_number INTEGER,
  metric_type TEXT NOT NULL,
  value_before REAL,
  value_after REAL,
  improvement_tasks TEXT, -- JSON array of task IDs
  time_to_quality_ms INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE quality_patterns (
  id INTEGER PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  frequency INTEGER DEFAULT 1,
  avg_fix_time_ms INTEGER,
  auto_fixable BOOLEAN,
  suggested_prevention TEXT
);
```

#### 6.2 Learning System
- Identify recurring quality issues
- Suggest preventive measures
- Improve task templates based on patterns

## Success Metrics (QM-1)

The stabilization plan requires **exactly four** execution-quality metrics: scope compliance, duplication prevention, git workflow success, and feature creep containment. These metrics power the quality dashboard, alerting, and follow-up automation tasks mandated by QM-1.

### Primary Metric Summary

| # | Metric | Definition (rolling 7-day window unless noted) | Target | Yellow | Red | Emergency |
|---|--------|-----------------------------------------------|--------|--------|-----|-----------|
| 1 | **Scope Compliance Rate (SCR)** | Completed automation runs with zero scope boundary violations ÷ total completed runs. | 100% | < 98% | < 95% | < 90% |
| 2 | **Duplication Prevention Rate (DPR)** | Runs with no duplicate code/task detections ÷ total runs. | 100% | < 99% | < 97% | < 95% |
| 3 | **Git Workflow Success Rate (GWSR)** | Runs that complete `branch → commit → push → PR` with PR metadata captured ÷ total runs. | 100% | < 98% | < 95% | < 90% |
| 4 | **Feature Creep Containment (FCC)** | Runs that stay within declared change budgets (files & new lines) ÷ total runs. | 100% | < 97% | < 94% | < 90% |

Outputs:
- Real-time gauges over SSE topic `quality-metrics`.
- 15-minute aggregations persisted to `quality_metrics` (extend `metric_type` with the four QM-1 keys).
- Daily Slack digest summarizing 7-day and 30-day averages plus incident links.

### 1. Scope Compliance Rate (SCR)

**Purpose:** Guarantee that every bot task honors explicit scope boundaries so no extra features or files slip in.

**Key Data Sources**
- `backend/src/services/taskVerification.service.ts` – emits `scopeBoundaries` verdicts for each run.
- `backend/src/services/scopeControl.service.ts` – logs violation chains/clean-room rebuilds.
- `backend/migrations/005_quality_observations.sql` – `quality_observations.scope_boundaries_observation` JSON payload.
- `backend/migrations/004_task_context.sql` – `task_file_operations` captures file/line deltas for validation.

**Collection & Storage**
1. Completion webhook records the verification payload + `scope_boundaries_observation`.
2. Aggregator job (every 5 minutes) executes:
   ```sql
   WITH completed AS (
     SELECT t.id,
            json_extract(q.scope_boundaries_observation, '$.status') AS status
     FROM tasks t
     LEFT JOIN quality_observations q ON q.task_id = t.id
     WHERE t.status = 'completed'
       AND t.completed_at >= strftime('%s','now','-7 days') * 1000
   )
   SELECT
     1.0 - (
       CAST(SUM(CASE WHEN status = 'violation' THEN 1 ELSE 0 END) AS REAL) /
       NULLIF(COUNT(*), 0)
     ) AS scope_compliance_rate;
   ```
3. Persist to `quality_metrics(metric_type='scope_compliance', value_after=<rate>)`.

**Alerting**
- **Yellow** when SCR < 98% for two consecutive aggregates (alert via `scripts/alert-v3-failures.sh` webhook).
- **Red** below 95% and **Emergency** below 90% pause new assignments and spawn `scope-cleanup` repair tasks.

### 2. Duplication Prevention Rate (DPR)

**Purpose:** Ensure bots extend existing implementations instead of recreating code or submitting duplicate tasks.

**Key Data Sources**
- `backend/src/services/devBotsManager.ts` – `checkDuplicateTask()` warns (`action: 'duplicate_task_detected'`) when fingerprints collide.
- `backend/migrations/004_task_context.sql` – `task_file_operations.diff_path` stores per-file diffs for duplicate hashing.
- `docs/plans/BOT_PROMPT_ENGINEERING_V3.md` – mandates `mustNotDuplicate` & `doNotCreate` lists in every template.
- Structured logs `logs/dev-monitor-backend.log` (category `process`).

**Collection & Storage**
1. Each duplicate-task attempt appends `{ "type": "duplication", "fingerprint": "<hash>" }` to `quality_observations.improvement_opportunities`.
2. Code-level duplication scan hashes each staged diff (`task_file_operations.diff_path`) and checks for identical hashes introduced elsewhere in the window.
3. Aggregation:
   ```sql
   WITH window AS (
     SELECT id,
            json_array_length(
              json_extract(improvement_opportunities, '$[?(@.type=\"duplication\")]')
            ) AS dup_hits
     FROM quality_observations
     WHERE timestamp >= strftime('%s','now','-7 days') * 1000
   )
   SELECT 1.0 - (
     CAST(SUM(CASE WHEN dup_hits > 0 THEN 1 ELSE 0 END) AS REAL) /
     NULLIF(COUNT(*), 0)
   ) AS duplication_prevention_rate;
   ```
4. Persist to `quality_metrics(metric_type='duplication_prevention', value_after=<rate>)`.

**Alerting**
- **Yellow** below 99% (≥1 duplicate per 100 tasks).
- **Red** below 97% spawns `cleanup-deduplicate` tasks defined in `scopeControl.service.ts`.
- **Emergency** below 95% blocks new task intake pending manual template review.

### 3. Git Workflow Success Rate (GWSR)

**Purpose:** Confirm every autonomous run follows the PR-based workflow (`docs/plans/PR_BASED_WORKFLOW.md`).

**Key Data Sources**
- `task_git_operations` table (from `backend/migrations/004_task_context.sql`) – captures git commands per run.
- `task_automation_runs` – start/finish times + status.
- `pr_quality_history` (`backend/migrations/005_quality_observations.sql`) – tracks PR readiness.

**Collection & Storage**
1. A run counts as successful when `task_git_operations` shows `checkout -b`, `git commit`, `git push`, `gh pr create`, and `tasks.pr_number` (or `pr_quality_history`) is populated.
2. Aggregation:
   ```sql
   WITH runs AS (
     SELECT tar.run_id,
            MIN(CASE WHEN command LIKE '%checkout -b%' THEN 1 ELSE 0 END) AS has_branch,
            MIN(CASE WHEN command LIKE '%git commit%' THEN 1 ELSE 0 END) AS has_commit,
            MIN(CASE WHEN command LIKE '%git push%' THEN 1 ELSE 0 END) AS has_push,
            MIN(CASE WHEN command LIKE '%gh pr create%' THEN 1 ELSE 0 END) AS has_pr
     FROM task_git_operations
     JOIN task_automation_runs tar ON tar.run_id = task_git_operations.run_id
     WHERE tar.completed_at >= strftime('%s','now','-7 days') * 1000
     GROUP BY tar.run_id
   )
   SELECT
     CAST(SUM(CASE WHEN has_branch AND has_commit AND has_push AND has_pr THEN 1 ELSE 0 END) AS REAL) /
     NULLIF(COUNT(*), 0) AS git_workflow_success_rate;
   ```
3. Persist to `quality_metrics(metric_type='git_workflow_success', value_after=<rate>)`.

**Alerting**
- **Yellow** when missing workflow steps exceed 2% of runs.
- **Red** (>5%) auto-creates a `workflow-recovery` task to inspect the failing commands.
- **Emergency** (≥10%) pauses automation until GitHub auth/network issues resolve.

### 4. Feature Creep Containment (FCC)

**Purpose:** Prevent tasks from expanding beyond declared change budgets (files touched, new files, diff size).

**Key Data Sources**
- `docs/dev-bots/SCOPE_CONTROL_SYSTEM.md` – defines boundaries & cleanup tasks.
- `docs/plans/BOT_PROMPT_ENGINEERING_V3.md` – templates declare `doNotCreate`, `EXACTLY N` requirements, and max budgets.
- `task_file_operations` + `task_artifacts` (diff previews) from `backend/migrations/004_task_context.sql`.
- `quality_observations.scope_boundaries_observation` (migrations/005) – records when budgets were exceeded.

**Collection & Storage**
1. Templates must include numeric budgets (`max_lines`, `max_new_files`) stored alongside each task.
2. Diff summarizer joins budgets to observed changes:
   ```sql
   WITH diffs AS (
     SELECT tar.task_id,
            SUM(CASE WHEN tfo.operation IN ('write','edit')
                     THEN ABS(tfo.lines_after - tfo.lines_before) ELSE 0 END) AS lines_changed,
            SUM(CASE WHEN tfo.operation = 'write' AND tfo.lines_before IS NULL THEN 1 ELSE 0 END) AS new_files
     FROM task_file_operations tfo
     JOIN task_automation_runs tar ON tar.run_id = tfo.run_id
     WHERE tar.completed_at >= strftime('%s','now','-7 days') * 1000
     GROUP BY tar.task_id
   )
   SELECT
     CAST(SUM(CASE WHEN lines_changed <= meta.max_lines
                        AND new_files <= meta.max_new_files THEN 1 ELSE 0 END) AS REAL) /
     NULLIF(COUNT(*), 0) AS feature_creep_containment
   FROM diffs
   JOIN task_metadata meta ON meta.task_id = diffs.task_id;
   ```
3. Overflow events append `{ "type": "feature_creep", "budget": { ... } }` to `quality_observations.improvement_opportunities`.
4. Persist aggregates as `quality_metrics(metric_type='feature_creep', value_after=<rate>)`.

**Alerting**
- **Yellow** when ≥3% of runs exceed budgets.
- **Red** when ≥6% – enqueue `cleanup-scope` tasks that revert offending files.
- **Emergency** when ≥10% – freeze automation until templates are corrected.

### Instrumentation Checklist
1. Extend `quality_metrics.metric_type` check constraint with the four QM-1 keys and backfill dashboard queries.
2. Ensure `TaskAutomationManager` writes one `quality_observations` row per run that includes scope, duplication, and feature-creep metadata.
3. Expose `/api/quality-metrics/latest` so the dashboard and `scripts/monitor-v3-tasks.sh` can poll the live values.
4. Update `scripts/alert-v3-failures.sh` (Slack webhook) to trigger on the Yellow/Red/Emergency bands defined above.

## Implementation Priority

### Week 1: Core Observation System
1. ✅ QualityObservationService (Phase 1.1)
2. ✅ Update TaskVerificationService (Phase 1.2)
3. ✅ Basic improvement opportunity detection

### Week 2: Task Generation & Execution
1. ⏳ QualityImprovementTaskGenerator (Phase 2.1)
2. ⏳ Task templates (Phase 2.2)
3. ⏳ Branch-aware execution (Phase 3)

### Week 3: PR Integration & Automation
1. ⏳ PR update integration (Phase 4)
2. ⏳ Auto-executable improvements (Phase 5.1)
3. ⏳ AutoImprovementExecutor (Phase 5.2)

### Week 4: Tracking & Optimization
1. ⏳ Quality metrics database (Phase 6.1)
2. ⏳ Learning system (Phase 6.2)
3. ⏳ Performance optimization

## Risk Mitigation

### Technical Risks
1. **Branch Conflicts**: Mitigate with frequent rebasing
2. **Infinite Improvement Loops**: Set max improvement iterations (3-5)
3. **Resource Exhaustion**: Limit concurrent improvement tasks
4. **Git History Pollution**: Squash improvement commits before merge

### Process Risks
1. **Quality Standard Creep**: Define clear, stable thresholds
2. **Over-automation**: Keep human review for critical changes
3. **Task Queue Overflow**: Prioritize improvements by impact

## Configuration

### Environment Variables
```bash
# Quality thresholds
QUALITY_MIN_COVERAGE=80
QUALITY_MAX_LINT_ERRORS=0
QUALITY_DOC_REQUIRED=true

# Improvement limits
MAX_IMPROVEMENT_TASKS_PER_PR=5
MAX_IMPROVEMENT_ITERATIONS=3
AUTO_FIX_ENABLED=true

# Timeouts
IMPROVEMENT_TASK_TIMEOUT_MS=300000  # 5 minutes
QUALITY_CHECK_TIMEOUT_MS=60000      # 1 minute
```

### Feature Flags
```typescript
const QUALITY_FEATURES = {
  enableAutoFix: true,
  enableCoverageImprovement: true,
  enableDocGeneration: false, // Experimental
  enableTestGeneration: false, // Experimental
  requireQualityBeforeMerge: true
};
```

## Testing Strategy

### Unit Tests
- QualityObservationService
- QualityImprovementTaskGenerator
- AutoImprovementExecutor
- Template generation

### Integration Tests
- Full quality improvement flow
- PR update workflow
- Branch management
- Task chaining

### E2E Tests
- Complete task → observation → improvement → merge flow
- Multi-task PR scenarios
- Failure recovery
- Concurrent improvements

## Rollout Plan

### Phase 1: Shadow Mode (Week 1)
- Run observations without creating tasks
- Log improvement opportunities
- Validate detection accuracy

### Phase 2: Manual Trigger (Week 2)
- Create improvement tasks on demand
- Require human approval
- Monitor success rate

### Phase 3: Auto-trigger for Simple Fixes (Week 3)
- Auto-create lint fix tasks
- Auto-create formatting tasks
- Track automation success

### Phase 4: Full Automation (Week 4)
- All improvement types automated
- Human review only for complex cases
- Continuous quality improvement

## Success Criteria

### POC Success (2 weeks)
- [ ] 10+ tasks improved automatically
- [ ] 80% of PRs meet quality threshold
- [ ] 50% reduction in manual quality fixes

### Production Ready (4 weeks)
- [ ] 100+ tasks improved successfully
- [ ] 90% PR merge rate
- [ ] 75% automation rate
- [ ] Quality patterns identified and prevented

## Related Documents
- [BOT_PROMPT_ENGINEERING_V3.md](BOT_PROMPT_ENGINEERING_V3.md)
- [TASK_QUEUE_SQLITE_MIGRATION.md](TASK_QUEUE_SQLITE_MIGRATION.md)
- [APP_MONITOR_CAPABILITY_ROADMAP.md](APP_MONITOR_CAPABILITY_ROADMAP.md)

---

**Status**: Ready for implementation
**Next Steps**: Begin Phase 1 - Create QualityObservationService
