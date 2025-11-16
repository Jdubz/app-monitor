# Task Processing Stage Redesign - Implementation Clarifications

**Date:** 2025-11-16
**Status:** Ready for Implementation
**Parent Design:** `task-processing-stage-redesign.md`

---

## Overview

This document captures critical implementation decisions made during design review. These clarifications transform the high-level design into actionable implementation guidance.

---

## Migration Strategy

**Decision:** Bold, clean break from legacy system

- ✅ **Drop legacy REVIEW/FIX task creation** - Remove all code creating separate child tasks
- ✅ **No migration of in-flight chains** - Can cancel/reset all existing work
- ✅ **Database reset acceptable** - No important data to preserve
- ✅ **Zero legacy code** - All code, documentation, and tests MUST support new architecture
- ❌ **No dual-mode support** - No compatibility layer for old task chains

**Rationale:** Clean slate enables simpler, more maintainable implementation without technical debt.

---

## Agent Selection

**CRITICAL CORRECTION:** The design document incorrectly specified agent preferences per phase.

**Decision:** Agent selection is ALWAYS delegated to `AgentSelector` service

- ✅ **AgentSelector is authoritative** - Only this service decides which agent to use
- ✅ **No hardcoded agent preferences** - Phase definitions do NOT specify agents
- ✅ **Clean up incorrect docs** - Remove all references to "Claude for implementation, Codex for review"
- ✅ **Recovery Agent selected dynamically** - AgentSelector chooses recovery agent based on context

**Action Items:**
1. Remove agent preferences from phase definitions
2. Update all documentation removing agent assignment claims
3. Ensure phase orchestration calls AgentSelector for every execution

---

## Phase Structure

### Collapsed Phases

**Decision:** Merge Phase 5 (Test Coverage) and Phase 6 (Test Runs) into single phase

**Final 7-Phase Structure:**

| Phase | Name | Purpose | Loop Type |
|-------|------|---------|-----------|
| 1 | Planning | Validate task relevance, gather requirements | Linear |
| 2 | Implementation | Write code, create PR | Linear |
| 3 | Review | Identify code issues with fingerprints | Loop with 4 |
| 4 | Fixes | Correct issues from review | Loop back to 3 |
| 5 | Test Coverage & Validation | Write tests, run suite, fix failures | Internal loop |
| 6 | Cleanup & Docs | Update docs, prune artifacts | Linear |
| 7 | PR Shepherding | Monitor merge gates, auto-merge | Linear |

### Phase Loops

**Phase 3↔4 Loop (Review/Fix):**
```
Phase 3 (Review) → finds issues
  ↓
Phase 4 (Fixes) → applies fixes to ALL issues
  ↓
Phase 3 (Review) → re-verifies
  ↓
[Loop continues until clean OR max 4 loops]
  ↓
Phase 5 (Tests)
```

**Phase 5 Internal Loop (Test Coverage):**
```
Container starts
  ↓
SCRIPT: Run all tests (unit, integration, e2e, lint, tsc, build)
SCRIPT: Generate coverage report on changed files
  ↓
Coverage delta check:
- If coverage maintained AND all tests pass → Phase 6
- If coverage decreased OR tests fail → Launch agent
  ↓
AGENT: Write new tests, fix test failures
  (Agent may run individual tests to verify, but NOT full suite)
  ↓
BACKEND: docker exec run-tests.sh (full suite)
  ↓
[Loop continues until pass OR max 4 iterations]
```

**Key Differences:**
- **3↔4 loop:** Crosses phase boundary, creates separate `task_stage_runs` records
- **Phase 5 loop:** Internal to phase, increments `phase_attempts` but stays in phase 5

---

## Retry and Attempt Limits

**Decision:** Per-loop retry caps with uniform 4-attempt limit

### Attempt Tracking

- **Global limit:** 4 attempts per loop before escalation
- **Phase 3↔4 loop:** Max 4 review/fix cycles
- **Phase 5 loop:** Max 4 test coverage iterations
- **Recovery attempts:** Standard 4-retry limit applies to recovery itself

### Counter Behavior

```typescript
// Phase 3→4→3→4 loop
task_stage_runs:
- phase_index: 3, attempt: 1 (found 5 issues)
- phase_index: 4, attempt: 1 (fixed all 5)
- phase_index: 3, attempt: 2 (found 2 remaining)
- phase_index: 4, attempt: 2 (fixed 2)
- phase_index: 3, attempt: 3 (clean!)

// Phase 5 internal loop
task_stage_runs:
- phase_index: 5, attempt: 1 (coverage low, tests fail)
- phase_index: 5, attempt: 2 (added tests, still failing)
- phase_index: 5, attempt: 3 (fixed failures, coverage good!)

tasks table:
- phase_attempts: Tracks current phase iteration
- Resets to 1 when advancing to new phase (except loops)
```

---

## Container Lifecycle and Recovery

### Same Container for Recovery

**Decision:** Recovery Agent runs in same container as failed phase

**Rationale:**
- ✅ Workspace preserved - Uncommitted changes available for inspection
- ✅ Performance - No container teardown/startup overhead
- ✅ Loop efficiency - Phase 3↔4 and 5 loops iterate without container churn
- ✅ Context continuity - Recovery sees exact state that caused failure

**Implementation:**
```typescript
async completePhase(worker: EphemeralWorker, output: string, exitCode: number) {
  // Validation runs BEFORE container destruction
  const validation = await this.validatePhaseArtifacts(worker);
  
  if (validation.failed) {
    // Keep container alive, inject recovery agent
    worker.status = 'recovering';
    const recoveryAgent = await this.agentSelector.selectRecoveryAgent(worker.task);
    const recoveryResult = await this.executeRecoveryInContainer(
      worker.containerId,
      recoveryAgent,
      validation.errors
    );
    
    // Process recovery decision, then destroy container
    await this.handleRecoveryResult(worker, recoveryResult);
  } else {
    // Validation passed - destroy container
    await this.workerService.cleanup(worker);
  }
}
```

### Multi-Agent Container

**Decision:** Single container image with all agent CLIs pre-installed

- ✅ Claude Code CLI
- ✅ Codex CLI  
- ✅ Gemini CLI
- ✅ Copilot CLI (if applicable)

**Rationale:** Simplifies agent switching during recovery without container rebuild complexity.

---

## Artifact Storage

### Hybrid Storage Strategy

**Decision:** Structured data in DB, large files on host filesystem

**Storage Locations:**

| Artifact Type | Storage | Location | Mounted To Container |
|---------------|---------|----------|---------------------|
| Structured JSON (planning, review issues, fixes) | Database | `task_stage_runs.artifacts_blob` | N/A (queried) |
| Large files (coverage reports, test logs) | Host filesystem | `/opt/app-monitor/shared/artifacts/{taskId}/` | `/workspace/.artifacts/` |
| Code changes | Git | PR branch commits | `/workspace/` (git clone) |

**Examples:**

```typescript
// Phase 3 - Review Issues (DB)
artifacts_blob: {
  issues: [
    {
      fingerprint: "sha256:abc123...",
      severity: "critical",
      file: "backend/src/auth.ts",
      line: 42,
      description: "Unsafe password comparison",
      blocking: true
    }
  ],
  total_issues: 5,
  blocking_issues: 2
}

// Phase 5 - Test Results (Filesystem + DB)
// DB stores summary:
artifacts_blob: {
  tests_passing: false,
  coverage_delta: -5.2,
  failures: [
    { suite: "auth.test.ts", test: "login validation", error: "..." }
  ]
}

// Filesystem stores full reports:
/opt/app-monitor/shared/artifacts/task-abc/
  ├── coverage.lcov (large file)
  ├── test-results.json (full output)
  └── e2e-screenshots/ (binary files)
```

**Retention:** Keep all artifacts indefinitely (address retention in later phase)

---

## Validation and Recovery

### Validation Execution

**Decision:** Validation runs before container termination

**Flow:**
```
Phase execution completes
  ↓
TaskCompletionService receives output
  ↓
Extract artifacts from container to host filesystem
  ↓
Run validation against artifacts + output
  ↓
┌─────────────┬──────────────────────────────────┐
│ Validation  │ Action                           │
├─────────────┼──────────────────────────────────┤
│ PASS        │ Record success, destroy container│
│ FAIL        │ Trigger Recovery Agent (same ctr)│
└─────────────┴──────────────────────────────────┘
```

### Recovery Agent

**Purpose:** Diagnose validation failures and categorize response

**Structured Response:**
```typescript
interface RecoveryResult {
  category: 'retry' | 'context_update' | 'chain_blocked' | 'system_blocked';
  diagnosis: string;
  suggested_action?: {
    prompt_update?: string;
    phase_override?: number;
    context_additions?: string[];
  };
  artifacts?: Record<string, unknown>;
}
```

**Recovery Actions:**

| Category | Action | Container Fate |
|----------|--------|----------------|
| `retry` | Requeue same phase, increment attempts | Destroy |
| `context_update` | Update task prompt, requeue phase | Destroy |
| `chain_blocked` | Block chain, alert human | Destroy |
| `system_blocked` | Escalate globally, pause all work | Destroy |

**Recovery Failure Handling:**
- Recovery Agent itself can fail (crash, timeout, invalid response)
- Programmatic diagnosis first: Critical error vs. bot gave up
- Recovery attempts subject to same 4-retry limit
- If recovery fails 4 times → chain blocked, human intervention required

---

## Phase State Tracking

### Database Schema

```sql
-- tasks table additions
ALTER TABLE tasks ADD COLUMN phase_index INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN phase_name TEXT;
ALTER TABLE tasks ADD COLUMN phase_status TEXT CHECK(phase_status IN ('ready', 'running', 'validating', 'recovering', 'complete', 'blocked'));
ALTER TABLE tasks ADD COLUMN phase_attempts INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN phase_payload TEXT; -- JSON for phase-specific state

-- task_stage_runs table (new) - historical record
CREATE TABLE task_stage_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  phase_index INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'recovered', 'blocked')),
  artifacts_blob TEXT, -- JSON structured data
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  recovery_diagnosis TEXT, -- JSON if recovery ran
  exit_code INTEGER,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_stage_runs_task ON task_stage_runs(task_id, phase_index);
CREATE INDEX idx_stage_runs_status ON task_stage_runs(status);
```

### State Machine Logic

**Decision:** Hardcoded in `PhaseOrchestratorService`

```typescript
class PhaseOrchestratorService {
  determineNextPhase(currentPhase: number, validation: ValidationResult): number {
    // Phase 3↔4 loop
    if (currentPhase === 3 && validation.issuesFound) return 4;
    if (currentPhase === 4) return 3; // Always re-review after fixes
    
    // Phase 5 internal loop
    if (currentPhase === 5 && !validation.allTestsPassing) return 5;
    
    // Phase 1 early termination
    if (currentPhase === 1 && validation.taskObsolete) {
      return null; // Cancel task
    }
    
    // Normal linear progression
    return currentPhase + 1;
  }
}
```

---

## Phase 5 Test Loop Details

### Test Execution Flow

**Container starts:**
1. **Entrypoint script runs FIRST** (before agent):
   ```bash
   #!/bin/bash
   # /workspace/run-tests.sh
   
   # Build project
   npm run build || exit 1
   
   # Run all test suites
   npm test --coverage || true
   npm run test:integration || true
   npm run test:e2e || true
   
   # Run linters and type checks
   npm run lint || true
   npm run tsc --noEmit || true
   
   # Generate coverage report for changed files
   /scripts/coverage-delta.sh > /workspace/.artifacts/coverage-delta.json
   
   # Output test results
   echo "Tests complete - see /workspace/.artifacts/"
   ```

2. **Entrypoint analyzes results:**
   - If all pass + coverage maintained → Exit success (skip agent)
   - If failures or coverage decreased → Launch agent

3. **Agent executes** (if needed):
   - Prompt: "Coverage decreased by 5.2% on changed files. Test failures: [list]. Write tests and fix failures."
   - Agent writes tests, fixes failures
   - Agent MAY run individual tests to verify fixes: `npm test auth.test.ts`
   - Agent does NOT run full suite (token waste)

4. **Backend orchestrates next iteration:**
   ```typescript
   await docker.exec(containerId, '/workspace/run-tests.sh');
   const results = await extractTestResults(containerId);
   ```

5. **Loop continues** until pass or 4 attempts exceeded

### Coverage Baseline Strategy

**Decision:** Delta analysis on changed files (Option C)

```typescript
interface CoverageDelta {
  changedFiles: string[];
  baseline: {
    totalCoverage: 85.2,
    changedFilesCoverage: 90.1
  };
  current: {
    totalCoverage: 84.8,
    changedFilesCoverage: 82.3
  };
  delta: -7.8; // Changed files coverage decreased by 7.8%
  passing: false; // Below 80% threshold for new code
}
```

**Validation Criteria (ALL must pass):**
- ✅ All unit tests passing
- ✅ All integration tests passing
- ✅ All e2e tests passing
- ✅ Linting passing (`npm run lint`)
- ✅ Type checking passing (`tsc --noEmit`)
- ✅ Build succeeds (`npm run build`)
- ✅ Coverage on changed files ≥80%

### Test Suite Scope

**Container workspace:** Full monorepo at `/workspace`

**Test commands:**
```bash
# Backend tests
cd /workspace/backend && npm test --coverage

# Frontend tests  
cd /workspace/frontend && npm test --coverage

# E2E tests (from root)
cd /workspace && npm run test:e2e

# Combined coverage report
nyc merge coverage/ .nyc_output/coverage.json
```

---

## Phase Validation Specifications

### Phase 1: Planning

**Artifacts:**
```typescript
// DB: artifacts_blob
{
  obsolete: boolean;
  obsolete_reason?: string;
  task_realigned: boolean;
  realignment_details?: string;
  dependencies: string[];
  architecture_notes: string;
  estimated_complexity: 'low' | 'medium' | 'high';
}
```

**Validation:**
- ✅ JSON structure valid
- ✅ If `obsolete: true`, task cancelled
- ✅ If `task_realigned: true`, update task prompt/description

### Phase 2: Implementation

**Artifacts:**
```typescript
// DB: artifacts_blob
{
  pr_number: number;
  pr_url: string;
  branch_name: string;
  commits: number;
  files_changed: string[];
}

// Git: Commits on PR branch
```

**Validation:**
- ✅ PR created (pr_number exists)
- ✅ Branch exists in GitHub
- ✅ At least 1 commit pushed
- ✅ PR is open (not closed/merged)

### Phase 3: Review

**Artifacts:**
```typescript
// DB: artifacts_blob
{
  issues: Array<{
    fingerprint: string; // SHA256 of (file + line + description)
    severity: 'critical' | 'major' | 'minor';
    file: string;
    line: number;
    description: string;
    blocking: boolean;
  }>;
  total_issues: number;
  blocking_issues: number;
  review_passed: boolean;
}
```

**Validation:**
- ✅ Valid JSON schema
- ✅ All issues have unique fingerprints
- ✅ If `review_passed: true` → Phase 5
- ✅ If `total_issues > 0` → Phase 4

### Phase 4: Fixes

**Artifacts:**
```typescript
// DB: artifacts_blob
{
  fixes_applied: Array<{
    fingerprint: string; // Matches issue from Phase 3
    resolution: string;
    files_modified: string[];
    commits: string[];
  }>;
  unresolved_fingerprints: string[];
  all_issues_addressed: boolean;
}

// Git: Fix commits on PR branch
```

**Validation:**
- ✅ Valid JSON schema
- ✅ Check `fixes_applied` against previous Phase 3 `issues`
- ✅ If `all_issues_addressed: false` → Another Phase 4 (not Phase 3!)
- ✅ If `all_issues_addressed: true` → Phase 3 for re-review
- ✅ At least 1 commit pushed (fixes must be committed)

**Critical Logic:**
```typescript
// Only return to Phase 3 if ALL issues have fix attempts
if (!allIssuesAddressed) {
  // Stay in Phase 4, increment attempts
  return { nextPhase: 4, reason: 'Not all issues addressed yet' };
} else {
  // All issues have fixes, re-review them
  return { nextPhase: 3, reason: 'Re-verify all fixes' };
}
```

### Phase 5: Test Coverage & Validation

**Artifacts:**
```typescript
// DB: artifacts_blob
{
  all_tests_passing: boolean;
  coverage_delta: number; // % change on modified files
  test_summary: {
    unit: { total: number, passed: number, failed: number },
    integration: { total: number, passed: number, failed: number },
    e2e: { total: number, passed: number, failed: number }
  };
  lint_passing: boolean;
  type_check_passing: boolean;
  build_passing: boolean;
  failures: Array<{
    suite: string;
    test: string;
    error: string;
  }>;
}

// Filesystem: /workspace/.artifacts/
// - coverage.lcov
// - test-results.json
// - e2e-screenshots/
```

**Validation:**
- ✅ `all_tests_passing: true`
- ✅ `coverage_delta >= -0.1` (allow tiny decrease)
- ✅ `lint_passing: true`
- ✅ `type_check_passing: true`
- ✅ `build_passing: true`
- ✅ If any false → Loop Phase 5, increment attempts

### Phase 6: Cleanup & Docs

**Artifacts:**
```typescript
// DB: artifacts_blob
{
  docs_updated: string[]; // Files updated
  docs_deleted: string[]; // Files deleted (per DOCUMENTATION_SYSTEM.md)
  artifacts_pruned: string[]; // .phase-artifacts/ cleaned up
  changelog_entry: string;
}

// Git: Doc commits
```

**Validation:**
- ✅ Follows `docs/guides/DOCUMENTATION_SYSTEM.md` rules
- ✅ Phase artifacts cleaned from PR (no `.phase-artifacts/` in final commit)
- ✅ At least 1 commit if docs changed

### Phase 7: PR Shepherding

**Artifacts:**
```typescript
// DB: artifacts_blob
{
  merge_gates: {
    base_branch_updated: boolean;
    no_merge_conflicts: boolean;
    review_comments_resolved: boolean;
    change_requests_addressed: boolean;
    ci_checks_passing: boolean;
    copilot_review_complete: boolean;
    task_verification_passed: boolean;
    final_validation_clean: boolean;
  };
  all_gates_passing: boolean;
  auto_merge_triggered: boolean;
  merge_sha?: string;
}
```

**Validation:**
- ✅ All 8 merge gates passing
- ✅ PR merged successfully
- ✅ Task marked complete

**Integration:** Leverages existing PR tracking system (`prMonitor.service.ts`, `prConditions/`)

---

## Cleanup Tasks

### Code Removal

**Files/Functions to DELETE:**
- [ ] Legacy REVIEW task creation in `TaskCompletionService`
- [ ] Legacy FIX task creation in `TaskCompletionService`
- [ ] Child task spawning logic in `DevBotsManager`
- [ ] `queue_stage` references (replaced by `phase_index`)
- [ ] Separate REVIEW/FIX agent logic

**Schema Changes:**
- [ ] Remove `queue_stage` column (replaced by `phase_index`)
- [ ] Remove `original_task_id` column (no more child tasks)
- [ ] Add phase columns to `tasks` table
- [ ] Create `task_stage_runs` table

### Documentation Updates

**Files to UPDATE:**
- [ ] `docs/architecture/task-queue-architecture.md` - Document phase system
- [ ] `docs/architecture/pr-tracking-architecture.md` - Update Phase 7 integration
- [ ] `docs/architecture/master-design-intent.md` - Update task chain section
- [ ] Remove agent assignment claims from ALL docs

**Files to DELETE:**
- [ ] `docs/technicalDesigns/staged-task-queue.md` (superseded)
- [ ] This clarifications doc (after implementation complete)

### Script Updates

**Files to UPDATE:**
- [ ] `monitor-tasks.js` - Read `phase_index` instead of task type
- [ ] `analyze-tasks.js` - Phase-based analysis
- [ ] Frontend dashboards - Show phase progress

---

## Implementation Checklist

### Phase 1: Database & Schema (Day 1)
- [ ] Create migration for `tasks` table phase columns
- [ ] Create `task_stage_runs` table
- [ ] Remove `queue_stage`, `original_task_id` columns
- [ ] Backfill existing tasks (can reset all to phase 1)

### Phase 2: Phase Orchestration (Day 2-3)
- [ ] Create `PhaseOrchestratorService`
- [ ] Implement `determineNextPhase` state machine
- [ ] Implement `advancePhase` logic
- [ ] Create phase validation framework

### Phase 3: Container & Recovery (Day 4-5)
- [ ] Update `EphemeralWorkerService` to keep containers alive during validation
- [ ] Implement Recovery Agent execution in same container
- [ ] Implement multi-agent CLI switching
- [ ] Implement artifact extraction to host filesystem + DB

### Phase 4: Phase Validators (Day 6-8)
- [ ] Implement Phase 1 validator (planning)
- [ ] Implement Phase 2 validator (implementation)
- [ ] Implement Phase 3 validator (review)
- [ ] Implement Phase 4 validator (fixes)
- [ ] Implement Phase 5 validator (tests)
- [ ] Implement Phase 6 validator (cleanup)
- [ ] Implement Phase 7 validator (PR shepherding)

### Phase 5: Test Infrastructure (Day 9-10)
- [ ] Create `/workspace/run-tests.sh` entrypoint
- [ ] Implement coverage delta calculator
- [ ] Implement test result aggregation
- [ ] Update Docker image with all test tooling

### Phase 6: Cleanup & Integration (Day 11-12)
- [ ] Remove legacy REVIEW/FIX task creation
- [ ] Update queue pulling logic to use phases
- [ ] Update chain tracking for phase-based completion
- [ ] Update frontend to display phase progress

### Phase 7: Documentation (Day 13)
- [ ] Update architecture docs
- [ ] Remove incorrect agent assignment claims
- [ ] Create phase development guide
- [ ] Delete obsolete technical designs

### Phase 8: Testing & Validation (Day 14)
- [ ] Integration tests for phase loops
- [ ] Recovery Agent failure scenarios
- [ ] Artifact storage/retrieval tests
- [ ] End-to-end task execution through all phases

---

**Implementation Complete When:**
- ✅ Single task progresses through all 7 phases
- ✅ Phase 3↔4 loop works (max 4 iterations)
- ✅ Phase 5 internal loop works (max 4 iterations)
- ✅ Recovery Agent successfully diagnoses failures
- ✅ All legacy REVIEW/FIX code removed
- ✅ Documentation updated and accurate
- ✅ Tests passing for all phase transitions

