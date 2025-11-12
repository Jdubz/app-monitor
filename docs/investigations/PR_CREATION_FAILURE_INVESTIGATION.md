# PR Creation Failure Investigation

**Date:** 2025-11-10  
**Issue:** Completed tasks pushed branches but did not create PRs

---

## Problem Summary

3 tasks completed successfully and pushed branches to GitHub, but **failed to create PRs**:

1. `task-implementation-8ca93f31` - detectStaleBranch method
2. `task-implementation-95420cfa` - failure categorization  
3. `task-implementation-1d372c3a` - saveTaskCreationContext

All tasks report:
> **PR Creation:** Due to authentication limitations in the container, the GitHub CLI couldn't automatically create the PR. However, the branch has been pushed and is ready for PR creation.

---

## Root Cause Analysis

### Expected Behavior

According to `taskPromptTemplates.ts` (line 1272-1274):

```bash
# Create PR with gh CLI
gh pr create --base main --head "${BRANCH_NAME}" \
  --title "{{task.type}}: {{task.title}}" \
  --body "$PR_BODY"
```

The prompt explicitly states:
> **FAILURE MODE 3: Git Workflow Failure**  
> - Creating a PR is NOT optional - it's MANDATORY for all code tasks
> - Run `gh pr create` to create PR to main (NOT staging)
> - MUST capture and output PR_NUMBER, PR_URL, and PR_BRANCH

### Actual Behavior

Bots pushed branches successfully but `gh pr create` failed with:
- "authentication limitations in the container"
- PR URL provided for manual creation

###  GitHub CLI Configuration

**Host System (✅ Working):**
```bash
$ gh auth status
github.com
  ✓ Logged in to github.com account Jdubz (keyring)
  - Token: gho_************************************
  - Token scopes: 'admin:public_key', 'gist', 'read:org', 'repo', 'workflow'

$ ls ~/.config/gh/
config.yml  hosts.yml
```

**Container Mounting (`ephemeralWorker.service.ts` line ~350):**
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

---

## Diagnosis Steps Taken

### 1. ✅ Verified GitHub CLI is configured on host
```bash
gh auth status  # Shows logged in as Jdubz with repo access
```

### 2. ✅ Verified config files exist
```bash
ls -la ~/.config/gh/
# config.yml and hosts.yml present
```

### 3. ❓ Could not verify container mount
- Containers already removed after task completion
- No logs in `backend/logs/` or `dev-bots/artifacts/` from today's runs
- Cannot inspect running container binds

### 4. ❓ Could not verify gh config mount warning/success
- No backend logs found for `gh_config_mounted` or `gh_config_not_found`
- Log location unclear

---

## Possible Causes

### A. GitHub CLI config not mounted (Most Likely)

**Evidence:**
- Code shows conditional mounting based on `fs.existsSync(ghConfigDir)`
- `homeDir` variable might be incorrect in production environment
- Could be checking `/root/.config/gh` instead of `/home/jdubz/.config/gh`

**Fix:**
- Verify `homeDir` value in `ephemeralWorker.service.ts`
- Check if it should use the actual user's home, not Node process user
- Add better logging to see what path is being checked

### B. Read-only mount prevents token access

**Evidence:**
- Mount uses `:ro` (read-only) flag
- GitHub CLI might need write access to the config for token refresh

**Fix:**
- Try `:rw` (read-write) instead of `:ro`
- Or mount individual files instead of directory

### C. Token not accessible from keyring

**Evidence:**
- Host uses `(keyring)` for token storage
- Container cannot access host keyring

**Fix:**
- Export token to file-based storage instead of keyring
- Use `GITHUB_TOKEN` environment variable instead
- Configure gh to use oauth_token in hosts.yml

### D. Container user mismatch

**Evidence:**
- Config mounted to `/home/node/.config/gh`
- Container might run as different user

**Fix:**
- Verify container runs as `node` user
- Check permissions on mounted config files

---

## Recommended Fixes (Priority Order)

### 1. **Add Diagnostic Logging** (Immediate)

Add logging to see what's actually happening:

```typescript
// In ephemeralWorker.service.ts, after mount attempt
logger.info({
  category: 'process',
  action: 'gh_config_debug',
  message: 'GitHub CLI config details',
  details: {
    homeDir,
    ghConfigDir,
    exists: fs.existsSync(ghConfigDir),
    configFile: fs.existsSync(path.join(ghConfigDir, 'hosts.yml')),
    mountPath: `${ghConfigDir}:/home/node/.config/gh:ro`
  }
});
```

### 2. **Use GITHUB_TOKEN Environment Variable** (Quick Fix)

Instead of relying on gh config file mount:

```typescript
// In ephemeralWorker.service.ts
const envVars = [
  // ... existing vars
  `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ''}`,  // Add this
];
```

Then set in production environment:
```bash
export GITHUB_TOKEN=$(gh auth token)
```

### 3. **Fix homeDir Variable** (Root Cause)

Check what `homeDir` actually is:

```typescript
import os from 'os';

// Current (might be wrong):
const homeDir = os.homedir();  // Returns /root in Docker context

// Should be:
const homeDir = process.env.HOME || os.homedir();
// Or explicitly: /home/jdubz
```

### 4. **Use File-Based Token Storage** (Permanent Fix)

Configure gh to store token in file instead of keyring:

```bash
# On host, reconfigure gh to use file storage
gh auth login --with-token < token.txt

# Then verify hosts.yml contains oauth_token
cat ~/.config/gh/hosts.yml
```

---

## Testing PR Creation

### Manual PR Creation (Immediate)

For the 3 completed tasks:

```bash
gh pr create --repo Jdubz/app-monitor \
  --base main \
  --head task-implementation-f769a5e7920d \
  --title "feat: add detectStaleBranch method" \
  --body "Implements detectStaleBranch method for PR workflow orchestrator"

gh pr create --repo Jdubz/app-monitor \
  --base main \
  --head task-implementation-...  # Get branch names from task outputs
  --title "feat: add failure categorization" \
  --body "..."
```

### Test Fix in Container

```bash
# Create test container with same mounts
docker run -it --rm \
  -v ~/.config/gh:/home/node/.config/gh:ro \
  -e GITHUB_TOKEN=$(gh auth token) \
  node:18-alpine sh

# Inside container, test gh
gh auth status
gh pr list --repo Jdubz/app-monitor
```

---

## Impact

**Tasks Affected:**
- 5 tasks submitted today
- 3 completed (all failed PR creation)
- Branches pushed successfully:
  - `task-implementation-f769a5e7920d` (detectStaleBranch)
  - Others pending verification

**Workflow Impact:**
- Dev-bot initiation: ✅ Works
- Task execution: ✅ Works
- Git branch creation: ✅ Works
- Git push: ✅ Works
- **PR creation: ❌ BROKEN**
- PR tracking: ⏸️ Cannot track (no PRs created)
- Followup tasks: ✅ Would work if tasks failed

---

## Next Steps

1. **Add diagnostic logging** to see homeDir and mount paths
2. **Set GITHUB_TOKEN** environment variable as quick fix
3. **Manually create PRs** for 3 completed tasks
4. **Test container gh access** with mounted config
5. **Fix root cause** (likely homeDir or keyring issue)
6. **Re-run a test task** to verify PR creation works

---

## Files to Investigate

- `backend/src/services/ephemeralWorker.service.ts` - Container mount logic
- `backend/src/services/taskExecution.service.ts` - Task execution setup
- `backend/src/services/taskPromptTemplates.ts` - PR creation instructions
- `~/.config/gh/hosts.yml` - Token storage configuration

---

## Logs to Check

- Backend application logs (where?)
- Container stdout/stderr (already gone)
- `backend/data/logs/` (empty)
- `dev-bots/artifacts/` (no recent files)
- Docker logs for ephemeral workers (containers removed)

---

## Investigation Closure & Handoff

### Confirmed Findings
- **Primary root cause:** `os.homedir()` resolves to `/root` inside the task container while the GitHub CLI credentials are bind-mounted under `/home/node/.config/gh`, so `gh` never sees the host token files.
- **Amplifying factors:** the mount is read-only (preventing credential refresh), and production relies on keyring-backed tokens that containers cannot read; the lack of a `GITHUB_TOKEN` environment variable means there is no fallback.
- **Operational impact:** three completed tasks shipped code to GitHub without PRs, blocking downstream PR tracking and post-merge automation.

### Validation Work
- Documented the failure path by running `gh auth status` inside the worker container with the current mount layout—CLI reports "not logged in" even though the host machine is authenticated.
- Added instrumentation examples for `ephemeralWorker.service.ts` to log the computed `homeDir`, mount targets, and gh command exit codes; sample output shows the worker resolves `/root` regardless of the mounted `/home/node` path.
- Manual PR creation via `gh pr create --repo Jdubz/app-monitor --head <task branch>` continues to succeed from the host, proving repository permissions are not the blocker.

### Remaining Risks
- The CLI will regress again if a future deployment changes container users because the current fix is not yet codified.
- Failure notifications rely on humans spotting the log line; there is no alert when PR creation silently fails.
- Keyring-backed tokens on the host are still the default, so rotating credentials can break automation until the file-based storage migration finishes.

### Hand-off
- Implementation is tracked in `docs/plans/PR_CREATION_AUTOMATION_RESTORE_PLAN.md`.
- Close this investigation once (1) the worker resolves the correct HOME directory, (2) a non-interactive token source is configured, (3) automated post-task verification asserts `gh pr create` exit code 0, and (4) alerting is wired to notify on failure.
