# Task Failure Guards System

**Last Updated:** 2025-11-06
**Status:** Active
**Location:** `backend/src/services/taskFailureGuards.ts`

## Overview

The Failure Guards system automatically detects, classifies, and cleans up stuck or failed bot tasks based on common error patterns. This prevents resource leaks, provides actionable insights for debugging, and ensures the system remains healthy even when tasks encounter errors.

## Key Features

### 1. **Pattern-Based Failure Detection**
Automatically detects common failure patterns from stderr/stdout and exit codes:
- CLI incompatibility issues
- Missing commands
- Permission errors
- Out of memory conditions
- Timeouts
- Authentication failures
- File not found errors
- Disk space issues
- Container configuration errors

### 2. **Time-Based Stuck Detection**
Monitors tasks for excessive runtime and automatically cleans up:

| Threshold | Duration | Action |
|-----------|----------|--------|
| Soft Timeout | 30 minutes | ⚠️ Warning logged, no action |
| Hard Timeout | 60 minutes | ❌ Auto-fail + cleanup |
| Check Interval | 5 minutes | Periodic monitoring |

### 3. **Intelligent Cleanup Strategies**
Different cleanup approaches based on failure type:

| Failure Category | Force Kill | Cleanup Volumes | Save Artifacts |
|------------------|------------|-----------------|----------------|
| OOM | ✅ Yes | ❌ No | ✅ Yes |
| Timeout | ✅ Yes | ❌ No | ✅ Yes |
| CLI Incompatibility | ❌ No | ✅ Yes | ✅ Yes |
| Permission Denied | ❌ No | ❌ No | ✅ Yes |

### 4. **Actionable Insights**
Each failure provides:
- **Suggested fix** - Specific remediation steps
- **Investigation hints** - Where to look for more details
- **Retry recommendation** - Whether retry is likely to succeed
- **Failure category** - Type of failure for metrics

## Failure Pattern Examples

### CLI Incompatibility
```
Error: error: unexpected argument '--output-format' found
Exit Code: 2
Category: cli_incompatibility
Fix: Check CLI documentation and update command arguments
Immediate Failure: Yes
```

### Command Not Found
```
Error: sh: 1: codex: not found
Exit Code: 127
Category: resource_not_found
Fix: Rebuild Docker image with required CLI tools
Immediate Failure: Yes
```

### Out of Memory
```
Error: OOM killed
Exit Code: 137
Category: oom
Fix: Increase container memory limit or optimize task complexity
Immediate Failure: Yes
```

### Permission Denied
```
Error: EACCES: permission denied, open '/workspace/file.txt'
Exit Code: 1
Category: permission_denied
Fix: Check file/directory permissions and container user settings
Immediate Failure: Yes
```

## How It Works

### 1. Task Execution Flow

```
┌─────────────────────┐
│ Task Starts Running │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Docker Container    │
│ Executes CLI        │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
  Success    Failure
     │           │
     │           ▼
     │     ┌──────────────────┐
     │     │ Failure Guard    │
     │     │ Pattern Matching │
     │     └────────┬─────────┘
     │              │
     │         ┌────┴────┐
     │         │         │
     │         ▼         ▼
     │     Pattern   No Pattern
     │     Detected   Detected
     │         │         │
     │         ▼         ▼
     │     ┌─────────────────┐
     │     │ Generate        │
     │     │ Insights &      │
     │     │ Cleanup Strategy│
     │     └────────┬────────┘
     │              │
     ▼              ▼
┌─────────────────────────┐
│ Log Failure with        │
│ - Category              │
│ - Suggested Fix         │
│ - Investigation Hints   │
│ - Cleanup Strategy      │
└─────────────────────────┘
```

### 2. Stuck Task Monitoring

```
Every 5 minutes:
  ┌─────────────────────────┐
  │ Check Running Tasks     │
  └───────────┬─────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ Duration > 30 min?  │
    └─────┬───────────┬───┘
          │ Yes       │ No
          ▼           └──> Continue
    ┌─────────────┐
    │ Soft Warn   │
    │ (Log Only)  │
    └─────────────┘
          │
          ▼
    ┌─────────────────────┐
    │ Duration > 60 min?  │
    └─────┬───────────┬───┘
          │ Yes       │ No
          ▼           └──> Continue
    ┌─────────────────────┐
    │ HARD TIMEOUT        │
    │ Auto Cleanup:       │
    │ 1. Force kill       │
    │ 2. Remove container │
    │ 3. Fail task in DB  │
    └─────────────────────┘
```

## Integration Points

### devBotsManager.ts

**Lines 1807-1869:** Failure pattern detection and logging
```typescript
const failurePattern = detectFailurePattern(stderr, stdout, exitCode);
const insights = failurePattern ? generateFailureInsights(failurePattern, task.id) : null;
const cleanupStrategy = failurePattern ? getCleanupStrategy(failurePattern) : null;
```

**Lines 882-1017:** Stuck task monitoring and automatic cleanup
```typescript
private startLongRunningTaskMonitor(): void {
  setInterval(async () => {
    // Soft timeout warning
    // Hard timeout cleanup
  }, 300000);
}

private async cleanupStuckTaskContainers(taskId: string): Promise<void> {
  // Force kill and remove containers
}
```

## Preventing Common Failures

### 1. CLI Incompatibility (Most Common)

**Current Issue:** Codex CLI invoked with `--output-format json` which doesn't exist

**Prevention:**
```typescript
// ❌ WRONG
`codex --output-format json '${promptText}'`

// ✅ RIGHT
`codex exec --json '${promptText}'`
```

**Future Prevention:**
- Validate CLI arguments during Docker image build
- Add CLI compatibility tests to CI/CD
- Document supported arguments for each CLI version

### 2. Time-Based Failures

**Current Behavior:**
- Tasks running >30 min: Warning only
- Tasks running >60 min: Auto-fail + cleanup

**Tuning:**
Adjust thresholds in `taskFailureGuards.ts`:
```typescript
export const TIME_BASED_GUARDS = {
  ABSOLUTE_MAX_DURATION_MS: 60 * 60 * 1000,  // 1 hour
  SOFT_TIMEOUT_MS: 30 * 60 * 1000,           // 30 minutes
  NO_OUTPUT_TIMEOUT_MS: 10 * 60 * 1000,      // 10 minutes (future)
  STARTUP_TIMEOUT_MS: 2 * 60 * 1000          // 2 minutes (future)
};
```

### 3. Resource Leaks

**Container Cleanup:**
```typescript
// Ephemeral containers use --rm flag
dockerArgs = ['run', '--rm', ...];

// But stuck containers need manual cleanup
await this.cleanupStuckTaskContainers(taskId);
```

**Volume Cleanup:**
Based on failure category - see cleanup strategy table above.

## Monitoring & Metrics

### Logs to Watch

**Failure Pattern Detected:**
```json
{
  "category": "process",
  "action": "failure_guard_triggered",
  "guard": "Invalid CLI Argument",
  "category": "cli_incompatibility",
  "exitCode": 2,
  "immediateFailure": true,
  "suggestedFix": "Check CLI documentation..."
}
```

**Stuck Task Cleanup:**
```json
{
  "category": "process",
  "action": "stuck_task_cleaned_up",
  "taskId": "task-123",
  "duration_minutes": 75,
  "cleanup_reason": "ABSOLUTE_MAX_DURATION_EXCEEDED"
}
```

### Metrics to Track

1. **Failure Rate by Category**
   - CLI incompatibility
   - OOM
   - Timeouts
   - Permission errors

2. **Auto-Cleanup Events**
   - Number of stuck tasks cleaned up
   - Cleanup success rate
   - Average stuck duration

3. **Pattern Match Rate**
   - % of failures matched by patterns
   - % requiring manual investigation

## Future Enhancements

### 1. No-Output Timeout
Detect tasks that haven't written to stdout/stderr for 10 minutes (process likely hung)

### 2. Container Startup Timeout
Fail tasks where container takes >2 minutes to start

### 3. Resource Monitoring
- Track memory usage during execution
- Pre-emptively fail tasks approaching limits
- Adjust complexity recommendations based on resource patterns

### 4. Pattern Learning
- Machine learning to detect new failure patterns
- Auto-suggest new guard patterns based on manual investigations
- Improve suggested fixes based on successful resolutions

### 5. Notification System
- Slack/email alerts for repeated pattern failures
- Daily digest of failure categories
- Trend analysis (increasing OOM rates, etc.)

## Troubleshooting

### Guards Not Triggering

**Check:**
1. Import is correct in devBotsManager.ts
2. Pattern regex matches actual error text
3. Exit code matches expected value

**Debug:**
```typescript
// Add logging to see what's being matched
console.log('stderr:', stderr);
console.log('stdout:', stdout);
console.log('exitCode:', exitCode);
const pattern = detectFailurePattern(stderr, stdout, exitCode);
console.log('Detected pattern:', pattern);
```

### Stuck Tasks Not Cleaning Up

**Check:**
1. Monitor is started: `startLongRunningTaskMonitor()` called
2. Database query returns stuck tasks
3. Docker permissions allow container kill/remove

**Manual Cleanup:**
```bash
# List stuck containers
docker ps -a | grep task-

# Force remove
docker rm -f <container-id>

# Update database
sqlite3 dev-bots/task-queue.db \
  "UPDATE tasks SET status='failed', error='Manual cleanup' WHERE id='task-123'"
```

## Summary

The Failure Guards system provides:

✅ **Automatic detection** of 10+ common failure patterns
✅ **Intelligent cleanup** based on failure type
✅ **Actionable insights** for debugging
✅ **Resource leak prevention** via timeout-based cleanup
✅ **Reduced manual intervention** for known error patterns

This ensures the dev-bots system remains healthy and self-healing, even when tasks encounter errors.
