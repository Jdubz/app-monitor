# Production Deployment Infrastructure - Current Status

**Date:** 2025-11-12  
**Status:** PARTIALLY IMPLEMENTED - No Redis Solution

---

## What's Already Implemented ✅

### 1. Blue-Green Deployment with 60-Second Drain Period
**Location:** `scripts/production/deploy.sh`

**Features:**
- ✅ Dual systemd services on ports 5001 and 5002
- ✅ Automatic port switching (blue ↔ green)
- ✅ 60-second connection drain period
- ✅ Health checks before traffic switch
- ✅ Automatic rollback on failure
- ✅ Database backup before deployment
- ✅ Keep last 5 releases

**How it works:**
```bash
# Phase 1: Deploy new code to inactive port (e.g., 5002)
systemctl start app-monitor-backend@5002

# Phase 2: Health checks on new instance
./health-check.sh  # Validates service, port, HTTP, database, Docker

# Phase 3: Switch nginx upstream to new port
nginx reload  # Traffic now goes to 5002

# Phase 4: 60-second drain period
# OLD service (5001) stays running for 60 seconds
# - New connections → 5002
# - Existing connections → 5001
sleep 60

# Phase 5: Stop old service
systemctl stop app-monitor-backend@5001
```

### 2. Graceful Shutdown (90 seconds total)
**Location:** `backend/src/index.ts`

**Features:**
- ✅ SIGTERM/SIGINT handlers implemented
- ✅ Client notification before shutdown
- ✅ 60-second task completion wait
- ✅ 30-second WebSocket drain period
- ✅ State persistence to database

**Shutdown Sequence:**
```
1. Client Notification (1s)
   - Broadcasts server_migration event
   - Clients reconnect automatically

2. Stop Accepting Connections (immediate)
   - HTTP server.close()

3. Task Completion Wait (60s)
   - Active dev-bot tasks complete

4. WebSocket Drain (30s)
   - Wait for connections to close naturally

5. State Persistence
   - Save retry history to database
   - Save PR conditions to database

6. Exit (code 0)
```

### 3. Comprehensive Health Checks
**Location:** `scripts/production/health-check.sh`

**Checks:**
- ✅ Service running (systemctl)
- ✅ Port listening (ss/nc/lsof)
- ✅ HTTP health endpoint (/api/health)
- ✅ Database connectivity
- ✅ Docker connectivity
- ✅ WebSocket connectivity (if websocat available)

**Features:**
- 30 retries with 2-second delay (60s total)
- Non-critical checks don't fail deployment
- Multiple methods for port detection

### 4. Systemd Service Configuration
**Location:** `/etc/systemd/system/app-monitor-backend@.service`

**Features:**
- ✅ Port parameterization (@5001, @5002)
- ✅ 30-second graceful shutdown timeout
- ✅ Automatic restart on failure
- ✅ Environment file loading
- ✅ Resource limits
- ✅ Journal logging

### 5. Pull-Based CI/CD Deployment
**Location:** `.github/workflows/deploy-production.yml`

**Features:**
- ✅ Build and test on GitHub Actions
- ✅ Create deployment artifact
- ✅ GitHub deployment API integration
- ✅ Pull agent downloads and deploys
- ✅ Deployment status monitoring

---

## What's NOT Implemented ❌

### 1. Redis/Shared State
**Decision:** No-Redis solution chosen

**Current Limitation:**
- WebSocket connections are instance-specific
- During 60-second drain, clients connected to old instance lose connection
- No shared rooms across instances

**Mitigation:**
- Client auto-reconnect implemented
- Graceful shutdown warning sent
- 60-second drain allows most operations to complete

### 2. Health Endpoint Status Transitions
**Missing:**
```typescript
// /api/health should return:
{
  status: 'healthy' | 'draining' | 'unhealthy',
  uptime: number,
  connections: number,
  port: number
}
```

**Current:**
```typescript
// Simple status only
{
  message: 'Dev Monitor Backend',
  version: '1.0.0',
  status: 'running'
}
```

### 3. Process Cleanup Automation
**Location:** `scripts/production/cleanup-processes.sh` exists but not automated

**Missing:**
- No ExecStartPre in systemd to run cleanup
- No nightly cron job
- No automated orphan process detection

### 4. Deployment Metrics
**Missing:**
- No deployment duration tracking
- No connection drop counting
- No webhook heartbeat monitoring
- No orphaned process alerts

### 5. Client-Side Drain Handling
**Missing:**
- Server sends `server_migration` event
- But client implementation may need enhancement to show UI feedback

---

## Actual Deployment Flow (As Implemented)

```
┌─────────────────────────────────────────────────────────┐
│ 1. GitHub Push to Main                                  │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│ 2. GitHub Actions: Build + Test                         │
│    - npm ci                                              │
│    - npm test                                            │
│    - npm run build                                       │
│    - Create tarball                                      │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│ 3. Create GitHub Deployment (API)                       │
│    - State: queued                                       │
│    - Artifact metadata attached                          │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│ 4. Pull Agent (on server) Detects Deployment            │
│    - Polls GitHub deployments API every 2 minutes       │
│    - Downloads artifact                                  │
│    - Runs: /opt/app-monitor/scripts/deploy.sh           │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│ 5. deploy.sh Execution                                   │
│                                                          │
│ A. Determine Ports                                       │
│    Active: 5001 → Target: 5002                         │
│                                                          │
│ B. Database Backup                                       │
│    backup-db.sh                                          │
│                                                          │
│ C. Create Release                                        │
│    /opt/app-monitor/releases/20251112_030000            │
│                                                          │
│ D. Build Application                                     │
│    - npm ci (backend)                                    │
│    - npm run build (backend)                             │
│    - npm ci (frontend)                                   │
│    - npm run build (frontend)                            │
│                                                          │
│ E. Start New Instance                                    │
│    systemctl start app-monitor-backend@5002             │
│                                                          │
│ F. Health Checks                                         │
│    PORT=5002 health-check.sh                             │
│    - Service running? ✓                                  │
│    - Port listening? ✓                                   │
│    - HTTP health? ✓                                      │
│    - Database? ✓                                         │
│    - Docker? ✓                                           │
│                                                          │
│ G. Switch Traffic                                        │
│    sed nginx config: 5001 → 5002                        │
│    nginx reload                                          │
│                                                          │
│ H. 60-Second Drain                                       │
│    ┌─────────────────────────────────┐                  │
│    │ Port 5001 (old): Existing only  │                  │
│    │ Port 5002 (new): New connections│                  │
│    └─────────────────────────────────┘                  │
│    sleep 60                                              │
│                                                          │
│ I. Stop Old Instance                                     │
│    systemctl stop app-monitor-backend@5001              │
│    - Sends SIGTERM                                       │
│    - 30s graceful shutdown:                              │
│      * Notify clients (1s)                               │
│      * Wait tasks (60s) - but service already stopped   │
│      * Drain WebSockets (30s)                            │
│      * Persist state                                     │
│                                                          │
│ J. Cleanup Old Releases                                  │
│    Keep last 5 releases                                  │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│ 6. Update GitHub Deployment Status                      │
│    - State: success                                      │
│    - Environment URL                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Issues & Gaps

### Issue 1: Graceful Shutdown Timing Conflict
**Problem:** systemctl stop has 30s timeout, but graceful shutdown wants 90s (60s tasks + 30s websockets)

**Current Behavior:**
```
systemctl stop → SIGTERM
  ↓
Graceful shutdown starts:
  - Client notify: 1s ✓
  - Task wait: 60s ❌ (killed at 30s by systemd)
  - WebSocket drain: 30s ❌ (never reached)
  - State persist: ❌ (never reached)
```

**Fix Needed:**
```ini
# /etc/systemd/system/app-monitor-backend@.service
[Service]
TimeoutStopSec=120  # Change from 30 to 120
```

### Issue 2: Double Drain Period
**Problem:** 60s drain in deploy.sh THEN 90s graceful shutdown = 150s total shutdown time

**Current:**
```
deploy.sh: sleep 60 (both services running)
  ↓
systemctl stop → graceful shutdown 90s (only one service)
  = 150 seconds total
```

**Should Be:**
```
deploy.sh: sleep 30 (shorter drain)
  ↓
systemctl stop → graceful shutdown 90s
  = 120 seconds total
```

### Issue 3: Health Endpoint Doesn't Reflect Drain Status
**Problem:** During graceful shutdown, /api/health still returns 200

**Should Return:**
```typescript
if (isShuttingDown) {
  res.status(503).json({ status: 'draining' });
}
```

**Impact:** Nginx may send new connections to draining instance

### Issue 4: No Automated Process Cleanup
**Problem:** Orphaned processes from manual starts not automatically cleaned

**Exists:** `cleanup-processes.sh`  
**Missing:** Automation

**Fix:**
```ini
# /etc/systemd/system/app-monitor-backend@.service.d/override.conf
[Service]
ExecStartPre=/opt/app-monitor/scripts/cleanup-processes.sh
```

### Issue 5: Client Reconnect May Be Slow
**Problem:** Clients receive `server_migration` event but reconnect after 5s delay

**During 60s drain:**
- Clients on old instance: Warned, wait 5s, reconnect ✓
- New clients: Go to new instance ✓

**After systemctl stop:**
- Remaining clients on old: Disconnected abruptly ❌

---

## Recommendations for Improvement

### Priority 1: Fix Graceful Shutdown Timing (15 min)
```bash
# Update systemd service
sudo systemctl edit app-monitor-backend@.service

# Add:
[Service]
TimeoutStopSec=120
```

### Priority 2: Add Draining Status to Health Endpoint (30 min)
```typescript
// backend/src/server.ts or routes
export let isShuttingDown = false;  // Make global

app.get('/api/health', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({
      status: 'draining',
      message: 'Server is shutting down gracefully'
    });
  }
  
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    connections: connectionManager.getConnectionCount(),
    port: config.port
  });
});
```

### Priority 3: Optimize Drain Period (15 min)
```bash
# scripts/production/deploy.sh line 269
# Change from:
sleep 60

# To:
sleep 30  # Shorter drain, rely on graceful shutdown
```

### Priority 4: Automate Process Cleanup (15 min)
```bash
# Create systemd drop-in
sudo mkdir -p /etc/systemd/system/app-monitor-backend@.service.d/
sudo tee /etc/systemd/system/app-monitor-backend@.service.d/cleanup.conf <<EOF
[Service]
ExecStartPre=/opt/app-monitor/scripts/cleanup-processes.sh
EOF

sudo systemctl daemon-reload
```

### Priority 5: Add Deployment Metrics (2 hours)
```typescript
// Track in backend:
- deployment_duration_seconds
- websocket_disconnects{reason="deploy"}
- orphaned_processes_count
- health_check_failures_total
```

---

## Summary: What We Have vs What We Need

| Feature | Status | Notes |
|---------|--------|-------|
| Blue-Green Deploy | ✅ Working | Scripts fully implemented |
| 60s Drain Period | ✅ Working | In deploy.sh |
| Graceful Shutdown | ⚠️ Partial | Timing issue with systemd |
| Client Notification | ✅ Working | server_migration event sent |
| Health Checks | ✅ Working | Comprehensive validation |
| Database Backup | ✅ Working | Automatic before deploy |
| Rollback | ✅ Working | Automatic on failure |
| State Persistence | ✅ Working | Retry history + PR conditions |
| **Redis/Shared State** | ❌ Not Used | **Deliberately NOT implemented** |
| Health Endpoint Status | ❌ Missing | Doesn't show draining |
| Process Cleanup | ⚠️ Manual | Script exists, not automated |
| Deployment Metrics | ❌ Missing | No tracking |
| systemd Timeout | ⚠️ Wrong | 30s vs 90s needed |

---

## Testing Deployment Stability

### Test 1: Standard Deployment
```bash
# Trigger deployment
git push origin main

# Monitor on server
journalctl -u app-monitor-deploy-agent -f

# Verify:
# - No 502 errors
# - No connection drops
# - Smooth port transition
```

### Test 2: Graceful Shutdown
```bash
# Find active service
systemctl status app-monitor-backend@5001

# Send SIGTERM
sudo systemctl stop app-monitor-backend@5001

# Verify:
# - Client migration notification sent
# - 30s drain (should be 90s)
# - State persisted
# - Clean exit
```

### Test 3: Health Checks
```bash
# Test on inactive port
PORT=5002 sudo systemctl start app-monitor-backend@5002
PORT=5002 ./scripts/production/health-check.sh

# Should pass all checks
```

---

## No-Redis Decision Rationale

**Why No Redis:**
1. Adds infrastructure complexity
2. Another point of failure
3. State persistence to database works
4. 60s drain + client reconnect is acceptable
5. Simpler operations

**Trade-offs Accepted:**
- WebSocket connections dropped during deploy
- Clients must reconnect (auto-reconnect implemented)
- No shared rooms across instances (not needed)
- Brief disruption acceptable for stability

**Works Because:**
- Client reconnect is automatic
- server_migration event warns clients
- 60s drain allows operations to complete
- State is persisted to database
- Blue-green means one instance always available

---

**Conclusion:** Current implementation is 80% complete. Main gaps are timing issues and health endpoint, not missing Redis.
