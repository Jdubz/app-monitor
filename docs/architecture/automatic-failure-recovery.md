# Automatic Failure Recovery System

**Last Updated:** 2025-11-06
**Status:** Design Phase
**Location:** `backend/src/services/failureRecovery.ts`

## Overview

A self-healing bot system that automatically attempts to recover from task failures through a two-stage recovery process:

1. **Cleanup Bot** - Analyzes failure, categorizes issue, attempts safe fix
2. **Follow-up Bot** - Reviews cleanup patch, completes original task goal

## Architecture

```
┌─────────────────────┐
│ Task Fails          │
│ (Original Bot)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Failure Guard Detection             │
│ - Pattern matching                  │
│ - Categorization                    │
│ - Recovery eligibility check        │
└──────────┬──────────────────────────┘
           │
      ┌────┴────┐
      │ Should  │
      │ Recover?│
      └────┬────┘
           │
     ┌─────┴──────┐
     │ Yes        │ No
     ▼            ▼
┌─────────────┐  ┌──────────────┐
│ Cleanup Bot │  │ Mark Failed  │
│ Stage 1     │  │ For Review   │
└──────┬──────┘  └──────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Cleanup Bot Execution        │
│ 1. Analyze failure context   │
│ 2. Categorize error type     │
│ 3. Determine safe fix scope  │
│ 4. Apply minimal fix         │
│ 5. Generate patch            │
└──────┬───────────────────────┘
       │
  ┌────┴─────┐
  │ Success? │
  └────┬─────┘
       │
  ┌────┴────────┐
  │ Yes         │ No
  ▼             ▼
┌─────────────┐ ┌──────────────┐
│ Follow-up   │ │ Mark Failed  │
│ Bot Stage 2 │ │ For Review   │
└──────┬──────┘ └──────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Follow-up Bot Execution      │
│ 1. Review cleanup patch      │
│ 2. Validate against prompt   │
│ 3. Complete original task    │
│ 4. Generate final patch      │
└──────┬───────────────────────┘
       │
  ┌────┴─────┐
  │ Success? │
  └────┬─────┘
       │
  ┌────┴────────┐
  │ Yes         │ No
  ▼             ▼
┌─────────────┐ ┌──────────────────┐
│ Mark        │ │ Same failure?    │
│ Complete    │ │                  │
└─────────────┘ └────┬─────────────┘
                     │
                ┌────┴────┐
                │ Yes     │ No
                ▼         ▼
           ┌──────────┐ ┌─────────────┐
           │ Hard Fail│ │ Retry Stage │
           │ For      │ │ 1 Once More │
           │ Review   │ └─────────────┘
           └──────────┘
```

## Recovery Eligibility

### Recoverable Failure Categories

| Category | Auto-Recovery | Cleanup Strategy | Safety Level |
|----------|---------------|------------------|--------------|
| `cli_incompatibility` | ✅ Yes | Fix CLI arguments | 🟢 Safe |
| `permission_denied` | ⚠️ Conditional | Check/fix permissions | 🟡 Medium |
| `resource_not_found` | ✅ Yes | Create missing resources | 🟢 Safe |
| `configuration_error` | ⚠️ Conditional | Update config files | 🟡 Medium |
| `syntax_error` | ✅ Yes | Fix syntax issues | 🟢 Safe |
| `import_error` | ✅ Yes | Add missing imports | 🟢 Safe |
| `timeout` | ❌ No | Requires manual review | 🔴 Unsafe |
| `oom` | ❌ No | Requires architecture change | 🔴 Unsafe |
| `system_error` | ❌ No | Requires manual review | 🔴 Unsafe |

### Non-Recoverable Scenarios

**Hard fail immediately without recovery:**
- Same failure pattern in cleanup AND follow-up bots
- Destructive operations detected (file deletion, database drops)
- Security-critical changes required
- Already attempted recovery once (no infinite loops)
- Failure category marked as unsafe for auto-recovery

## Safety Guards

### 1. Complexity Assessment

```typescript
interface ComplexityCheck {
  filesModified: number;      // Max 5 for auto-recovery
  linesChanged: number;       // Max 100 for auto-recovery
  criticalPaths: string[];    // No changes to critical files
  destructiveOps: boolean;    // Must be false
  externalDeps: boolean;      // No new external dependencies
}
```

**Auto-recovery allowed only if:**
- `filesModified <= 5`
- `linesChanged <= 100`
- `criticalPaths.length === 0`
- `destructiveOps === false`
- `externalDeps === false`

### 2. Critical File Protection

**Never auto-modify these without human review:**
```typescript
const CRITICAL_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'docker-compose.yml',
  'Dockerfile',
  '.env',
  '.env.production',
  'backend/src/server.ts',
  'backend/src/index.ts',
  'backend/database/**',
  '**/migrations/**',
  '**/*.sql'
];
```

### 3. Operation Blacklist

**Forbidden operations in auto-recovery:**
```typescript
const FORBIDDEN_OPERATIONS = [
  /rm\s+-rf/,                    // Recursive delete
  /DROP\s+TABLE/i,               // Database drops
  /DELETE\s+FROM/i,              // Database deletes
  /npm\s+uninstall/,             // Package removal
  /git\s+reset\s+--hard/,        // Git hard reset
  /sudo/,                        // Elevated privileges
  /chmod\s+777/,                 // Dangerous permissions
  /\.env.*=.*password/i,         // Credential changes
];
```

### 4. Retry Limits

```typescript
interface RecoveryAttemptTracker {
  taskId: string;
  originalFailurePattern: string;
  cleanupAttempts: number;        // Max 1
  followupAttempts: number;       // Max 1
  totalRecoveryTime: number;      // Max 10 minutes
}
```

## Cleanup Bot Specification

### Input Context

```typescript
interface CleanupBotContext {
  originalTask: Task;
  failurePattern: FailurePattern;
  stderr: string;
  stdout: string;
  exitCode: number;
  uncommittedChanges: string;     // Git diff before failure
  artifacts: {
    logs: string[];
    patches: string[];
  };
}
```

### Cleanup Bot Prompt Template

```typescript
const CLEANUP_BOT_PROMPT = `
# CLEANUP BOT - Failure Recovery Stage 1

You are a specialized cleanup bot designed to analyze and fix bot task failures.

## Your Mission
1. Analyze the failure context below
2. Identify the root cause
3. Determine if it's safe to auto-fix
4. Apply MINIMAL changes to resolve the failure
5. Generate a clean patch

## Failure Context

**Original Task:**
{originalTask.title}
{originalTask.description}

**Failure Category:** {failurePattern.category}
**Failure Pattern:** {failurePattern.name}
**Exit Code:** {exitCode}

**Error Output:**
\`\`\`
{stderr}
\`\`\`

**Uncommitted Changes (if any):**
\`\`\`diff
{uncommittedChanges}
\`\`\`

**Suggested Fix:** {failurePattern.suggestedFix}

## Safety Constraints

❌ DO NOT:
- Make changes to package.json or dependencies
- Modify critical system files (database, configs, Dockerfiles)
- Perform destructive operations
- Change more than 5 files
- Add more than 100 lines of code
- Modify authentication or security code

✅ DO:
- Fix syntax errors
- Add missing imports
- Correct CLI argument usage
- Fix file paths
- Add minimal configuration
- Keep changes focused and minimal

## Output Format

Analyze the failure and respond with:

1. **Root Cause Analysis** (2-3 sentences)
2. **Safety Assessment** (Safe/Unsafe for auto-recovery, explain why)
3. **Proposed Fix** (Minimal changes needed)
4. **Expected Outcome** (What should work after fix)

If safe, apply the minimal fix and commit with message:
"fix: cleanup bot - {brief description}"

If unsafe, explain why manual review is required.
`;
```

### Cleanup Bot Success Criteria

✅ **Success** if:
- Bot completes without errors
- Changes are within safety limits
- Patch addresses the failure pattern
- No new failures introduced

❌ **Failure** if:
- Bot encounters same failure pattern
- Changes exceed safety limits
- Introduces new errors
- Takes >5 minutes

## Follow-up Bot Specification

### Input Context

```typescript
interface FollowupBotContext {
  originalTask: Task;
  cleanupBotPatch: string;
  cleanupBotSummary: string;
  originalPrompt: string;
  currentState: string;           // Git diff after cleanup
}
```

### Follow-up Bot Prompt Template

```typescript
const FOLLOWUP_BOT_PROMPT = `
# FOLLOW-UP BOT - Failure Recovery Stage 2

You are a specialized follow-up bot that completes work after cleanup.

## Your Mission
1. Review the cleanup bot's fix
2. Verify it addressed the failure
3. Complete the original task goal
4. Ensure all acceptance criteria met

## Context

**Original Task:**
{originalTask.title}
{originalTask.description}

**Acceptance Criteria:**
{originalTask.acceptanceCriteria.map(c => \`- \${c}\`).join('\\n')}

**Cleanup Bot Summary:**
{cleanupBotSummary}

**Cleanup Bot Changes:**
\`\`\`diff
{cleanupBotPatch}
\`\`\`

**Current State:**
\`\`\`diff
{currentState}
\`\`\`

## Your Tasks

1. **Validate Cleanup**
   - Does the cleanup fix address the original failure?
   - Are the changes appropriate and minimal?
   - Any issues introduced?

2. **Complete Original Goal**
   - Review acceptance criteria
   - Identify remaining work
   - Complete the implementation

3. **Quality Check**
   - All acceptance criteria met?
   - Code follows project standards?
   - Tests passing?

## Safety Constraints

Same constraints as cleanup bot:
- Max 5 files modified (total with cleanup)
- Max 100 lines changed (total with cleanup)
- No critical file modifications
- No destructive operations

## Output Format

1. **Cleanup Review** (Is the fix good? Any issues?)
2. **Remaining Work** (What's left to complete original task?)
3. **Implementation Plan** (Steps to complete)
4. **Completion Status** (Done/Needs more work/Blocked)

Complete the work and commit with message:
"feat: follow-up bot - {brief description}"
`;
```

### Follow-up Bot Success Criteria

✅ **Success** if:
- All acceptance criteria met
- Original task goal achieved
- Changes pass validation
- No new failures introduced

❌ **Failure** if:
- Same failure pattern as original
- Cannot meet acceptance criteria
- Introduces breaking changes
- Takes >10 minutes

## Implementation Strategy

### 1. Recovery Orchestrator

```typescript
class FailureRecoveryOrchestrator {
  async attemptRecovery(
    failedTask: Task,
    failureContext: FailureContext
  ): Promise<RecoveryResult> {

    // Check if recovery is appropriate
    if (!this.isRecoverable(failureContext)) {
      return { status: 'not_recoverable', reason: '...' };
    }

    // Track recovery attempt
    const recoveryId = this.trackRecoveryAttempt(failedTask);

    // Stage 1: Cleanup Bot
    const cleanupResult = await this.runCleanupBot(failedTask, failureContext);

    if (cleanupResult.status === 'failed') {
      return this.handleCleanupFailure(cleanupResult);
    }

    // Stage 2: Follow-up Bot
    const followupResult = await this.runFollowupBot(
      failedTask,
      cleanupResult
    );

    if (followupResult.status === 'failed') {
      return this.handleFollowupFailure(followupResult, cleanupResult);
    }

    // Success!
    return {
      status: 'recovered',
      cleanupPatch: cleanupResult.patch,
      followupPatch: followupResult.patch,
      totalDuration: Date.now() - recoveryId.startTime
    };
  }
}
```

### 2. Safety Analyzer

```typescript
class SafetyAnalyzer {
  analyzeChanges(patch: string): SafetyAnalysis {
    return {
      filesModified: this.countFiles(patch),
      linesChanged: this.countLines(patch),
      criticalPaths: this.findCriticalPaths(patch),
      destructiveOps: this.detectDestructiveOps(patch),
      externalDeps: this.detectNewDependencies(patch),
      isSafe: this.evaluateSafety()
    };
  }

  evaluateSafety(): boolean {
    return (
      this.filesModified <= 5 &&
      this.linesChanged <= 100 &&
      this.criticalPaths.length === 0 &&
      !this.destructiveOps &&
      !this.externalDeps
    );
  }
}
```

### 3. Recovery State Machine

```typescript
type RecoveryState =
  | 'evaluating_eligibility'
  | 'running_cleanup_bot'
  | 'validating_cleanup'
  | 'running_followup_bot'
  | 'validating_followup'
  | 'recovered'
  | 'hard_failed';

class RecoveryStateMachine {
  async transition(
    from: RecoveryState,
    event: RecoveryEvent
  ): Promise<RecoveryState> {
    // State transition logic with safety checks
  }
}
```

## Database Schema Extensions

```sql
-- Recovery attempt tracking
CREATE TABLE recovery_attempts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  original_failure_pattern TEXT NOT NULL,
  cleanup_bot_task_id TEXT,
  followup_bot_task_id TEXT,
  status TEXT NOT NULL, -- 'running', 'recovered', 'failed', 'abandoned'
  stage TEXT NOT NULL, -- 'cleanup', 'followup'
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  total_duration_ms INTEGER,
  recovery_summary TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (cleanup_bot_task_id) REFERENCES tasks(id),
  FOREIGN KEY (followup_bot_task_id) REFERENCES tasks(id)
);

-- Safety analysis results
CREATE TABLE recovery_safety_checks (
  id TEXT PRIMARY KEY,
  recovery_attempt_id TEXT NOT NULL,
  check_type TEXT NOT NULL, -- 'cleanup', 'followup'
  files_modified INTEGER NOT NULL,
  lines_changed INTEGER NOT NULL,
  critical_paths_touched TEXT, -- JSON array
  destructive_ops_detected BOOLEAN NOT NULL,
  external_deps_added BOOLEAN NOT NULL,
  is_safe BOOLEAN NOT NULL,
  analysis_details TEXT, -- JSON
  FOREIGN KEY (recovery_attempt_id) REFERENCES recovery_attempts(id)
);
```

## Monitoring & Metrics

### Key Metrics

1. **Recovery Success Rate**
   - % of failures that auto-recovered
   - By failure category
   - By complexity level

2. **Recovery Duration**
   - Average time for cleanup bot
   - Average time for follow-up bot
   - Total recovery time distribution

3. **Safety Analysis**
   - % of recoveries within safety limits
   - Critical path violations prevented
   - Destructive operations blocked

4. **Failure Patterns**
   - Most common recoverable failures
   - Most common non-recoverable failures
   - Patterns that need new guards

### Logging

```typescript
// Cleanup bot started
logger.info({
  category: 'recovery',
  action: 'cleanup_bot_started',
  message: 'Starting cleanup bot for failed task',
  details: {
    taskId,
    failurePattern: pattern.name,
    recoveryAttemptId
  }
});

// Safety analysis
logger.info({
  category: 'recovery',
  action: 'safety_analysis_complete',
  message: 'Safety analysis for recovery changes',
  details: {
    filesModified: 3,
    linesChanged: 45,
    isSafe: true,
    criticalPathsAvoided: 0
  }
});

// Recovery success
logger.info({
  category: 'recovery',
  action: 'recovery_succeeded',
  message: 'Task recovered successfully',
  details: {
    taskId,
    recoveryDuration: 180000,
    stages: ['cleanup', 'followup']
  }
});
```

## Testing Strategy

### Unit Tests

```typescript
describe('FailureRecoveryOrchestrator', () => {
  it('should not attempt recovery for unsafe failure categories', () => {
    const result = orchestrator.attemptRecovery(task, {
      failurePattern: { category: 'oom' }
    });
    expect(result.status).toBe('not_recoverable');
  });

  it('should block recovery with critical file modifications', () => {
    const patch = 'diff --git a/package.json ...';
    const safety = analyzer.analyzeChanges(patch);
    expect(safety.isSafe).toBe(false);
  });

  it('should hard fail after same failure in both stages', async () => {
    // Mock cleanup bot failure
    // Mock followup bot with same failure pattern
    const result = await orchestrator.attemptRecovery(task, context);
    expect(result.status).toBe('hard_failed');
    expect(result.reason).toContain('same failure pattern');
  });
});
```

### Integration Tests

```typescript
describe('Full Recovery Flow', () => {
  it('should recover from CLI incompatibility error', async () => {
    // Create task with invalid CLI args
    // Let it fail
    // Verify cleanup bot fixes CLI args
    // Verify follow-up bot completes task
    // Check final result meets acceptance criteria
  });

  it('should abort recovery when safety limits exceeded', async () => {
    // Mock cleanup bot that modifies 10 files
    // Verify recovery is aborted
    // Verify task marked for manual review
  });
});
```

## Rollout Plan

### Phase 1: Foundation (Week 1)
- [ ] Implement `FailureRecoveryOrchestrator`
- [ ] Implement `SafetyAnalyzer`
- [ ] Add database schema
- [ ] Create recovery prompt templates

### Phase 2: Cleanup Bot (Week 2)
- [ ] Integrate cleanup bot trigger
- [ ] Implement safety checks
- [ ] Add complexity analysis
- [ ] Test with CLI incompatibility failures

### Phase 3: Follow-up Bot (Week 3)
- [ ] Implement follow-up bot trigger
- [ ] Add patch validation
- [ ] Implement completion verification
- [ ] Test full recovery flow

### Phase 4: Production Hardening (Week 4)
- [ ] Add comprehensive logging
- [ ] Implement metrics collection
- [ ] Create monitoring dashboards
- [ ] Document all recovery scenarios

## Future Enhancements

### 1. Learning from Recoveries
- Track which fix patterns work best
- Suggest proactive improvements
- Auto-update failure guards based on successful recoveries

### 2. Recovery Confidence Scoring
```typescript
interface RecoveryConfidence {
  score: number; // 0-100
  factors: {
    failurePatternKnown: boolean;
    similarSuccessfulRecoveries: number;
    safetyMargin: number;
    complexityRating: number;
  };
}
```

### 3. Human-in-the-Loop Option
- Send notification before recovery
- Allow human to approve/reject
- Provide recovery preview

### 4. Recovery Templates
- Pre-defined fix patterns for common failures
- Faster recovery for known issues
- Reduced bot execution time

## Summary

This automatic failure recovery system provides:

✅ **Self-healing** - Automatically attempts to fix common failures
✅ **Safety-first** - Multiple guards prevent dangerous operations
✅ **Two-stage recovery** - Cleanup + follow-up for comprehensive fixes
✅ **Smart failure detection** - Uses existing failure guards
✅ **Hard fail protection** - Prevents infinite recovery loops
✅ **Audit trail** - Complete tracking and logging

The system will significantly reduce manual intervention for recoverable failures while maintaining strict safety boundaries for critical operations.
