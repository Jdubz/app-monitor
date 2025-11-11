# WebSocket Resilience Strategy for Zero-Downtime Deployments

## Problem Statement

Current WebSocket implementation loses all connections during blue-green deployments:
- Direct Socket.IO connections to backend instances
- No shared state between backend instances
- Connections severed immediately when old instance stops
- Clients must manually reconnect and re-establish state

## Current Architecture

```
Frontend Client
    |
    | WebSocket (Socket.IO)
    |
    v
Backend Instance (5001 or 5002)
    |
    | In-Memory State
    |
    +-- ConnectionManager (Map of connections)
    +-- LogWatcher (rooms: logs:service, logs:all)
    +-- InteractiveSessionGateway (session streams)
```

**Issues:**
- Each backend instance is isolated
- State exists only in-memory on single instance
- No way for blue instance to know about green instance's connections
- Nginx switches traffic instantly, breaking all WebSocket connections

## Solution: Socket.IO Redis Adapter

### Architecture with Redis

```
Frontend Clients
    |
    | WebSocket (Socket.IO)
    |
    v
Backend Instances (5001 AND 5002)
    |
    | Both connected to shared Redis
    |
    v
Redis (Pub/Sub or Streams)
    |
    +-- Shared rooms state
    +-- Message broadcast across instances
    +-- Connection state tracking
    +-- Optional: Persistent message queue
```

**Benefits:**
1. **Both instances can run simultaneously** during deployment
2. **Shared state** - both instances see all connections and rooms
3. **Cross-instance broadcasting** - emit to room on instance A, received by clients on instance B
4. **Graceful migration** - clients can reconnect to new instance seamlessly
5. **No lost messages** - messages queued during reconnection (with Streams adapter)

## Recommended Approach: Redis Streams Adapter

### Why Redis Streams (not Pub/Sub)?

| Feature | Redis Pub/Sub | Redis Streams | Impact for Us |
|---------|---------------|---------------|---------------|
| **Message Persistence** | ❌ Fire-and-forget | ✅ Persisted on disk | Can replay missed messages |
| **Delivery Guarantee** | At-most-once | At-least-once | No message loss during reconnect |
| **Consumer Groups** | ❌ No | ✅ Yes | Track which instance processed what |
| **Reconnection** | Lost messages | Resume from offset | Seamless client reconnection |
| **Message History** | ❌ No | ✅ Yes | Client can request missed messages |
| **Latency** | ~0.1ms | ~1-2ms | Acceptable trade-off |

**Verdict:** Redis Streams is the clear winner for zero-downtime deployments.

### Implementation Plan

#### Phase 1: Add Redis Infrastructure

**1. Install Redis on production server:**

```bash
sudo apt update
sudo apt install redis-server -y
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify installation
redis-cli ping  # Should return PONG
```

**2. Configure Redis for persistence:**

```bash
# /etc/redis/redis.conf
appendonly yes
appendfsync everysec
```

#### Phase 2: Install Socket.IO Redis Streams Adapter

**1. Add dependency:**

```bash
cd backend
npm install @socket.io/redis-streams-adapter redis
```

**2. Update backend/src/server.ts:**

```typescript
import { createAdapter } from '@socket.io/redis-streams-adapter';
import { createClient } from 'redis';

export async function createApp(options: CreateAppOptions = {}) {
  // ... existing code ...

  // Setup Socket.IO
  const io = new SocketIOServer(/* ... */);

  // Connect to Redis for multi-instance support
  if (process.env.NODE_ENV === 'production') {
    const redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    await redisClient.connect();

    const subClient = redisClient.duplicate();
    await subClient.connect();

    // Use Redis Streams adapter for zero-downtime deployments
    io.adapter(createAdapter(redisClient, subClient));

    logger.info({
      category: 'system',
      action: 'redis_adapter_enabled',
      message: 'Socket.IO Redis Streams adapter enabled',
    });
  }

  // ... rest of initialization ...
}
```

**3. Add Redis URL to systemd service:**

```ini
# scripts/systemd/app-monitor-backend@.service
Environment="REDIS_URL=redis://localhost:6379"
```

#### Phase 3: Enable Connection State Recovery

**Socket.IO v4.6+ supports automatic connection state recovery:**

```typescript
// backend/src/server.ts
const io = new SocketIOServer(httpServer, {
  cors: { /* ... */ },
  connectionStateRecovery: {
    // Maximum delay between reconnection attempts
    maxDisconnectionDuration: 2 * 60 * 1000,  // 2 minutes
    // Whether to skip middlewares upon successful recovery
    skipMiddlewares: true,
  },
});
```

**What this does:**
- Persists connection state to Redis Streams
- On reconnect, automatically restores:
  - Room memberships
  - Missed events while disconnected
  - Client state
- Client receives all missed messages upon reconnection

#### Phase 4: Frontend Auto-Reconnection

**Already built-in to Socket.IO client, but we can enhance it:**

```typescript
// frontend/src/services/socket.ts
import { io } from 'socket.io-client';

const socket = io(API_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,

  // Enable connection state recovery
  ackTimeout: 10000,
  retries: 3,
});

// Handle reconnection gracefully
socket.on('connect', () => {
  console.log('✅ Connected to server');
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server disconnected us, will auto-reconnect
    console.log('🔄 Server disconnected, reconnecting...');
  }
});

socket.on('connect_error', (error) => {
  console.log('❌ Connection error:', error.message);
});

// New: Handle state recovery
socket.io.on('reconnect', (attempt) => {
  console.log(`✅ Reconnected after ${attempt} attempts`);
});
```

#### Phase 5: Update Deployment Script

**Modify scripts/production/deploy.sh to keep both instances running:**

```bash
# Phase 8: Switch traffic (MODIFIED)
if [ "$ACTIVE_PORT" != "none" ]; then
    log_info "Phase 8: Switching traffic from ${ACTIVE_PORT} to ${TARGET_PORT}"

    # Update nginx to point to new instance
    update_nginx_upstream "${TARGET_PORT}"

    # CRITICAL: Keep old instance running for graceful migration
    log_info "Keeping old instance running for connection migration (120s)..."
    log_info "Both instances can serve traffic via shared Redis adapter"

    # Wait for clients to migrate
    sleep 120

    # Now stop old instance (clients have migrated)
    log_info "Stopping old service on port ${ACTIVE_PORT}..."
    sudo systemctl stop "app-monitor-backend@${ACTIVE_PORT}.service"

    log_info "✅ Zero-downtime deployment complete"
fi
```

**What happens during deployment:**

1. New instance (5002) starts, connects to Redis
2. Both instances (5001 + 5002) share Redis state
3. Nginx switches to point to 5002
4. **Existing clients on 5001 continue working** (via Redis)
5. New clients connect to 5002
6. After 120s, old instance (5001) shuts down
7. Any clients still connected to 5001 auto-reconnect to 5002
8. **Zero lost messages** - Redis Streams replays missed events

## Alternative Solutions Considered

### Option 1: Sticky Sessions (Not Recommended)

**Pros:**
- Simple to configure in nginx
- No Redis dependency

**Cons:**
- Clients stuck on old instance during deployment
- Still disconnected when old instance stops
- Doesn't solve the core problem

### Option 2: Redis Pub/Sub (Not Recommended)

**Pros:**
- Lower latency than Streams
- Simpler than Streams

**Cons:**
- ❌ **No message persistence** - messages lost if instance down
- ❌ **Fire-and-forget** - disconnected clients lose messages
- ❌ **No replay capability** - can't recover missed events

### Option 3: Message Queue (RabbitMQ, Kafka) (Overkill)

**Pros:**
- Enterprise-grade reliability
- Complex routing capabilities

**Cons:**
- Massive operational overhead
- Overkill for WebSocket broadcasts
- Much slower than Redis (10-50ms vs 1-2ms)

### Option 4: Database-Backed Messaging (Not Suitable)

**Pros:**
- Uses existing SQLite database

**Cons:**
- ❌ **Way too slow** - SQLite not designed for pub/sub
- ❌ **No real-time capabilities**
- ❌ **Polling required** - defeats purpose of WebSockets

## Cost-Benefit Analysis

### Implementation Cost

| Task | Estimated Time |
|------|---------------|
| Install Redis on server | 30 minutes |
| Add Redis Streams adapter | 1 hour |
| Enable connection state recovery | 30 minutes |
| Update deployment script | 30 minutes |
| Testing and validation | 2 hours |
| **Total** | **4.5 hours** |

### Operational Cost

- **Redis Memory:** ~50MB for 1000 connections (negligible)
- **Redis CPU:** <5% on small instance
- **Latency Overhead:** 1-2ms per message (acceptable)
- **Maintenance:** Minimal (Redis is very stable)

### Benefits

1. **Zero-downtime deployments** ✅
2. **No lost WebSocket messages** ✅
3. **Automatic client reconnection** ✅
4. **Horizontal scaling ready** (can add more backend instances)
5. **Better reliability** (Redis persistence)

## Migration Strategy

### Phase 1: Development Testing (1 day)

1. Install Redis locally
2. Add adapter to backend
3. Test with local deployment simulation
4. Verify zero message loss

### Phase 2: Staging Validation (2 days)

1. Deploy to staging environment
2. Run load tests with 100+ concurrent connections
3. Simulate blue-green rollover
4. Verify all clients reconnect seamlessly

### Phase 3: Production Rollout (1 day)

1. Install Redis on production server
2. Deploy updated backend code
3. Monitor first deployment closely
4. Validate zero downtime achieved

## Monitoring and Metrics

### Add these metrics to track Redis adapter health:

```typescript
// backend/src/services/metricsEmitter.ts

// Redis adapter metrics
const redisStats = await io.of('/').adapter.serverCount();
const roomCount = await io.of('/').adapter.rooms.size;

metrics.push({
  type: 'redis_adapter',
  timestamp: Date.now(),
  data: {
    serverCount: redisStats,
    roomCount,
    connectedClients: io.engine.clientsCount,
  }
});
```

### Dashboard Alerts

- Alert if Redis connection lost
- Alert if adapter message latency > 10ms
- Alert if client reconnection rate > 10% of connections

## Rollback Plan

If Redis adapter causes issues:

1. **Immediate:** Comment out adapter code, restart backend
2. **Fallback:** Socket.IO works without adapter (single instance mode)
3. **Recovery Time:** ~5 minutes to rollback

## Conclusion

**Recommendation: Implement Socket.IO Redis Streams Adapter**

**Why:**
- ✅ Achieves true zero-downtime deployments
- ✅ Low implementation cost (4.5 hours)
- ✅ Minimal operational overhead
- ✅ Industry-standard solution
- ✅ Future-proofs for horizontal scaling
- ✅ No lost messages during deployments

**Next Steps:**
1. Install Redis on production server
2. Add @socket.io/redis-streams-adapter dependency
3. Update server.ts to use adapter in production
4. Modify deployment script for 120s overlap
5. Test thoroughly in staging
6. Deploy to production

This solution directly addresses the core problem: **WebSocket state is ephemeral per instance**. By adding Redis as a shared state layer, both backend instances can coordinate during deployments, enabling truly seamless rollover with zero lost messages.
