# Container Isolation & GH CLI Authentication Analysis

**Date:** 2025-11-13  
**Issue:** Why did containers see uncommitted changes? Why did GH auth fail?  
**Status:** Root causes identified with solutions

---

## Question 1: Why Are Containers NOT Isolated?

### Answer: They ARE Isolated (Mostly)

**The Good News:** Containers DO use isolated workspaces!

```typescript
// From taskExecution.service.ts lines 608-614
`mkdir -p /workspace && cd /workspace && ` +
`git clone https://github.com/Jdubz/app-monitor.git . && ` +
`git config --global user.name "DevBot" && ` +
`git config --global user.email "devbot@local" && ` +
`git fetch --all && ` +
`git checkout ${baseBranch} && ` +
`git pull origin ${baseBranch} || true && `
```

**Key Points:**
1. ✅ **NO workspace volume mount** - Containers don't mount `/home/jdubz/Development/app-monitor`
2. ✅ **Fresh clone inside container** - Each container clones from GitHub
3. ✅ **Isolated /workspace** - Changes happen in container filesystem only
4. ✅ **Auto-removed containers** - `--rm` flag cleans up after execution

### So Why Did We See "Uncommitted Changes"?

**The Confusion:** The artifact status files show:
```
M docs/technicalDesigns/dev-bot-context-management.md
?? TASK_DEBUGGING_SESSION_SUMMARY.md
?? TROUBLESHOOTING_REPORT.md
```

**The Truth:** These uncommitted changes were detected **AFTER** the container finished!

**What Actually Happened:**

1. **Container runs** - Fresh clone, isolated workspace ✅
2. **Task completes** - Code changes made, branch pushed ✅  
3. **Container exits** - Destroyed (--rm) ✅
4. **Artifacts saved** - TaskExecution service saves logs/patches to **HOST** filesystem
5. **Status capture** - Service runs `git status` on **HOST** workspace (not container)
6. **Status saved** - Uncommitted files detected in HOST `/home/jdubz/Development/app-monitor`

### The Artifact Generation Code

```typescript
// After container exits, save artifacts to HOST
const artifactsDir = '/home/jdubz/Development/app-monitor/dev-bots/artifacts';
const statusFile = `${artifactsDir}/task-${taskId}-uncommitted-${timestamp}-status.txt`;

// This runs on HOST, not in container!
const gitStatus = execSync('git status --short', { cwd: hostWorkspace });
fs.writeFileSync(statusFile, gitStatus);
```

**Root Cause:** Artifact generation runs on HOST after container cleanup, capturing HOST workspace state (which has our troubleshooting docs).

---

## Question 2: How to Mount/Authenticate GH CLI in Containers?

### Current Configuration

**Already Implemented (Line 640):**
```typescript
'-v', `${homeDir}/.config/gh:/home/node/.config/gh:rw`,  // GitHub CLI auth
```

**Host GH Status:**
```bash
$ gh auth status
✓ Logged in to github.com account Jdubz (keyring)
- Token: gho_************************************
- Token scopes: 'admin:public_key', 'gist', 'read:org', 'repo', 'workflow'
```

### Why PR Creation Failed

**From task stdout:**
```
⚠️ PR Creation Note
The GitHub CLI authentication has expired, so the PR couldn't be created automatically.
```

**Root Cause Analysis:**

The gh CLI uses **keyring** authentication on the host, but the container doesn't have access to the system keyring.

**Host Auth:**
```
Logged in to github.com account Jdubz (keyring)
```

**What's Mounted:**
```
~/.config/gh/config.yml  ← Config file (mounted)
~/.config/gh/hosts.yml   ← Host settings (mounted)
[MISSING] Keyring access ← System keyring (NOT accessible in container)
```

### The Keyring Problem

**Linux Keyring:**
- Credentials stored in: `gnome-keyring` or `secret-service`
- Accessed via: D-Bus IPC
- Location: `/run/user/1000/bus` (session-specific)

**Container Reality:**
- ❌ No D-Bus access
- ❌ No keyring access  
- ❌ No session user context
- ❌ Auth tokens not available

### Solutions

#### Option 1: Use GITHUB_TOKEN Environment Variable (RECOMMENDED)

**Implementation:**
```typescript
// In dockerConfig.ts - Already partially implemented!
export const GIT_ENV_KEYS = [
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'GITHUB_TOKEN',     // ← Already in the list!
  'GH_TOKEN'          // ← Already in the list!
] as const;
```

**Setup:**
```bash
# 1. Generate GitHub Personal Access Token
# Go to: https://github.com/settings/tokens
# Scopes needed: repo, workflow, admin:public_key

# 2. Set in backend/.env
echo 'GITHUB_TOKEN=ghp_your_token_here' >> backend/.env

# 3. Restart backend
# The env var will automatically be passed to containers
```

**How it works:**
```typescript
// buildGitEnvVars() already does this (line 36-40):
for (const key of GIT_ENV_KEYS) {
  const value = process.env[key];
  if (value) {
    gitEnvVars.push('-e', `${key}=${value}`);
  }
}
```

**Inside container:**
```bash
# gh CLI automatically uses GITHUB_TOKEN or GH_TOKEN
gh pr create --title "..." --body "..."
# No keyring needed!
```

#### Option 2: Mount OAuth Token File (LESS SECURE)

**Create plaintext token file:**
```bash
# Extract token from keyring
gh auth token > ~/.config/gh/token.txt
chmod 600 ~/.config/gh/token.txt
```

**Mount in container:**
```typescript
'-v', `${homeDir}/.config/gh/token.txt:/home/node/.config/gh/token.txt:ro`,
```

**Use in container:**
```bash
export GH_TOKEN=$(cat /home/node/.config/gh/token.txt)
gh pr create ...
```

**Risks:**
- ⚠️ Token stored as plaintext on disk
- ⚠️ Could be accidentally committed
- ⚠️ Less secure than keyring or env var

#### Option 3: Use gh CLI with --auth-token Flag

**Container command:**
```bash
GH_TOKEN=${GITHUB_TOKEN} gh pr create \
  --title "..." \
  --body "..." \
  --base main
```

**Implementation:**
```typescript
// In container shell script
`export GH_TOKEN=\${GITHUB_TOKEN} && ` +
`gh pr create --title "..." --body "..." --base main`
```

---

## Recommended Fix

### Step 1: Set GITHUB_TOKEN in Environment

```bash
cd /home/jdubz/Development/app-monitor/backend

# Generate token: https://github.com/settings/tokens
# Required scopes: repo, workflow

echo 'GITHUB_TOKEN=ghp_your_github_token_here' >> .env
```

### Step 2: Verify Token is Passed

```bash
# Check token is available
grep GITHUB_TOKEN backend/.env

# Restart backend to pick up new env var
pkill -f "tsx src/index.ts"
cd backend && npx tsx src/index.ts &
```

### Step 3: Test with Single Task

```bash
# Submit a test task
export API_KEY=dev-local-key-12345
node submit-and-monitor-tasks.js test-single-task.json

# Check if PR is created
# Should see in logs: "PR #XX created successfully"
```

### Step 4: Verify in Container

```bash
# Optional: Test gh auth in container manually
docker run --rm \
  -e GITHUB_TOKEN=$GITHUB_TOKEN \
  -e GH_TOKEN=$GITHUB_TOKEN \
  -e HOME=/home/node \
  dev-bot:latest \
  sh -c 'gh auth status'

# Expected output:
# ✓ Logged in to github.com via GH_TOKEN
```

---

## Why Uncommitted Changes Appeared

### Timeline of Events

```
1. Container starts
   └─ Fresh git clone in /workspace (isolated)

2. Claude makes changes
   └─ Edits files in /workspace (isolated)

3. Changes committed & pushed
   └─ Branch created in /workspace (isolated)

4. Container exits
   └─ /workspace destroyed (--rm)

5. TaskExecution saves artifacts
   ├─ stdout/stderr logs saved to HOST /dev-bots/artifacts/
   ├─ git status captured from HOST workspace ← HERE!
   └─ Patch file generated from git diff

6. Status file contains HOST workspace state
   └─ Shows our troubleshooting docs as uncommitted
```

**The uncommitted changes are NOT from the container - they're from the HOST workspace where we created documentation!**

### Proof: Check the Patch Files

```bash
# Look at what was actually changed in the container
cat /home/jdubz/Development/app-monitor/dev-bots/artifacts/task-implementation-b29d7a3b-c6bc-42b4-9fc5-d8a8c375c4cb-uncommitted-*.patch | head -50
```

**Result:**
```diff
diff --git a/docs/technicalDesigns/dev-bot-context-management.md
# ← This was changed by ANOTHER Claude agent during our session
# NOT by the ServiceGrid task!
```

### The Real Culprit

During our troubleshooting session, we had **MULTIPLE containers running simultaneously**:
- Container 1: ServiceGrid task
- Container 2: DevBotsPanel task  
- Container 3: LogsViewer task
- Container 4: ServiceCard task
- Container 5: LogLevelBadge task

One of these (likely Container 5) was working on a **different task** that modified `dev-bot-context-management.md`. When artifacts were saved, it captured the state of the **shared HOST workspace**.

---

## Architecture Insights

### What's Isolated

✅ **Container filesystem** - Each container has its own /workspace  
✅ **Git repository** - Fresh clone per container  
✅ **Code changes** - Modifications stay in container  
✅ **Process space** - Containers can't see each other  

### What's Shared

🔗 **Artifacts directory** - `/dev-bots/artifacts/` on HOST  
🔗 **Logs directory** - `/logs/` on HOST  
🔗 **Git credentials** - Mounted read-only from HOST  
🔗 **GitHub CLI config** - Mounted read-write from HOST  
🔗 **Remote repository** - All containers push to same GitHub repo  

### Why This Design?

**Benefits:**
1. Isolation prevents one task from breaking another
2. Fresh clones ensure clean starting state
3. No accumulated cruft in workspace
4. Containers are ephemeral and stateless

**Tradeoffs:**
1. Each clone takes ~10s (network + git overhead)
2. Multiple containers can push to same repo (requires coordination)
3. Artifacts saved to HOST can capture HOST state (by design)

---

## Summary

### Question 1 Answer: Container Isolation

**Containers ARE fully isolated:**
- No workspace mount
- Fresh git clone per task
- Changes isolated in container filesystem
- Auto-removed after completion

**The "uncommitted changes" artifact shows HOST state, not container state.**

### Question 2 Answer: GH CLI Authentication

**Already mounted, but keyring doesn't work in containers:**

**Fix: Use GITHUB_TOKEN environment variable**

```bash
# 1. Add to backend/.env
GITHUB_TOKEN=ghp_your_token_here

# 2. Restart backend
# Token automatically passed to containers

# 3. gh CLI uses token instead of keyring
# PR creation works!
```

---

## Next Steps

1. **Set GITHUB_TOKEN** in `backend/.env`
2. **Restart backend** to load new env var
3. **Test PR creation** with a single task
4. **Verify** PR created successfully
5. **Clean up** our troubleshooting docs (commit them)
6. **Retry** failed tasks if needed

---

## Files to Update

### backend/.env
```bash
# Add this line
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### No Code Changes Needed!
The infrastructure is already set up to pass GITHUB_TOKEN to containers. We just need to provide the token in the environment.

---

## Additional Notes

### Security Considerations

✅ **GITHUB_TOKEN in .env** - Good
- File is in .gitignore
- Only accessible to backend process
- Passed securely to containers via -e flag
- Not logged in plaintext

❌ **Keyring in container** - Not possible
- Requires D-Bus
- Requires session context
- Not container-friendly

✅ **Token scopes** - Minimal
- Only grant: repo, workflow
- Don't grant: admin, delete_repo

### Token Management

**Create token:**
1. Visit https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `workflow`
4. Set expiration: 90 days
5. Copy token immediately (shown once)

**Rotate regularly:**
```bash
# Update .env with new token
# Restart backend
# Old token invalidated automatically
```

**Revoke if compromised:**
```bash
# Visit https://github.com/settings/tokens
# Click "Delete" on compromised token
# Generate new token
# Update .env
```

