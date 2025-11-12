# Deployment State Analysis & Data Loss Prevention

## Executive Summary

**CRITICAL FINDING:** The current blue-green deployment strategy will cause **data loss and service disruption** during deployments. Multiple in-memory data structures are not persisted, and the rollover process does not gracefully handle active connections or running tasks.

## Current Deployment Flow

### Blue-Green Strategy (scripts/production/deploy.sh)

1. **Active Port Detection** (Line 78-84): Determines which port (5001/5002) is currently active
2. **Target Port Selection** (Line 88-98): Selects the opposite port for deployment
3. **Build Phase** (Lines 177-202): Builds new version on target port
4. **Start Target Service** (Line 221): Starts backend on target port
5. **Health Checks** (Line 250): Verifies new service is healthy
6. **Traffic Switch** (Line 262): Updates nginx upstream to point to new port
7. **Old Service Shutdown** (Line 266): **Immediately stops old service with `systemctl stop`**

### Problem: Immediate Shutdown = Data Loss

**Line 266:** `sudo systemctl stop "app-monitor-backend@${ACTIVE_PORT}.service"`

This triggers:
- systemd sends **SIGTERM** to the process (systemd/app-monitor-backend@.service:27)
- Graceful shutdown handler runs (backend/src/index.ts:30-136)
- **30 second timeout** (systemd:25) before forced SIGKILL
- All in-memory state is **lost immediately**

## Critical In-Memory State That Will Be Lost

### 1. Active WebSocket Connections (HIGH SEVERITY)
**File:** `backend/src/services/connectionManager.ts:21-24`

```typescript
private connections = new Map<string, ConnectionInfo>();  // All active connections
private intervalIds = new Map<string, NodeJS.Timeout>();  // Heartbeat timers
```

**Impact:**
- All connected clients disconnected instantly
- Client receives no warning or migration signal
- Must manually reconnect and re-subscribe to events
- **User Experience:** Dashboard freezes, appears broken

### 2. Interactive Terminal Sessions (HIGH SEVERITY)
**Files:**
- `backend/src/services/interactiveSessionGateway.ts:33`
- `backend/src/services/interactiveSessionStreamManager.ts:41`

```typescript
private readonly clients = new Map<string, Set<WebSocket>>();  // Session WebSocket clients
private active?: ActiveStreamContext;  // Current active session
backlog: InteractiveStreamMessage[]  // Recent output (200 messages)
```

**Impact:**
- Active terminal sessions terminated mid-stream
- Message history lost (up to 200 recent messages)
- Docker exec streams orphaned
- **User Experience:** Terminal disconnects, loses context, must restart

### 3. Running Task Workers (CRITICAL SEVERITY)
**File:** `backend/src/services/ephemeralWorker.service.ts:72`

```typescript
private ephemeralWorkers = new Map<string, EphemeralWorker>();  // All running containers
```

**Impact:**
- Backend loses track of running Docker containers
- Containers continue running but become "orphaned"
- Task status unknown (is it still running? completed? failed?)
- May leave zombie containers consuming resources
- **User Experience:** Tasks appear stuck, never complete

### 4. Task Queue Polling (HIGH SEVERITY)
**File:** `backend/src/services/taskQueueWorker.ts:18-24`

```typescript
private running = false;  // Worker running state
private pollTimeout: NodeJS.Timeout | null = null;  // Scheduled poll
```

**Impact:**
- Task queue processing stops immediately
- Pending tasks won't be assigned to workers
- Queue backs up until service restarts
- **User Experience:** New tasks don't start

### 5. Background Monitoring Jobs (MEDIUM SEVERITY)
**File:** `backend/src/services/devBotsManager.ts:103-104,140`

```typescript
private healthCheckInterval?: NodeJS.Timeout;  // 5 second polling
private cleanupInterval?: NodeJS.Timeout;  // 60 second polling
private interactiveIdleInterval?: NodeJS.Timeout;  // 30 second idle check
```

**Impact:**
- System health monitoring paused
- Orphaned container cleanup stops
- Idle session detection stops
- **Duration:** Until new service starts and initializes

### 6. Retry Attempt History (MEDIUM SEVERITY)
**File:** `backend/src/services/retryManager.ts:24`

```typescript
private retryHistory: Map<string, RetryAttempt[]> = new Map();
```

**Impact:**
- Cumulative retry attempts lost
- Cannot enforce max retry limits across restarts
- Failed tasks may retry indefinitely
- **User Experience:** Wasted resources on already-failed tasks

### 7. Log File Watchers (MEDIUM SEVERITY)
**File:** `backend/src/services/logWatcher.ts:122-128`

```typescript
private watchedFiles: Map<string, WatchedFile> = new Map();  // File watchers
private recentEntries: Map<string, StructuredLogEntry[]> = new Map();  // Cache
private logIdCounter = 0;  // Log entry IDs
```

**Impact:**
- Log streaming stops immediately
- File position tracking lost (may replay logs or miss entries)
- Recent log cache lost
- **User Experience:** Log viewer disconnects

### 8. Circuit Breaker State (LOW-MEDIUM SEVERITY)
**File:** `backend/src/services/taskExecution.service.ts:67`

```typescript
private dockerCircuitBreaker?  // Failure tracking
```

**Impact:**
- Failure counts reset to zero
- May immediately retry operations that were failing
- Could cause cascading failures if Docker is having issues
- **User Experience:** Unnecessary error spike after deployment

### 9. Agent Rotation State (LOW SEVERITY)
**File:** `backend/src/services/agentTypeManager.ts:22`

```typescript
private lastAgentType: AgentType  // For rotation
```

**Impact:**
- Agent selection sequence resets
- May send multiple consecutive requests to same agent type
- Affects load distribution across agent types
- **User Experience:** Minor performance impact

## Current Graceful Shutdown (Insufficient)

**File:** `backend/src/index.ts:30-136`

The existing graceful shutdown handler:

1. ✅ **Stops accepting new connections** (closes HTTP server)
2. ❌ **5-second fixed wait** for tasks (line 67) - not enough for long-running tasks
3. ✅ **Drains WebSocket connections** (5s timeout, line 73)
4. ✅ **Stops log rotation**
5. ❌ **No state persistence** before exit
6. ❌ **No notification to clients** about migration

**Problems:**
- 30-second systemd timeout is too short for active tasks
- No persistence of in-memory state
- No coordination between old and new instances
- Clients don't know to reconnect to new instance

## Recommended Solutions

### Solution 1: State Persistence Before Shutdown (Immediate Fix)

**Modify:** `backend/src/index.ts` graceful shutdown handler

Add persistence phase before shutdown:

```typescript
// Phase 3: Persist ephemeral state
console.log('💾 Persisting in-memory state...');

// 3a. Save active worker tracking
const activeWorkers = ephemeralWorkerService.getActiveWorkers();
await db.saveActiveWorkers(activeWorkers);  // New DB table

// 3b. Save retry history
const retryHistory = retryManager.exportHistory();
await db.saveRetryHistory(retryHistory);  // New DB table

// 3c. Save circuit breaker state
const circuitBreakerState = taskExecution.getCircuitBreakerState();
await db.saveCircuitBreakerState(circuitBreakerState);  // New DB table

// 3d. Save active session IDs
const activeSessions = interactiveSessionGateway.getActiveSessions();
await db.saveActiveSessions(activeSessions);  // New DB table

// 3e. Save log file positions
const watchedFilePositions = logWatcher.getFilePositions();
await db.saveFileWatcherState(watchedFilePositions);  // New DB table

console.log('✅ State persistence complete');
```

**On startup, restore state:**

```typescript
// Restore persisted state on startup
const persistedWorkers = await db.getActiveWorkers();
ephemeralWorkerService.restoreWorkers(persistedWorkers);

const persistedRetryHistory = await db.getRetryHistory();
retryManager.importHistory(persistedRetryHistory);

// ... etc for all state
```

### Solution 2: Client-Side Reconnection Signaling (Better UX)

**Modify WebSocket disconnect handling:**

```typescript
// In graceful shutdown, send migration event to all clients
console.log('📡 Notifying clients of migration...');
connectionManager.broadcastToAll({
  type: 'server_migration',
  message: 'Server is upgrading, please reconnect in 5 seconds',
  reconnectDelay: 5000,
  newPort: TARGET_PORT  // If using port-based routing
});

// Wait for clients to receive message
await new Promise(resolve => setTimeout(resolve, 2000));
```

**Frontend client handles migration:**

```typescript
socket.on('server_migration', (data) => {
  console.log('Server migrating, will reconnect in', data.reconnectDelay, 'ms');

  // Reconnect after delay
  setTimeout(() => {
    socket.connect();
  }, data.reconnectDelay);
});
```

### Solution 3: Extended Shutdown Timeout (Configuration Fix)

**Modify:** `scripts/systemd/app-monitor-backend@.service:25`

```ini
# Increase timeout for graceful shutdown (allow active tasks to complete)
TimeoutStopSec=120  # Changed from 30 to 120 seconds
```

This gives:
- 30 seconds for task completion wait
- 30 seconds for WebSocket drain
- 30 seconds for state persistence
- 30-second buffer

### Solution 4: Overlapping Blue-Green (Zero-Downtime Fix)

**Modify:** `scripts/production/deploy.sh`

Instead of stopping old service immediately, keep both running briefly:

```bash
# Phase 8: Switch traffic (MODIFIED)
if [ "$ACTIVE_PORT" != "none" ]; then
    log_info "Phase 8: Switching traffic from ${ACTIVE_PORT} to ${TARGET_PORT}"
    update_nginx_upstream "${TARGET_PORT}"

    # DON'T stop old service immediately - let it drain
    log_info "Waiting for active connections to drain (60s grace period)..."
    sleep 60

    # Now stop old service after drain period
    log_info "Gracefully stopping old service on port ${ACTIVE_PORT}..."
    sudo systemctl stop "app-monitor-backend@${ACTIVE_PORT}.service"
fi
```

**Benefits:**
- Both services run simultaneously for 60 seconds
- Old service completes in-flight requests
- WebSocket clients have time to reconnect
- Active tasks complete without interruption

### Solution 5: Database-Backed Worker Tracking (Best Long-Term Fix)

**Create new table:** `active_workers`

```sql
CREATE TABLE active_workers (
  worker_id TEXT PRIMARY KEY,
  container_id TEXT NOT NULL,
  task_id TEXT,
  agent_type TEXT,
  status TEXT,
  created_at INTEGER,
  last_seen INTEGER
);
```

**Modify:** `backend/src/services/ephemeralWorker.service.ts`

```typescript
// Update worker tracking to use database
async createWorker(taskId: string, agentType: string) {
  const worker = { /* ... */ };

  // Store in BOTH memory AND database
  this.ephemeralWorkers.set(worker.id, worker);
  await db.insertActiveWorker(worker);  // Persist immediately

  return worker;
}

// On startup, restore from database
async initialize() {
  const persistedWorkers = await db.getActiveWorkers();

  for (const worker of persistedWorkers) {
    // Verify container still exists
    const containerExists = await docker.containerExists(worker.containerId);

    if (containerExists) {
      this.ephemeralWorkers.set(worker.id, worker);
      logger.info('Restored worker from database', { workerId: worker.id });
    } else {
      // Container gone, mark as failed
      await db.markWorkerFailed(worker.id, 'Container not found after restart');
    }
  }
}
```

## Deployment Test Plan

To verify zero-downtime deployment:

1. **Start load test:**
   - Create long-running task (5+ minutes)
   - Open interactive terminal session
   - Connect WebSocket client for real-time updates
   - Start task queue with pending tasks

2. **Trigger deployment:**
   - Run `scripts/production/deploy.sh`
   - Monitor throughout deployment

3. **Verify NO disruption:**
   - ✅ Long-running task completes successfully
   - ✅ Interactive terminal stays connected (or reconnects seamlessly)
   - ✅ WebSocket client receives all events (no gaps)
   - ✅ Pending tasks get picked up without delay
   - ✅ No orphaned containers remain

4. **Verify state preservation:**
   - Check retry history persists across restart
   - Verify circuit breaker state maintained
   - Confirm log streaming resumes at correct position

## Priority Recommendations

### Immediate (Before Next Production Deployment)
1. ✅ **Extend systemd timeout** to 120 seconds (Solution 3)
2. ✅ **Add 60-second drain period** before stopping old service (Solution 4)
3. ✅ **Implement client migration signaling** (Solution 2)

### Short-Term (Next Sprint)
4. ✅ **Add state persistence** for critical data (Solution 1)
   - Active worker tracking
   - Retry history
   - Circuit breaker state

### Long-Term (Technical Debt)
5. ✅ **Move worker tracking to database** (Solution 5)
6. ✅ **Implement connection migration** (hand off WebSocket to new instance)
7. ✅ **Add health check awareness** to clients (auto-reconnect on server restart)

## Impact Assessment

| State Type | Current Loss | After Immediate Fixes | After All Fixes |
|------------|--------------|----------------------|-----------------|
| WebSocket Connections | 100% lost | Graceful disconnect + reconnect | Seamless migration |
| Active Tasks | Orphaned | Completed before shutdown | Database-tracked |
| Task Queue | Paused | Minimal pause (< 60s) | No pause |
| Retry History | Lost | Persisted | Database-backed |
| Terminal Sessions | Lost | Graceful disconnect | Session resume |
| Log Streaming | Reset | Position persisted | No interruption |

## Conclusion

The current deployment strategy **will cause data loss and service disruption**. The recommended immediate fixes (Solutions 2-4) can be implemented quickly and will significantly improve the deployment experience. Long-term fixes (Solutions 1 and 5) will achieve true zero-downtime deployments.

**Next Steps:**
1. Implement immediate fixes before next production deployment
2. Create tickets for short-term and long-term improvements
3. Add deployment disruption testing to CI/CD pipeline
