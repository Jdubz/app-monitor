# Failure Recovery Fixes - Implementation Summary

**Date:** 2025-11-10
**Status:** ✅ IMPLEMENTED - Ready for Testing

---

## Issues Fixed

### 1. ✅ PR Creation Failures Don't Trigger Recovery

**Problem:** Tasks completed with exit code 0 even when PR creation failed

**Solution:** Added validation and error handling to PR creation workflow

**Files Modified:**
- `backend/src/services/taskPromptTemplates.ts`
  - Line ~1272: Added `if ! gh pr create` error handling
  - Line ~1282: Added `exit 1` on PR creation failure
  - Line ~1295: Added PR metadata validation
  - Line ~1302: Added `exit 1` if metadata capture fails

**Result:** PR creation failures now exit with code 1, triggering failure recovery pipeline

### 2. ✅ GitHub CLI Authentication Not Available in Container

**Problem:** Container couldn't access gh token from keyring

**Solution:** Pass `GITHUB_TOKEN` environment variable to containers

**Files Modified:**
- `backend/src/services/ephemeralWorker.service.ts`
  - Line ~300: Added `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''}`
  - Line ~285: Added diagnostic logging for gh config mount
  - Logs now show: hasGithubToken, hasGhToken, config file existence

**Result:** Containers can now authenticate with GitHub using token from environment

### 3. ✅ No Diagnostic Logging for Mount Issues

**Problem:** Couldn't verify if gh config was being mounted correctly

**Solution:** Added detailed logging with mount and token information

**Files Modified:**
- `backend/src/services/ephemeralWorker.service.ts`
  - Line ~284-297: Enhanced gh_config_mounted/not_found logging
  - Now includes: homeDir, ghConfigDir, file existence, token availability

**Result:** Can diagnose gh config issues from logs

### 4. ✅ Log Stream Failures Not Detected

**Problem:** Log writes failing silently

**Solution:** Added error handlers to log streams

**Files Modified:**
- `backend/src/services/ephemeralWorker.service.ts`
  - Line ~693: Added error handler to createLogStream
  - Line ~427-438: Added directory writability check
  - Line ~443-455: Enhanced error logging with details
  - Line ~462: Now throws error instead of swallowing it

**Result:** Log write failures are now logged and surfaced

---

## Changes Summary

### ephemeralWorker.service.ts
```diff
+ Line 300: Added GITHUB_TOKEN env var
+ Line 284-297: Enhanced gh config logging
+ Line 693-700: Added log stream error handler
+ Line 427-438: Added directory writability check
+ Line 443-455: Enhanced error logging
```

### taskPromptTemplates.ts
```diff
+ Line 1272-1283: Added PR creation validation with exit 1
+ Line 1295-1303: Added PR metadata validation with exit 1
```

---

## Testing Requirements

### Before Testing
1. **Set GITHUB_TOKEN in environment:**
   ```bash
   export GITHUB_TOKEN=$(gh auth token)
   ```

2. **Add to production systemd service:**
   ```bash
   # Edit /etc/systemd/user/app-monitor-backend@5001.service
   Environment=GITHUB_TOKEN=<token-from-gh-auth-token>
   
   # Reload and restart
   systemctl --user daemon-reload
   systemctl --user restart app-monitor-backend@5001
   ```

### Test 1: Verify GitHub Token Is Passed
```bash
# After deployment, check logs for gh_config_mounted
grep "gh_config" /opt/app-monitor/releases/*/backend/dev-bots/logs/dev-bots.log

# Should show:
# hasGithubToken: true
```

### Test 2: Verify PR Creation Succeeds
```bash
# Submit a test task
# Verify PR is created on GitHub
# Check task completes with PR_NUMBER and PR_URL in output
```

### Test 3: Verify Failure Recovery Works
```bash
# Temporarily remove GITHUB_TOKEN
unset GITHUB_TOKEN
# Or edit systemd service to remove it

# Submit a test task
# Verify task FAILS (not completes)
# Verify followup task is created
# Verify followup task mentions "PR creation failed"
```

### Test 4: Verify Logs Are Written
```bash
# Monitor log directories
watch -n 2 "ls -lh /opt/app-monitor/releases/*/backend/dev-bots/logs/"

# Submit task
# Verify dev-bots.log grows
# Verify worker log files are created
# Verify task output is captured
```

---

## Deployment Steps

### Step 1: Build
```bash
cd /home/jdubz/Development/app-monitor
cd backend
npm run build
```
✅ Build completed successfully

### Step 2: Deploy to Production
```bash
# Standard deployment process
# Files modified will be included in next release
```

### Step 3: Set Environment Variable
```bash
# Extract token
GITHUB_TOKEN=$(gh auth token)

# Add to systemd service
sudo nano /etc/systemd/user/app-monitor-backend@5001.service

# Add under [Service]:
Environment=GITHUB_TOKEN=<paste-token-here>

# Reload and restart
systemctl --user daemon-reload
systemctl --user restart app-monitor-backend@5001
```

### Step 4: Verify Deployment
```bash
# Check backend is running
systemctl --user status app-monitor-backend@5001

# Check environment variable is set
systemctl --user show app-monitor-backend@5001 | grep GITHUB_TOKEN

# Check logs for gh_config messages
tail -f /opt/app-monitor/releases/*/backend/dev-bots/logs/dev-bots.log
```

---

## Expected Behavior After Fixes

###  PR Creation Success
1. Bot creates feature branch
2. Bot pushes to GitHub
3. Bot runs `gh pr create` with error handling
4. If success: captures PR_NUMBER and PR_URL
5. Task completes with exit code 0

### ❌ PR Creation Failure
1. Bot creates feature branch
2. Bot pushes to GitHub
3. Bot runs `gh pr create` - **FAILS**
4. Bot outputs error message
5. Bot runs `gh auth status` for debugging
6. **Bot exits with code 1**
7. Task marked as FAILED
8. Failure recovery pipeline triggers
9. Followup task created to fix PR creation

### 📝 Log Writing
1. Worker log file created in `/opt/app-monitor/releases/*/backend/data/logs/{worker-id}.log`
2. Consolidated log in `/opt/app-monitor/releases/*/backend/dev-bots/logs/dev-bots.log`
3. Errors logged if write fails
4. Directory permission errors surfaced

### 🔍 Diagnostic Logging
1. gh_config_mounted/not_found logged with details
2. Shows if GITHUB_TOKEN is set
3. Shows which config files exist
4. Shows mount path
5. Can diagnose auth issues from logs

---

## Rollback Plan

If fixes cause issues:

1. **Revert commits:**
   ```bash
   git revert <commit-hash>
   ```

2. **Or deploy previous release:**
   ```bash
   ln -sfn /opt/app-monitor/releases/20251110_140245 /opt/app-monitor/current
   systemctl --user restart app-monitor-backend@5001
   ```

3. **Known safe fallback:**
   - Previous release: 20251110_140245
   - No PR validation (allows silent failures)
   - No GITHUB_TOKEN env var (uses mounted config only)

---

## Monitoring

After deployment, monitor for:

### Success Indicators
✅ Tasks with PRs complete successfully
✅ PR_NUMBER and PR_URL in task output
✅ PRs visible on GitHub
✅ Logs being written to disk
✅ gh_config_mounted logged with hasGithubToken: true

### Failure Indicators (Expected - Should Trigger Recovery)
❌ Task fails with "Failed to create PR"
✅ Followup task created
✅ gh auth status output in logs
✅ Exit code 1 captured

### Failure Indicators (Unexpected - Investigate)
❌ Task completes without PR (no PR_NUMBER)
❌ No logs written to disk
❌ gh_config_not_found with hasGithubToken: false
❌ No followup task created on PR failure

---

## Next Steps

1. ✅ Code implemented
2. ✅ Build successful  
3. ⏳ Deploy to production
4. ⏳ Set GITHUB_TOKEN environment variable
5. ⏳ Test with a simple task
6. ⏳ Verify PR is created
7. ⏳ Monitor logs
8. ⏳ Test failure scenario (remove token, verify recovery)

---

## Related Documentation

- `PR_CREATION_FAILURE_INVESTIGATION.md` - Root cause analysis
- `FAILURE_RECOVERY_GAP_ANALYSIS.md` - Detailed investigation
- `TASK_EXECUTION_SUMMARY.md` - Original task monitoring results
