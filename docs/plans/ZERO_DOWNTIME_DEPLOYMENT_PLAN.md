# Production Zero-Downtime Deployment Plan

**Date:** 2025-11-12  
**Priority:** P0 CRITICAL  
**Owner:** Production Engineering  
**Status:** PLANNING

---

## Problem Statement

**Production has been unstable with downtime during deploys and restarts:**

1. **Duplicate processes** causing port conflicts
2. **WebSocket connections lost** during deployments (all clients disconnect)
3. **State loss** during restarts (in-memory data gone)
4. **PR automation breaks** when webhooks aren't processed
5. **Manual intervention required** to recover from bad state

**Impact:** Cannot achieve autonomous operation without zero-downtime deploys.

---

## Root Causes Identified

### 1. Process Management Issues
- Multiple node processes running simultaneously (systemd + manual)
- Port conflicts when both try to bind same port
- No enforcement of single-instance per port
- Cleanup not automated

**Evidence:** `docs/investigations/STUCK_PRS_RESOLUTION.md`

### 2. WebSocket State Loss
- Each backend instance isolated (no shared state)
- Connections severed immediately when old instance stops
- Clients must manually reconnect
- Lost room subscriptions and session state

**Evidence:** `docs/plans/WEBSOCKET_RESILIENCE_STRATEGY.md`

### 3. Graceful Shutdown Missing
- SIGTERM kills process immediately
- No drain period for active connections
- No health check status transition (ready → draining → dead)

---

## Solution Architecture

### Phase 1: Redis-Based State Sharing (2 days)

**Goal:** Both blue and green instances can run simultaneously with shared state

**Implementation:**

```typescript
// backend/src/services/socketAdapter.ts
import { createAdapter } from '@socket.io/redis-streams-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

**Benefits:**
- ✅ Both instances see all connections
- ✅ Messages broadcast across instances
- ✅ No lost messages during reconnect
- ✅ Consumer groups track processing

**Checklist:**
- [ ] Install Redis on production server
- [ ] Configure Redis persistence (appendonly yes)
- [ ] Add `@socket.io/redis-streams-adapter` dependency
- [ ] Update Socket.IO initialization in server.ts
- [ ] Add Redis connection to config
- [ ] Test with both instances running

### Phase 2: Graceful Shutdown (1 day)

**Goal:** Drain connections before process exit

**Implementation:**

```typescript
// backend/src/server.ts
let isShuttingDown = false;

process.on('SIGTERM', async () => {
  isShuttingDown = true;
  logger.info('SIGTERM received, starting graceful shutdown');
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Drain WebSocket connections (30s timeout)
  io.emit('server:shutting_down', { timeout: 30000 });
  
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Close all connections
  io.close(() => {
    logger.info('Socket.IO closed');
    process.exit(0);
  });
});

// Health endpoint returns draining status
app.get('/api/health', (req, res) => {
  if (isShuttingDown) {
    res.status(503).json({ status: 'draining' });
  } else {
    res.status(200).json({ status: 'healthy' });
  }
});
```

**Benefits:**
- ✅ 30 second drain period
- ✅ Clients warned to reconnect
- ✅ Health check reflects draining state
- ✅ Load balancer removes from rotation

**Checklist:**
- [ ] Add SIGTERM handler to server.ts
- [ ] Update health endpoint with draining status
- [ ] Add server:shutting_down event
- [ ] Test with kill -TERM
- [ ] Update systemd TimeoutStopSec=35

### Phase 3: Blue-Green Deployment Automation (1 day)

**Goal:** Automated zero-downtime deploys

**Implementation:**

```bash
#!/bin/bash
# scripts/deploy-zero-downtime.sh

set -e

CURRENT_PORT=$(systemctl show app-monitor-backend@5001 --property ActiveState | grep -q active && echo 5001 || echo 5002)
NEW_PORT=$([ "$CURRENT_PORT" == "5001" ] && echo 5002 || echo 5001)

echo "Current: $CURRENT_PORT, New: $NEW_PORT"

# 1. Start new instance
systemctl start app-monitor-backend@$NEW_PORT
sleep 5

# 2. Wait for health check
for i in {1..12}; do
  if curl -f http://localhost:$NEW_PORT/api/health; then
    echo "New instance healthy"
    break
  fi
  sleep 5
done

# 3. Update nginx upstream
sed -i "s/localhost:$CURRENT_PORT/localhost:$NEW_PORT/" /etc/nginx/sites-enabled/app-monitor
nginx -s reload

# 4. Wait for drain period
sleep 35

# 5. Stop old instance
systemctl stop app-monitor-backend@$CURRENT_PORT

echo "Deployment complete: $NEW_PORT is active"
```

**Checklist:**
- [ ] Create deploy-zero-downtime.sh
- [ ] Test blue → green transition
- [ ] Test green → blue transition
- [ ] Add to CI/CD pipeline
- [ ] Update deployment docs

### Phase 4: Process Management Hardening (1 day)

**Goal:** Prevent duplicate processes

**Implementation:**

```bash
# scripts/production/cleanup-processes.sh (ENHANCED)
#!/bin/bash
# Kill any node processes not managed by systemd

SYSTEMD_PIDS=$(systemctl show app-monitor-backend@5001 app-monitor-backend@5002 --property MainPID | awk -F= '{print $2}')

ps aux | grep 'node.*backend/dist/index.js' | grep -v grep | while read line; do
  PID=$(echo $line | awk '{print $2}')
  
  if ! echo "$SYSTEMD_PIDS" | grep -q "$PID"; then
    echo "Killing orphaned process: $PID"
    kill -9 $PID
  fi
done
```

**Systemd Drop-In:**

```ini
# /etc/systemd/system/app-monitor-backend@.service.d/override.conf
[Service]
ExecStartPre=/usr/local/bin/cleanup-processes.sh
Restart=always
RestartSec=5
```

**Checklist:**
- [ ] Enhance cleanup-processes.sh
- [ ] Add systemd drop-in
- [ ] Test with duplicate process
- [ ] Add to deploy script
- [ ] Add nightly cron

---

## Implementation Timeline

| Day | Phase | Tasks |
|-----|-------|-------|
| Day 1 | Redis Setup | Install Redis, add adapter, test dual instance |
| Day 2 | Graceful Shutdown | SIGTERM handler, health check, drain period |
| Day 3 | Deploy Script | Blue-green automation, nginx reload, testing |
| Day 4 | Hardening | Process cleanup, systemd drop-in, monitoring |
| Day 5 | Validation | End-to-end testing, rollback test, docs |

**Total Effort:** 5 days

---

## Testing Strategy

### Test 1: Dual Instance Operation
```bash
# Start both instances
systemctl start app-monitor-backend@5001
systemctl start app-monitor-backend@5002

# Verify both healthy
curl http://localhost:5001/api/health
curl http://localhost:5002/api/health

# Connect client to 5001, emit from 5002
# Should receive message (Redis adapter working)
```

### Test 2: Graceful Shutdown
```bash
# Connect WebSocket client
# Send SIGTERM to process
kill -TERM <PID>

# Verify:
# - Client receives server:shutting_down event
# - Health check returns 503
# - 30 second drain period
# - Process exits cleanly
```

### Test 3: Blue-Green Deploy
```bash
# Run deploy script
./scripts/deploy-zero-downtime.sh

# Verify:
# - No dropped connections
# - No 502 errors
# - Both instances report to Redis
# - Old instance shuts down gracefully
```

### Test 4: Process Cleanup
```bash
# Start manual process
npm start &

# Run cleanup
./scripts/production/cleanup-processes.sh

# Verify only systemd processes remain
ps aux | grep node
```

---

## Rollback Plan

If deployment fails:

```bash
# Immediate rollback
systemctl start app-monitor-backend@<OLD_PORT>
sed -i "s/localhost:<NEW_PORT>/localhost:<OLD_PORT>/" /etc/nginx/sites-enabled/app-monitor
nginx -s reload
systemctl stop app-monitor-backend@<NEW_PORT>
```

---

## Monitoring & Alerts

### Metrics to Track

1. **Active connections per instance**
   - Emit: `websocket.connections{port=5001}`
   - Alert: If instance has >0 connections but health check fails

2. **Deployment duration**
   - Emit: `deploy.duration_seconds`
   - Alert: If >60 seconds

3. **Connection drops during deploy**
   - Emit: `websocket.disconnects{reason=server_restart}`
   - Alert: If >0 (should be zero with Redis adapter)

4. **Orphaned processes**
   - Emit: `processes.orphaned_count`
   - Alert: If >0

### Health Check Enhancement

```typescript
app.get('/api/health', (req, res) => {
  const redis = await redisClient.ping();
  const socketio = io.sockets.sockets.size;
  
  res.json({
    status: isShuttingDown ? 'draining' : 'healthy',
    uptime: process.uptime(),
    redis: redis === 'PONG' ? 'connected' : 'disconnected',
    websocket_connections: socketio,
    port: process.env.PORT
  });
});
```

---

## Success Criteria

- ✅ Both blue and green instances can run simultaneously
- ✅ WebSocket connections maintained during deployment
- ✅ No 502 errors during nginx upstream switch
- ✅ Zero connection drops (clients auto-reconnect to new instance)
- ✅ No orphaned processes after deployment
- ✅ Automated deploy script completes in <60 seconds
- ✅ Rollback works in <30 seconds

---

## Dependencies

- Redis server installed and configured
- Systemd units for both ports (5001, 5002)
- Nginx configured for upstream switching
- Sudo access for systemctl and nginx reload
- Monitoring/alerting infrastructure

---

## References

- Investigation: `docs/investigations/STUCK_PRS_RESOLUTION.md`
- WebSocket Strategy: `docs/plans/WEBSOCKET_RESILIENCE_STRATEGY.md`
- Process Management: `docs/archive/plans-completed-2025-11/BETTER_PROCESS_MANAGEMENT-completed-2025-11.md`
- Production Support: `docs/plans/APP_MONITOR_PRODUCTION_SUPPORT_PLAN.md`
