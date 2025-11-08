# Claude Code Docker Credentials Fix

## Problem
When mounting `~/.claude/.credentials.json` to `/home/worker/.claude/.credentials.json:ro` in Docker containers, the Claude CLI complains about missing API key or has permission issues.

## Root Causes

### Issue 1: Cannot Replace Mount Points
The `fix-credentials.sh` entrypoint script tries to create a symlink at `/home/worker/.claude/.credentials.json`, but **you cannot replace a Docker mount point with a symlink**. The mount is read-only and takes precedence.

```bash
# This FAILS - cannot replace mount with symlink
ln -sf /tmp/credentials.json /home/worker/.claude/.credentials.json
```

### Issue 2: Permission Problems
The Dockerfile was setting `/home/worker/.claude` to be owned by `root:root`, which prevents the worker user from reading/writing to that directory when Claude CLI runs.

```dockerfile
# This CAUSES permission errors:
chown root:root /home/worker/.claude
```

### Issue 3: Missing Critical Capabilities
The container drops ALL capabilities for security but doesn't add back several critical ones:

```yaml
cap_add:
  - CHOWN         # Can change ownership
  - SETGID        # Can set group ID
  - SETUID        # Can set user ID
  # MISSING: DAC_OVERRIDE (bypass file permission checks)
  # MISSING: FOWNER (required for chmod operations)
```

Without **DAC_OVERRIDE**, even root cannot write to directories or bypass file permission checks. Without **FOWNER**, root cannot change file permissions with chmod.

## Solution

### Step 1: Update docker-compose-simple.yml

#### 1a. Change credentials mount path
Mount credentials to intermediate path instead of final destination:

```yaml
# Change FROM:
- /home/jdubz/.claude/.credentials.json:/home/worker/.claude/.credentials.json:ro

# Change TO:
- /home/jdubz/.claude/.credentials.json:/mnt/host-credentials.json:ro
```

Apply to both `worker-a` (line 18) and `worker-b` (line 65).

#### 1b. Add Required Capabilities
Add DAC_OVERRIDE and FOWNER capabilities:

```yaml
cap_add:
  - CHOWN
  - DAC_OVERRIDE   # Add this - allows root to bypass file permission checks
  - FOWNER         # Add this - allows chmod operations
  - SETGID
  - SETUID
```

Apply to both `worker-a` (around line 26) and `worker-b` (around line 73).

### Step 2: Fix Dockerfile.simple
Remove the lines that set `/home/worker/.claude` to root ownership:

```dockerfile
# REMOVE these lines (28-30):
    # Keep .claude directory writable by root for entrypoint script
    chmod 755 /home/worker/.claude && \
    chown root:root /home/worker/.claude

# The directory should stay owned by worker:worker as set in line 26
```

### Step 3: Update fix-credentials.sh
Replace entire file with:

```bash
#!/bin/bash

# Fix credentials ownership if the file exists
if [ -f "/mnt/host-credentials.json" ]; then
    echo "Copying credentials to worker home directory..."
    # Ensure directory exists with proper ownership
    mkdir -p /home/worker/.claude
    chown -R worker:worker /home/worker/.claude
    chmod 755 /home/worker/.claude
    # Copy with proper ownership
    cp /mnt/host-credentials.json /home/worker/.claude/.credentials.json
    chown worker:worker /home/worker/.claude/.credentials.json
    chmod 600 /home/worker/.claude/.credentials.json
    echo "Credentials configured successfully"
else
    echo "Warning: Credentials file not found at /mnt/host-credentials.json"
fi

# Always switch to worker user for security
exec su-exec worker "$@"
```

**Key addition**: `chown -R worker:worker /home/worker/.claude` ensures the entire directory is owned by worker before copying the credentials file.

### Step 4: Rebuild Containers
```bash
cd claude-workers
docker-compose -f docker/docker-compose-simple.yml down
docker-compose -f docker/docker-compose-simple.yml build
docker-compose -f docker/docker-compose-simple.yml up -d
```

## Why This Works
1. **Mount to intermediate location** (`/mnt/host-credentials.json`) - not the final destination
2. **Entrypoint runs as root** - can execute privileged commands
3. **DAC_OVERRIDE capability** - allows root to bypass file permission checks and write to any directory
4. **FOWNER capability** - allows the entrypoint script to change file permissions with `chmod`
5. **Fix ownership** - ensures `/home/worker/.claude` is owned by `worker:worker`
6. **Copy file** to `/home/worker/.claude/.credentials.json` with proper ownership (600 permissions)
7. **Switch to worker user** - uses `su-exec worker` to drop privileges and run Claude CLI as worker
8. **No symlink conflicts** - we're copying to a normal directory, not replacing a mount

## Key Takeaways
1. **Never mount directly to the final path if you need to modify it.** Always mount to an intermediate location and copy from there.
2. **Entrypoint scripts must run as root** to perform ownership changes with `chown`.
3. **The .claude directory must be owned by the user** that runs Claude CLI, not root.
4. **The Dockerfile should NOT switch to non-root user** - let the entrypoint handle the user switch after setup.
5. **When using `cap_drop: ALL`, you MUST add back these capabilities:**
   - `CHOWN` - for ownership changes (chown command)
   - `DAC_OVERRIDE` - **CRITICAL** - allows root to bypass file permission checks (write, mkdir, cp commands)
   - `FOWNER` - for permission changes (chmod command)
   - `SETUID`/`SETGID` - for user switching (su-exec, su commands)
6. **DAC_OVERRIDE is the most important** - without it, even root cannot write files or create directories, regardless of permissions.
