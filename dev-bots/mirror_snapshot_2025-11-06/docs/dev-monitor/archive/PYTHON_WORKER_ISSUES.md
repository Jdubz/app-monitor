# Python Worker Log & Container Issues - Analysis

## Issues Summary

### Issue 1: Log File Name Mismatch ⚠️

**Actual File**: `logs/plain/queue_worker.log` (13K, 10 lines of JSON logs)
**Symlink**: `logs/plain/worker.log` → `queue_worker.log`
**LogWatcher Maps**: `worker.log` → `python-worker` service
**Result**: ✅ LogWatcher correctly discovers and monitors the symlink

---

### Issue 2: Container Name Inconsistency ❌

**Actual Containers Running**:

- `job-finder-dev` (Up 9 minutes)
- `job-finder-local-dev` (Up 4 hours, healthy)

**ProcessManager Configuration**:

- ✅ **Status Check** (processManager.ts:299): Looks for `['job-finder-local-dev', 'job-finder-dev']` - CORRECT!
- ❌ **Shutdown** (processManager.ts:651): Tries to stop `'job-finder-worker'` - **WRONG!**

**Impact**: Shutdown doesn't actually stop the running containers

---

### Issue 3: Worker Crashed - Can't Connect to Firestore Emulator ❌

**From logs/plain/queue_worker.log**:

```json
{"severity": "ERROR", "timestamp": "2025-10-22T23:16:30.934367Z",
 "message": "Timeout of 300.0s exceeded, last exception: 503 failed to connect to all addresses;
 last error: UNKNOWN: ipv4:172.17.0.1:8080: Failed to connect to remote host: connect: Connection refused (111)"}
```

**Root Cause**:

- Worker container tries to connect to Firestore at `172.17.0.1:8080` (Docker gateway IP)
- Firebase emulator is running on host at `localhost:8080`
- Container can't reach the emulator from inside Docker network

**Timeline**:

1. ✅ 23:11:42 - Worker started successfully, logging configured
2. ✅ 23:11:42 - Firestore client initialized
3. ❌ 23:16:30 (5 min later) - Connection timeout, worker crashed

---

### Issue 4: Symlink vs Real File in dev-monitor ℹ️

**File Structure**:

```
logs/plain/
├── queue_worker.log     (real file, 13K)
└── worker.log -> queue_worker.log  (symlink)
```

**Why Symlink Exists**:

- Allows backward compatibility with old log paths
- LogWatcher monitors `worker.log` which redirects to actual file

**Is This a Problem?**: No, symlinks work fine with fs.existsSync() and file watchers

---

## Root Cause Analysis

### 1. Why Container Status Shows "Unknown"

**ServiceCard.tsx** expects:

```typescript
dockerContainer: {
  status: "running" | "stopped" | "exited" | "unknown";
  workerStatus: "running" | "idle" | "stopped" | "unknown";
}
```

**Actual Behavior**:

- ProcessManager correctly finds `job-finder-local-dev` or `job-finder-dev`
- Gets container status (running/stopped)
- But worker status is set from container exec command output
- Worker crashed → exec may fail → status becomes "unknown"

### 2. Why Logs Are Empty in UI

**Fixed in previous commit**, but worker crashed so no new logs are being written after 23:16:30

---

## Fixes Required

### HIGH PRIORITY

#### Fix 1: Update Shutdown to Use Correct Container Names ✅ FIXED

**File**: `dev-monitor/backend/src/services/processManager.ts:650-659`

**Fixed**: Changed from trying to stop non-existent 'job-finder-worker' to looping through actual container names:

```typescript
const containerNames = [
  "job-finder-local-dev",
  "job-finder-dev",
  "job-finder-staging-local",
];
for (const name of containerNames) {
  try {
    await stopDockerContainer(name);
    Logger.info(`Docker container ${name} stopped`);
  } catch (error) {
    Logger.warn(
      `Could not stop container ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
```

#### Fix 2: Fix Firestore Emulator Connection in Docker Container

**Problem**: Container uses `FIRESTORE_EMULATOR_HOST=172.17.0.1:8080` (Docker gateway)
**Solution**: Use `host.docker.internal:8080` OR run emulator in Docker network

**Option A - Use host.docker.internal** (Recommended):

```bash
docker run ... -e FIRESTORE_EMULATOR_HOST="host.docker.internal:8080" ...
```

**Option B - Use --network=host**:

```bash
docker run ... --network=host -e FIRESTORE_EMULATOR_HOST="localhost:8080" ...
```

---

### MEDIUM PRIORITY

#### Fix 3: Add Queue Worker Log to dev-monitor Discovery

**Current**: LogWatcher doesn't discover `queue_worker.log` directly
**Reason**: It only discovers `worker.log` (the symlink)

**Should We Change This?**: No - symlink works fine. But we could:

- Add `queue_worker` as an alias for `python-worker`
- Or rename `worker.log` symlink to match actual file

---

## Testing Checklist

After applying fixes:

- [ ] Restart dev-monitor backend
- [ ] Stop and remove existing containers: `docker rm -f job-finder-dev job-finder-local-dev`
- [ ] Start container with correct `FIRESTORE_EMULATOR_HOST`
- [ ] Verify container status shows "running" in dev-monitor UI
- [ ] Verify worker status shows "running" or "idle"
- [ ] Verify logs appear in python-worker panel
- [ ] Test shutdown - verify containers actually stop
- [ ] Check queue_worker.log for no connection errors

---

## Additional Notes

**Why worker.log Instead of queue_worker.log?**

- Shorter, cleaner name in UI
- Matches service name pattern (frontend.log, backend.log, worker.log)
- Symlink maintains compatibility

**Why Multiple Container Names?**

- `job-finder-dev` - Development environment
- `job-finder-local-dev` - Local development with emulators
- `job-finder-staging-local` - Staging testing locally

**Log Format**:

- ✅ Worker logs are JSON formatted (good!)
- ✅ Include severity, timestamp, service, category, action
- ✅ Compatible with dev-monitor log parsing
