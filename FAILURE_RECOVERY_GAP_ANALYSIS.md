# Task Failure Recovery Gap - Investigation & Fixes

**Date:** 2025-11-10
**Issue:** PR creation failures don't trigger failure recovery pipeline  
**Secondary Issue:** No logs being written to disk

---

## Problem Statement

### Issue #1: PR Creation Failure Not Triggering Recovery

**Observed:**
- 3 tasks completed successfully
- All pushed branches to GitHub
- All failed to create PRs (gh auth error)
- **NO** followup tasks created for the failures
- Tasks marked as "completed" despite PR creation failure

**Expected:**
- PR creation failure should be detected
- Failure recovery pipeline should trigger
- Followup task should be created to fix PR creation

**Root Cause:**
- Bots are instructed to create PRs but failure to do so isn't detected as a task failure
- Task completes with exit code 0 even though PR creation failed
- No validation that PR was actually created

### Issue #2: No Logs Being Written

**Observed:**
- `/opt/app-monitor/releases/20251110_140245/backend/dev-bots/logs/` - empty
- `/opt/app-monitor/releases/20251110_140245/backend/data/logs/` - empty  
- `dev-bots/logs/dev-bots.log` - only initialization, no task logs
- `dev-bots/artifacts/` - no files since Nov 8

**Expected:**
- Task execution logs in `dev-bots/logs/dev-bots.log`
- Worker-specific logs in `data/logs/`
- Container stdout/stderr in artifacts

---

## Investigation Findings

### GitHub CLI Mount Issue

**Code Location:** `backend/src/services/ephemeralWorker.service.ts:277-292`

```typescript
// Mount GitHub CLI config for gh pr create
const ghConfigDir = path.join(homeDir, '.config', 'gh');
if (fs.existsSync(ghConfigDir)) {
  binds.push(`${ghConfigDir}:/home/node/.config/gh:ro`);
  logger.info({
    category: 'process',
    action: 'gh_config_mounted',
    message: `Mounting GitHub CLI config from: ${ghConfigDir}`
  });
} else {
  logger.warn({
    category: 'process',
    action: 'gh_config_not_found',
    message: 'GitHub CLI config not found, PR creation may fail. Run: gh auth login'
  });
}
```

**Findings:**
✅ `homeDir = os.homedir()` returns `/home/jdubz` (correct)
✅ `~/.config/gh/` exists with valid config
✅ `gh auth status` shows authenticated with repo access
❓ Cannot verify if mount actually succeeds (no logs)
❓ Cannot verify container can access gh (containers already destroyed)

**Possible Issues:**
1. **Token in keyring not accessible from container**
   - Host uses `(keyring)` for token storage
   - Container cannot access system keyring
   - Need file-based token or `GITHUB_TOKEN` env var

2. **Mount path mismatch**
   - Mounted to `/home/node/.config/gh`
   - Container might run as different user
   - Container `gh` might look in different location

3. **Read-only mount prevents token refresh**
   - Mount uses `:ro` flag
   - gh might need write access for token management

### Log Writing Failure

**Code Location:** `backend/src/services/ephemeralWorker.service.ts:656-694`

**Log Path Config:**
- Consolidated log: `dev-bots/logs/dev-bots.log`
- Worker logs: `data/logs/{worker-id}.log`
- Initialized in constructor (line 104-106)

**Findings:**
- Directories exist: `/opt/app-monitor/releases/20251110_140245/backend/dev-bots/logs/`
- Directories are empty (no log files created)
- `initializeWorkerLogFile()` should create files but doesn't
- `createLogStream()` should write to dev-bots.log but doesn't

**Possible Issues:**
1. **Silent write failures**
   - No error logs for failed log writes
   - fs.createWriteStream() might fail silently
   - Need better error handling

2. **Permission issues**
   - Process can't write to directories
   - But directories are owned by jdubz:jdubz

3. **Code not being executed**
   - Methods called but logs not written
   - Stream created but data not flowing
   - Container output not captured

### Failure Detection Gap

**Code Location:** `backend/src/services/taskPromptTemplates.ts:1272-1300`

**Current Prompt:**
```bash
# Create PR with gh CLI
gh pr create --base main --head "${BRANCH_NAME}" \
  --title "{{task.type}}: {{task.title}}" \
  --body "$PR_BODY"

# Capture PR metadata for reporting
PR_NUMBER=$(gh pr view "${BRANCH_NAME}" --json number --jq .number)
PR_URL=$(gh pr view "${BRANCH_NAME}" --json url --jq .url)
PR_BRANCH=$(gh pr view "${BRANCH_NAME}" --json headRefName --jq .headRefName)
echo "✅ PR created: $PR_URL"
echo "PR_NUMBER: $PR_NUMBER"
echo "PR_URL: $PR_URL"
echo "PR_BRANCH: $PR_BRANCH"
```

**Problem:**
- If `gh pr create` fails, bot doesn't exit with error code
- Bot says "authentication limitations" but task still completes
- No verification that PR_NUMBER was captured
- Exit code 0 means "success" even without PR

---

## Recommended Fixes

### Fix #1: Enable File-Based GitHub Token (Immediate)

**Problem:** Container can't access keyring-stored token

**Solution:** Use `GITHUB_TOKEN` environment variable

```typescript
// In ephemeralWorker.service.ts, line ~294
const envVars = [
  `AGENT_ID=${agent.id}`,
  `AGENT_NAME=${agent.name}`,
  // ... existing vars ...
  `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''}`,  // ADD THIS
];
```

**Setup on host:**
```bash
# Extract token from gh
export GITHUB_TOKEN=$(gh auth token)

# Add to production environment
echo "export GITHUB_TOKEN=$(gh auth token)" >> ~/.bashrc

# Or add to systemd service file
echo "Environment=GITHUB_TOKEN=$(gh auth token)" >> /etc/systemd/user/app-monitor-backend@5001.service
```

### Fix #2: Add PR Creation Validation to Prompt (Critical)

**Problem:** No exit code on PR failure

**Solution:** Add validation and proper error handling to prompt template

```typescript
// In taskPromptTemplates.ts, update prCreationContent (line ~1272)
return `# Build PR description
PR_BODY="..."

# Create PR with error handling
if ! gh pr create --base main --head "\${BRANCH_NAME}" \\
  --title "{{task.type}}: {{task.title}}" \\
  --body "$PR_BODY"; then
  echo "❌ ERROR: Failed to create PR"
  echo "GitHub CLI authentication may have failed"
  echo "Branch \${BRANCH_NAME} was pushed but PR creation failed"
  exit 1  # Exit with error to trigger failure recovery
fi

# Capture PR metadata
PR_NUMBER=$(gh pr view "\${BRANCH_NAME}" --json number --jq .number)
PR_URL=$(gh pr view "\${BRANCH_NAME}" --json url --jq .url)

# Verify PR was created
if [ -z "$PR_NUMBER" ] || [ -z "$PR_URL" ]; then
  echo "❌ ERROR: PR created but metadata not captured"
  exit 1
fi

echo "✅ PR #$PR_NUMBER created: $PR_URL"
echo "PR_NUMBER: $PR_NUMBER"
echo "PR_URL: $PR_URL"`;
```

### Fix #3: Add Diagnostic Logging for GitHub CLI Mount

**Problem:** Cannot verify if gh config is mounted correctly

**Solution:** Add detailed logging

```typescript
// In ephemeralWorker.service.ts, after gh mount (line ~292)
logger.info({
  category: 'process',
  action: 'gh_config_debug',
  message: 'GitHub CLI configuration check',
  details: {
    homeDir,
    ghConfigDir,
    exists: fs.existsSync(ghConfigDir),
    hostsFile: fs.existsSync(path.join(ghConfigDir, 'hosts.yml')),
    configFile: fs.existsSync(path.join(ghConfigDir, 'config.yml')),
    mountBind: `${ghConfigDir}:/home/node/.config/gh:ro`,
    hasGithubToken: !!process.env.GITHUB_TOKEN,
    hasGhToken: !!process.env.GH_TOKEN
  }
});
```

### Fix #4: Fix Log Stream Error Handling

**Problem:** Log writes failing silently

**Solution:** Add error handlers to streams

```typescript
// In createLogStream() method (line ~656)
private async createLogStream(worker: EphemeralWorker): Promise<fs.WriteStream> {
  // ... existing code ...
  
  const stream = fs.createWriteStream(this.devBotsLogPath, { flags: 'a' });
  
  // ADD ERROR HANDLER
  stream.on('error', (error) => {
    logger.error({
      category: 'process',
      action: 'log_stream_error',
      message: `Failed to write to log stream for worker ${worker.id}`,
      error,
      details: { logPath: this.devBotsLogPath }
    });
  });
  
  // ... rest of method ...
}
```

```typescript
// In initializeWorkerLogFile() method (line ~390)
private async initializeWorkerLogFile(workerId: string): Promise<void> {
  try {
    const sanitizedId = workerId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const logDir = this.getHostLogsDir();
    const logFilePath = path.join(logDir, `${sanitizedId}.log`);

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      logger.info({
        category: 'process',
        action: 'created_log_directory',
        message: `Created log directory: ${logDir}`
      });
    }

    // ADD: Verify directory is writable
    try {
      fs.accessSync(logDir, fs.constants.W_OK);
    } catch (err) {
      logger.error({
        category: 'process',
        action: 'log_directory_not_writable',
        message: `Log directory not writable: ${logDir}`,
        error: err
      });
      throw err;
    }

    const timestamp = new Date().toISOString();
    const header = `=== Dev-Bot Worker Log ===\nWorker ID: ${workerId}\nInitialized: ${timestamp}\n===========================\n\n`;

    fs.writeFileSync(logFilePath, header, 'utf8');

    logger.info({
      category: 'process',
      action: 'initialized_worker_log_file',
      message: `Initialized log file for worker ${workerId}`,
      details: { path: logFilePath, size: header.length }  // ADD size
    });
  } catch (error) {
    logger.error({
      category: 'process',
      action: 'failed_to_initialize_worker_log_file',
      message: `Failed to initialize log file for worker ${workerId}:`,
      error: error,
      details: {  // ADD more details
        logDir: this.getHostLogsDir(),
        workerId,
        cwd: process.cwd()
      }
    });
    // Don't swallow the error
    throw error;
  }
}
```

### Fix #5: Add Failure Detection for PR Creation

**Problem:** Task completes even when PR fails

**Solution:** Add post-execution validation

```typescript
// In taskCompletion.service.ts or taskExecution.service.ts

async function validateTaskCompletion(task: Task, output: string): Promise<boolean> {
  // For tasks with git workflow, verify PR was created
  if (task.gitWorkflow?.required) {
    const hasPrNumber = /PR_NUMBER:\s*\d+/.test(output);
    const hasPrUrl = /PR_URL:\s*https:\/\/github\.com/.test(output);
    
    if (!hasPrNumber || !hasPrUrl) {
      logger.warn({
        category: 'task',
        action: 'pr_creation_failed',
        message: `Task ${task.id} completed but PR was not created`,
        details: {
          taskId: task.id,
          title: task.title,
          hasPrNumber,
          hasPrUrl
        }
      });
      
      // Mark as failed to trigger recovery
      return false;
    }
  }
  
  return true;
}
```

---

## Implementation Priority

### Phase 1: Immediate (Today)

1. ✅ **Add GITHUB_TOKEN environment variable** to ephemeralWorker.service.ts
2. ✅ **Add PR creation validation** to task prompt template
3. ✅ **Add diagnostic logging** for gh config mount

### Phase 2: Critical (This Week)

4. ✅ **Fix log stream error handling**
5. ✅ **Add task completion validation** for PR creation
6. ✅ **Test with a single task** to verify fixes work

### Phase 3: Monitoring (Ongoing)

7. Monitor logs for gh_config_debug messages
8. Verify PR creation succeeds on next task
9. Verify logs are written correctly
10. Create followup task if PR creation still fails

---

## Testing Plan

### Test 1: Verify GitHub Token Access

```bash
# Add token to environment
export GITHUB_TOKEN=$(gh auth token)

# Restart backend (if needed)
# Submit a simple test task
# Check logs for gh_config_debug output
# Verify PR is created
```

### Test 2: Verify Log Writing

```bash
# Monitor log directories
watch -n 1 "ls -lh /opt/app-monitor/releases/*/backend/dev-bots/logs/ /opt/app-monitor/releases/*/backend/data/logs/"

# Submit task
# Verify log files are created
# Verify content is written
```

### Test 3: Verify Failure Recovery

```bash
# Temporarily break gh auth (remove token)
unset GITHUB_TOKEN

# Submit task
# Verify task fails
# Verify followup task is created
# Verify followup task fixes the issue
```

---

## Files to Modify

1. `backend/src/services/ephemeralWorker.service.ts`
   - Add GITHUB_TOKEN env var (line ~294)
   - Add gh config debug logging (line ~292)
   - Add log stream error handlers (line ~673, ~390)

2. `backend/src/services/taskPromptTemplates.ts`
   - Update PR creation with validation (line ~1272)
   - Add exit 1 on PR failure

3. `backend/src/services/taskCompletion.service.ts` (or taskExecution.service.ts)
   - Add PR validation check
   - Mark task as failed if PR not created

---

## Expected Outcomes

After fixes:

1. ✅ PR creation succeeds (or fails properly)
2. ✅ Logs are written to disk
3. ✅ PR creation failures trigger recovery
4. ✅ Followup tasks created for failures
5. ✅ Can diagnose issues from logs

---

## Current Status

**Completed:**
- ✅ Investigation of root causes
- ✅ Identified 2 critical gaps (PR validation, log writing)
- ✅ Designed fixes for both issues

**Next Steps:**
1. Implement Fix #1 (GITHUB_TOKEN)
2. Implement Fix #2 (PR validation)
3. Implement Fix #3 (diagnostic logging)
4. Deploy and test
5. Monitor results
