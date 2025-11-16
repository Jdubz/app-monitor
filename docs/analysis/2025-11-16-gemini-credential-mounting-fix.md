# Production Credential Mounting Fix - 2025-11-16
**Issue:** Gemini credentials not being mounted to containers, causing immediate task failures  
**Root Cause:** Missing Gemini credential mounting configuration in Docker container setup  
**Status:** FIXED (pending deployment)

## Summary

Fixed missing Gemini credential mounting in ephemeral worker containers. The system was correctly mounting Claude credentials but not Gemini credentials, causing all Gemini tasks to fail with "credentials file not found" error.

## Changes Made

### 1. Added Gemini Credential Path Helper (`dockerConfig.ts`)
```typescript
export function getGeminiCredentialsPath(): { exists: boolean; path: string } {
  const homeDir = os.homedir();
  const credPath = path.join(homeDir, '.gemini', 'credentials.json');
  
  return {
    exists: fs.existsSync(credPath),
    path: credPath
  };
}
```

### 2. Updated Credential Mounting (`ephemeralWorker.service.ts`)

**Before:** Only Claude credentials mounted  
**After:** All three AI provider credentials mounted

- **Claude**: `~/.claude/.credentials.json` → `/tmp/host-claude-creds.json`
- **Gemini**: `~/.gemini/credentials.json` → `/tmp/host-gemini-creds.json`  
- **Codex**: `~/.codex/credentials.json` → `/tmp/host-codex-creds.json`

### 3. Fixed Credential Copy Commands

Updated container exec commands to use correct mount points:
```bash
# Gemini setup
mkdir -p /home/worker/.gemini
cp /tmp/host-gemini-creds.json /home/worker/.gemini/credentials.json

# Claude setup  
mkdir -p /home/worker/.claude
cp /tmp/host-claude-creds.json /home/worker/.claude/credentials.json

# Codex setup
mkdir -p /home/worker/.codex
cp /tmp/host-codex-creds.json /home/worker/.codex/credentials.json
```

## Architecture Notes

### Credential Mounting Pattern
Following the established Claude pattern:
1. Mount host credential file to `/tmp/host-{provider}-creds.json` (read-only)
2. Create tmpfs mount for `~/.{provider}` directory in container
3. Copy credentials from temp mount to provider directory during setup
4. Provider CLI reads credentials from standard location

### Two Code Paths
There are TWO separate code paths for task execution:

1. **EphemeralWorkerService** (`ephemeralWorker.service.ts`)
   - Newer, preferred approach
   - Used for standard task execution
   - ✅ **FIXED** in this session

2. **TaskExecutionService** (`taskExecution.service.ts`)
   - Legacy/fallback with `docker run`
   - Has credential pre-validation (`credentialsCheck()`)
   - ⚠️ **Already has Gemini config but may need review**

## Deployment Requirements

### Production Server Setup
Gemini credentials must exist on production server:
```bash
# On app-monitor.joshwentworth.com
test -f /home/jdubz/.gemini/credentials.json || echo "MISSING"
```

**If missing, credentials must be configured:**
```bash
# Option 1: Copy from dev environment
scp ~/.gemini/credentials.json jdubz@app-monitor.joshwentworth.com:~/.gemini/

# Option 2: Login directly (requires interactive session)
# Note: This should NOT be needed in containers, only on host
ssh jdubz@app-monitor.joshwentworth.com
gemini login
```

### Environment Setup Checklist
For ANY deployment environment:
- [ ] `~/.claude/.credentials.json` exists
- [ ] `~/.gemini/credentials.json` exists  
- [ ] `~/.codex/credentials.json` exists (if using Codex)
- [ ] Credentials have correct permissions (readable by deploy user)
- [ ] Backend process user can read credential files

## Testing

### Unit Test Additions Needed
```typescript
// Test credential mounting for all providers
describe('EphemeralWorkerService credential mounting', () => {
  it('should mount Gemini credentials when available');
  it('should warn when Gemini credentials missing');
  it('should mount Claude credentials when available');
  it('should mount Codex credentials when available');
});
```

### Integration Test
1. Create test task assigned to Gemini agent
2. Verify container has credentials at `/home/worker/.gemini/credentials.json`
3. Verify CLI can authenticate
4. Verify task executes successfully

## Related Issues from Production Analysis

### Issue #1: Missing Credentials (RESOLVED by this fix)
- **Error:** `gemini credentials file not found at /home/jdubz/.gemini/credentials.json`
- **Impact:** 60% of submitted tasks failed immediately
- **Fix:** Mount credentials from host → container
- **Prevention:** Add to deployment checklist

### Issue #2: Worker Heartbeat Timeout (SEPARATE ISSUE)
- **Error:** `Worker heartbeat timeout`
- **Impact:** 20% of tasks failed after assignment
- **Status:** Requires separate investigation
- **Not related to credential mounting**

### Issue #3: Task Assignment Stalled (SEPARATE ISSUE)
- **Symptom:** Tasks pending but not assigned to available workers
- **Status:** Requires separate investigation
- **Possible cause:** System restart didn't reinitialize assignment loop

## Documentation Updates Needed

### Production Setup Guide
Add to `docs/setup/PRODUCTION_SETUP_QUICKSTART.md`:
```markdown
## AI Provider Credentials

All three AI provider credentials must be configured on the production server:

1. **Claude**: `~/.claude/.credentials.json`
2. **Gemini**: `~/.gemini/credentials.json`
3. **Codex**: `~/.codex/credentials.json`

Copy credentials from development environment:
```bash
scp ~/.claude/.credentials.json user@prod:~/.claude/
scp ~/.gemini/credentials.json user@prod:~/.gemini/
scp ~/.codex/credentials.json user@prod:~/.codex/
```

Verify permissions:
```bash
chmod 600 ~/.claude/.credentials.json
chmod 600 ~/.gemini/credentials.json
chmod 600 ~/.codex/credentials.json
```
\`\`\`

### Deployment Checklist
Add to `docs/guides/PRODUCTION_DEPLOYMENT.md`:
```markdown
## Pre-Deployment Checklist
- [ ] All AI provider credentials configured
- [ ] Credentials readable by backend process user
- [ ] Docker daemon running
- [ ] GitHub CLI authenticated (gh auth status)
- [ ] Environment variables set in systemd/PM2 config
```

## Files Modified

1. `/backend/src/services/dockerConfig.ts`
   - Added `getGeminiCredentialsPath()` function
   - Follows same pattern as `getClaudeCredentialsPaths()`

2. `/backend/src/services/ephemeralWorker.service.ts`
   - Updated credential mounting (lines ~265-305)
   - Updated credential copy commands (lines ~995-1020)
   - Added Gemini and Codex credential mounting
   - Changed mount paths to be provider-specific

## Session Artifacts

- `docs/analysis/2025-11-16-production-task-execution-troubleshooting.md` - Full production analysis
- `prod-task-execution-report.md` - Original diagnostic report  
- `prod-test-tasks.json` - Test task definitions
- `prod-test-execution.log` - Monitoring output
- `fix-production-issues.sh` - Production fix automation script
- `restart-system-only.sh` - System restart script

## Next Steps

1. **Deploy Changes**
   - Build and deploy updated backend
   - Restart backend service on production

2. **Configure Credentials**
   - Verify/copy Gemini credentials to production server
   - Test credential file accessibility

3. **Verify Fix**
   - Submit test task with Gemini agent
   - Monitor for successful execution
   - Verify no "credentials not found" errors

4. **Monitor**
   - Watch for worker heartbeat timeouts (separate issue)
   - Monitor task assignment rate
   - Track failure patterns

## Lessons Learned

1. **No SSH into containers** - Credentials should ALWAYS be mounted from host
2. **Follow established patterns** - Claude credential mounting pattern should be replicated for all providers
3. **Pre-flight validation** - Deployment should validate all required credentials exist
4. **Two code paths** - Remember both ephemeralWorker and taskExecution services exist
5. **Production parity** - Dev environment should match production credential configuration

## References

- [Master Design Intent](../architecture/master-design-intent.md)
- [Production Deployment Guide](../guides/PRODUCTION_DEPLOYMENT.md)
- [Docker Configuration](../../backend/src/services/dockerConfig.ts)
- [Ephemeral Worker Service](../../backend/src/services/ephemeralWorker.service.ts)
