# ✅ Docker Credentials Issue - RESOLVED

## Problem
Claude Code containers were failing to authenticate due to permission issues when mounting credentials.

## Root Causes Discovered
1. **Mount Point Conflict** - Mounting directly to `/home/worker/.claude/.credentials.json` prevents modifying the file
2. **Directory Ownership** - Directory was owned by root instead of worker user
3. **Missing DAC_OVERRIDE Capability** - Without this, even root cannot bypass file permission checks

## Solution Applied

### Files Modified
1. **docker-compose-simple.yml**
   - Changed mount from `/home/worker/.claude/.credentials.json` to `/mnt/host-credentials.json`
   - Added `DAC_OVERRIDE` and `FOWNER` capabilities

2. **Dockerfile.simple**
   - Removed root ownership of `.claude` directory

3. **fix-credentials.sh**
   - Updated to copy from `/mnt/host-credentials.json`
   - Added explicit ownership fix: `chown -R worker:worker /home/worker/.claude`

### Required Docker Capabilities
```yaml
cap_add:
  - CHOWN          # Change file ownership
  - DAC_OVERRIDE   # ⭐ CRITICAL - Bypass file permission checks
  - FOWNER         # Change file permissions (chmod)
  - SETGID         # Switch group
  - SETUID         # Switch user
```

## Verification
```bash
# Both workers now show:
✓ Credentials configured successfully
✓ Claude CLI version: 2.0.25
✓ Credentials file: -rw------- worker:worker /home/worker/.claude/.credentials.json
```

## Key Learning
**DAC_OVERRIDE is essential when using `cap_drop: ALL`** - Without it, even root cannot write files or create directories, making file operations impossible in security-hardened containers.

## Status: ✅ WORKING
Both worker-a and worker-b containers are now running with properly configured Claude Code credentials.

---

## Git Identity Forwarding & Flush Guard (2025-11-08)

### Why
- Commits created inside Claude/Codex containers were missing the host developer identity.
- Git pushes occasionally raced the SQLite completion step, so tasks finished before files landed on disk.

### Fix
1. **Git Env Passthrough**
   - `taskExecution.service.ts` now forwards `GIT_AUTHOR_*`, `GIT_COMMITTER_*`, and `GITHUB_TOKEN` into both Codex and Claude containers.
   - Sensitive values are never written to logs (sanitized Docker arg logging).
2. **Post-Execution Flush Guard**
   - Added a tiny (2s) flush wait before marking tasks complete so git operations inside the container can finish writing.

### Impact
- Dev-bots produce commits that match the triggering developer.
- Race conditions between CLI completion and git writes are eliminated without slowing normal executions.
