# Automatic Failure Recovery - Quick Start

**Status:** Implementation Complete (Integration Pending)
**Created:** 2025-11-06

## What Is This?

A self-healing bot system that automatically fixes common bot failures using a two-stage recovery process:

1. **Cleanup Bot** - Analyzes error, applies minimal fix
2. **Follow-up Bot** - Completes original task goal

## Quick Example

```
❌ Task Fails: "codex: not found"
    ↓
✅ Cleanup Bot: Installs Codex CLI
    ↓
✅ Follow-up Bot: Completes original task
    ↓
✅ Task Succeeded (Automatically Recovered)
```

## Safety Guarantees

### Hard Limits
- ✅ Max 5 files modified
- ✅ Max 100 lines changed
- ✅ No critical files (package.json, .env, Dockerfile, etc.)
- ✅ No destructive ops (rm -rf, DROP TABLE, etc.)
- ✅ No dependency changes
- ✅ Max 1 recovery attempt per task

### What Gets Auto-Fixed

| Failure Type | Auto-Recovery | Example |
|--------------|---------------|---------|
| CLI incompatibility | ✅ Yes | Wrong command args |
| Missing resources | ✅ Yes | File not found |
| Syntax errors | ✅ Yes | Missing semicolon |
| Import errors | ✅ Yes | Missing import |
| Permission denied | ⚠️ Maybe | File permissions |
| Config errors | ⚠️ Maybe | Invalid config value |
| Timeout | ❌ No | Needs architecture fix |
| Out of Memory | ❌ No | Needs architecture fix |

### What Never Gets Auto-Fixed

❌ **Never automatically modified:**
- package.json / package-lock.json
- Dockerfiles
- .env files
- Database files/migrations
- Authentication code
- Anything requiring sudo
- Anything that deletes data

## Integration Steps

### 1. Add to devBotsManager.ts

```typescript
import { FailureRecoveryOrchestrator } from './failureRecovery.js';

class DevBotsManager {
  private recoveryOrchestrator: FailureRecoveryOrchestrator;

  constructor() {
    // ... existing code ...
    this.recoveryOrchestrator = new FailureRecoveryOrchestrator(this);
  }

  private async handleTaskFailure(task: Task, context: FailureContext) {
    // Existing failure detection
    const failurePattern = detectFailurePattern(stderr, stdout, exitCode);

    // NEW: Attempt automatic recovery
    if (failurePattern) {
      const recoveryResult = await this.recoveryOrchestrator.attemptRecovery({
        task,
        failurePattern,
        stderr,
        stdout,
        exitCode,
        uncommittedChanges: await this.getUncommittedChanges(),
        artifacts: {
          logs: [...],
          patches: [...]
        }
      });

      if (recoveryResult.status === 'recovered') {
        logger.info({
          category: 'recovery',
          action: 'task_auto_recovered',
          message: `Task ${task.id} automatically recovered`,
          details: { ...recoveryResult }
        });
        // Mark task as recovered (not failed)
        return;
      }
    }

    // Existing failure handling
    this.taskQueue.failTask(task.id, errorMessage);
  }
}
```

### 2. Add Database Tables

```sql
-- See backend/migrations/XXX_add_recovery_tables.sql

CREATE TABLE recovery_attempts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  original_failure_pattern TEXT NOT NULL,
  cleanup_bot_task_id TEXT,
  followup_bot_task_id TEXT,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  total_duration_ms INTEGER,
  recovery_summary TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE recovery_safety_checks (
  id TEXT PRIMARY KEY,
  recovery_attempt_id TEXT NOT NULL,
  check_type TEXT NOT NULL,
  files_modified INTEGER NOT NULL,
  lines_changed INTEGER NOT NULL,
  critical_paths_touched TEXT,
  destructive_ops_detected BOOLEAN NOT NULL,
  external_deps_added BOOLEAN NOT NULL,
  is_safe BOOLEAN NOT NULL,
  analysis_details TEXT,
  FOREIGN KEY (recovery_attempt_id) REFERENCES recovery_attempts(id)
);
```

### 3. Enable Recovery (Feature Flag)

```typescript
// backend/src/config.ts
export const FEATURE_FLAGS = {
  AUTOMATIC_RECOVERY_ENABLED: process.env.ENABLE_AUTO_RECOVERY === 'true',
  RECOVERY_DRY_RUN: process.env.RECOVERY_DRY_RUN === 'true'
};

// Use dry run mode to test without actually running recovery bots
if (FEATURE_FLAGS.AUTOMATIC_RECOVERY_ENABLED) {
  if (FEATURE_FLAGS.RECOVERY_DRY_RUN) {
    logger.info('Recovery would be attempted (dry run mode)');
  } else {
    await this.recoveryOrchestrator.attemptRecovery(context);
  }
}
```

## Testing

### Test Recovery Flow

```bash
# 1. Enable recovery in dry-run mode
export ENABLE_AUTO_RECOVERY=true
export RECOVERY_DRY_RUN=true

# 2. Create a task that will fail with CLI incompatibility
curl -X POST http://localhost:5000/api/dev-bots/tasks -H "Content-Type: application/json" -d '{
  "type": "implementation",
  "title": "Test recovery system",
  "description": "This task will fail with codex CLI error",
  "acceptanceCriteria": ["Task completes successfully"],
  "assignedAgent": "codex"
}'

# 3. Check logs for recovery evaluation
tail -f /tmp/backend-server.log | grep recovery

# Expected output:
# [INFO] recovery:evaluating_recovery - Evaluating recovery for failed task
# [INFO] recovery:recovery_eligible - Recovery eligible: CLI incompatibility
# [INFO] recovery:cleanup_bot_would_start - Would start cleanup bot (dry run)
```

### Verify Safety Analyzer

```bash
# Test safety analysis directly
cd backend
npm run test -- safety

# Should verify:
# ✅ Detects critical file modifications
# ✅ Detects destructive operations
# ✅ Counts files/lines correctly
# ✅ Blocks unsafe changes
```

## Monitoring

### Key Logs to Watch

```bash
# Recovery attempts
grep "recovery:evaluating_recovery" /tmp/backend-server.log

# Recovery success
grep "recovery:recovery_succeeded" /tmp/backend-server.log

# Safety violations
grep "recovery:cleanup_unsafe" /tmp/backend-server.log

# Hard fails
grep "recovery:same_failure_pattern_detected" /tmp/backend-server.log
```

### Metrics Dashboard (Future)

- Recovery success rate by category
- Average recovery duration
- Safety violations prevented
- Most common auto-fixed failures

## Rollout Plan

### Phase 1: Dry Run Testing ✅
- [x] Implement core recovery system
- [x] Add safety analyzer
- [ ] Enable dry-run mode
- [ ] Test with historical failures
- [ ] Verify safety checks work

### Phase 2: Limited Rollout
- [ ] Enable for CLI incompatibility only
- [ ] Monitor for 1 week
- [ ] Verify no false positives
- [ ] Collect success metrics

### Phase 3: Expand Categories
- [ ] Add syntax_error recovery
- [ ] Add import_error recovery
- [ ] Add resource_not_found recovery
- [ ] Monitor each for 1 week

### Phase 4: Full Production
- [ ] Enable all recoverable categories
- [ ] Add monitoring dashboards
- [ ] Document common recovery patterns
- [ ] Create runbooks for manual review

## Troubleshooting

### Recovery Not Triggering

**Check:**
1. Is `ENABLE_AUTO_RECOVERY=true`?
2. Is failure pattern detected?
3. Is category recoverable?
4. Has recovery already been attempted?

**Debug:**
```typescript
logger.debug({
  category: 'recovery',
  action: 'eligibility_check',
  details: {
    hasFailurePattern: !!context.failurePattern,
    category: context.failurePattern?.category,
    isRecoverable: RECOVERABLE_CATEGORIES.has(category),
    alreadyAttempted: this.hasAttemptedRecovery(taskId)
  }
});
```

### Recovery Blocked by Safety

**Expected behavior** - Safety analyzer should block:
- Changes to package.json
- Changes to >5 files
- Changes >100 lines
- Destructive operations

**Review logs:**
```bash
grep "cleanup_unsafe" /tmp/backend-server.log
# Shows: violations: ["Critical paths modified: package.json"]
```

### Same Failure in Both Stages

**Expected behavior** - Hard fail if cleanup AND follow-up encounter same error

**Indicates:**
- Fix didn't work
- Deeper issue than expected
- Needs human review

**Action:**
Review both bot logs to understand why fix didn't work.

## Next Steps

1. **Enable Dry Run** - Test recovery logic without running bots
2. **Add Database Tables** - Store recovery attempts
3. **Integrate into devBotsManager** - Hook into failure handler
4. **Test with Real Failures** - Use the 3 stuck Codex tasks
5. **Monitor & Iterate** - Tune safety limits, add more patterns

## Summary

✅ **Implemented:**
- FailureRecoveryOrchestrator
- SafetyAnalyzer
- Two-stage recovery (cleanup + followup)
- Multiple safety guards
- Comprehensive logging

⏳ **Pending:**
- Database integration
- devBotsManager integration
- Feature flag configuration
- Testing & validation
- Production rollout

🎯 **Goal:**
Reduce manual intervention for common failures by 70-80% while maintaining 100% safety guarantees.
