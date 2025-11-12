# Production Zero-Downtime Deployment Plan - REVISED

**Date:** 2025-11-12  
**Priority:** P1 HIGH (was P0, infrastructure mostly complete)  
**Owner:** Production Engineering  
**Status:** 80% COMPLETE - Fine-tuning needed

---

## 🎯 Revision: What's Already Implemented

**GOOD NEWS:** Most of the zero-downtime deployment infrastructure is already implemented!

See [DEPLOYMENT_INFRASTRUCTURE_STATUS.md](../DEPLOYMENT_INFRASTRUCTURE_STATUS.md) for complete details.

**Already Working:**
- ✅ Blue-green deployment with automatic port switching
- ✅ 60-second connection drain period
- ✅ Graceful shutdown (90s: 60s tasks + 30s WebSockets)
- ✅ Client migration notifications
- ✅ Comprehensive health checks
- ✅ Database backup before deploy
- ✅ Automatic rollback on failure
- ✅ State persistence to database
- ✅ **NO REDIS** (deliberately not used - simpler architecture)

---

## Problem Statement (Revised)

**Original Concern:** Production unstable with downtime during deploys

**Actual Status:**
1. ✅ Blue-green infrastructure exists and works
2. ⚠️ Timing issues causing premature shutdown
3. ⚠️ Health endpoint doesn't reflect draining status
4. ⚠️ Process cleanup not automated
5. ✅ WebSocket reconnect works (no Redis needed)

**Impact:** Minor disruption during deploys, not catastrophic downtime

---

## Issues to Fix (Prioritized)

### Issue 1: systemd Timeout Too Short 🔴 CRITICAL
**Priority:** P0 - 15 minutes to fix

**Problem:**

### Issue 1: systemd Timeout Too Short 🔴 CRITICAL
**Priority:** P0 - 15 minutes to fix

**Problem:**
- systemd `TimeoutStopSec=30` but graceful shutdown needs 90s (60s tasks + 30s WebSockets)
- After 30s, systemd sends SIGKILL
- State persistence and WebSocket drain never complete

**Fix:**
```bash
sudo systemctl edit app-monitor-backend@.service

# Add:
[Service]
TimeoutStopSec=120
```

**Then:**
```bash
sudo systemctl daemon-reload
```

**Test:**
```bash
sudo systemctl stop app-monitor-backend@5001
# Should take ~90s, not 30s
```

---

### Issue 2: Health Endpoint Missing Drain Status 🟡 HIGH
**Priority:** P1 - 30 minutes to fix

**Problem:**
- `/api/health` always returns 200 even during shutdown
- Nginx may send new connections to draining instance

**Fix:**
```typescript
// backend/src/server.ts - export isShuttingDown
export let isShuttingDown = false;

// backend/src/routes/index.ts or health route
app.get('/api/health', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({
      status: 'draining',
      message: 'Server shutting down gracefully'
    });
  }
  
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    port: config.port
  });
});

// backend/src/index.ts
import { isShuttingDown as shuttingDown } from './server.js';
// Set it in gracefulShutdown() - already have local var, make it global
```

---

### Issue 3: Drain Period Too Long ⚠️ MEDIUM
**Priority:** P2 - 15 minutes to optimize

**Problem:**
- 60s drain in deploy.sh + 90s graceful shutdown = 150s total
- Too conservative

**Fix:**
```bash
# scripts/production/deploy.sh line ~269
# Change from:
sleep 60

# To:
sleep 30  # Shorter external drain, rely on graceful shutdown
```

---

### Issue 4: Process Cleanup Not Automated ⚠️ MEDIUM
**Priority:** P2 - 15 minutes to automate

**Problem:**
- `cleanup-processes.sh` exists but not run automatically
- Orphaned processes accumulate

**Fix:**
```bash
sudo mkdir -p /etc/systemd/system/app-monitor-backend@.service.d/
sudo tee /etc/systemd/system/app-monitor-backend@.service.d/cleanup.conf <<EOF
[Service]
ExecStartPre=/opt/app-monitor/scripts/cleanup-processes.sh
EOF

sudo systemctl daemon-reload
```

---

## Implementation Plan (Revised)

### Day 1: Critical Fixes (1.5 hours total)

**Morning (1 hour):**
1. Fix systemd timeout (15 min)
2. Add draining status to health endpoint (30 min)
3. Test graceful shutdown (15 min)

**Afternoon (30 min):**
4. Optimize drain period (15 min)
5. Automate process cleanup (15 min)

**Testing:**
- Deploy from main branch
- Monitor with no 502 errors
- Verify graceful shutdown completes

### Day 2: Monitoring & Metrics (Optional)

**Add deployment observability:**
- Deployment duration tracking
- Connection drop counting
- Orphaned process alerts
- Health check failure tracking

---

## What We're NOT Doing (And Why)

### ❌ Redis-Based State Sharing
**Reason:** Not needed - current architecture works

**Why No Redis:**
1. Adds infrastructure complexity
2. Another point of failure
3. Database persistence works fine
4. Client reconnect is automatic
5. 60s drain + graceful shutdown is sufficient

**Trade-offs Accepted:**
- WebSocket connections briefly dropped
- Clients auto-reconnect (already implemented)
- No shared rooms (not needed for our use case)
- Brief disruption acceptable

### ❌ Complex Deployment Orchestration
**Reason:** Simple bash scripts work well

**Current is Good:**
- Blue-green with systemd
- Nginx upstream switching
- Health check validation
- Automatic rollback

### ❌ Load Balancer Changes
**Reason:** Nginx config switching works

**No need for:**
- HAProxy
- Consul service discovery  
- Kubernetes
- Complex routing

---

## Testing Strategy (Simplified)

### Test 1: Graceful Shutdown (5 min)
```bash
# On production server
sudo systemctl stop app-monitor-backend@5001

# Verify in journalctl:
# - "Graceful shutdown initiated"
# - "Notified all clients"
# - "Waiting for active tasks" (60s)
# - "Draining WebSocket connections" (30s)
# - "State persisted"
# - Clean exit after ~90s
```

### Test 2: Full Deployment (10 min)
```bash
# Trigger deploy
git push origin main

# On server, monitor
journalctl -u app-monitor-deploy-agent -f

# Verify:
# - New instance starts on inactive port
# - Health checks pass
# - Nginx switches upstream
# - 30s drain period
# - Old instance stops gracefully (~90s)
# - No 502 errors
```

### Test 3: Health Endpoint (2 min)
```bash
# Normal operation
curl http://localhost:5001/api/health
# {"status":"healthy","uptime":1234,"port":5001}

# During shutdown
sudo systemctl stop app-monitor-backend@5001 &
sleep 2
curl http://localhost:5001/api/health
# {"status":"draining","message":"Server shutting down gracefully"}
```

---

## Success Criteria (Revised)

- ✅ Graceful shutdown completes in 90s (not killed at 30s)
- ✅ Health endpoint returns 503 during drain
- ✅ No 502 errors during deployment
- ✅ Process cleanup runs automatically
- ✅ Deployment completes in <5 minutes
- ✅ No manual intervention needed
- ✅ State persisted successfully

---

## Timeline (Revised)

| Task | Effort | Priority |
|------|--------|----------|
| Fix systemd timeout | 15 min | P0 |
| Add drain status to health | 30 min | P1 |
| Optimize drain period | 15 min | P2 |
| Automate cleanup | 15 min | P2 |
| Test full deploy | 15 min | P1 |
| Add monitoring (optional) | 2 hours | P3 |

**Total Critical Path:** 1.5 hours (not 5 days!)

---

## Rollback Plan

If changes cause issues:

```bash
# Revert systemd timeout
sudo systemctl edit --full app-monitor-backend@.service
# Change TimeoutStopSec back to 30

sudo systemctl daemon-reload
sudo systemctl restart app-monitor-backend@5001

# Revert deploy.sh drain
cd /opt/app-monitor/current
git checkout scripts/production/deploy.sh

# Revert health endpoint
git revert <commit>
npm run build -w backend
sudo systemctl restart app-monitor-backend@5001
```

---

## References

- **Current Status:** `docs/DEPLOYMENT_INFRASTRUCTURE_STATUS.md`
- **Deployment Script:** `scripts/production/deploy.sh`
- **Graceful Shutdown:** `backend/src/index.ts` (lines 36-170)
- **Health Checks:** `scripts/production/health-check.sh`
- **systemd Service:** `/etc/systemd/system/app-monitor-backend@.service`
