# Migration Guide: Unified Socket.IO Architecture

**Date:** November 2025
**Status:** In Progress
**Impact:** Breaking changes for interactive terminal feature

---

## Overview

This migration consolidates all real-time communication onto Socket.IO, replacing the previous mixed architecture of Socket.IO (for task queue events) and native WebSocket (for interactive terminal).

---

## What's Changing

### Backend Changes

#### ❌ Removed
- `InteractiveSessionStreaming` service (native WebSocket)
- `ws` library dependency
- HTTP upgrade handling in `server.ts`
- Native WebSocket path: `/api/dev-bots/interactive/session/*/stream`

#### ✅ Added
- `SocketIOTerminalHandler` service
- Terminal event types in `socketEvents.ts`
- Socket.IO rooms for session isolation
- Standardized `terminal:*` events

### Frontend Changes

#### ❌ Removed
- Native `WebSocket` connection in `useInteractiveSession`
- Custom reconnection logic
- WebSocket URL construction (`getDevBotsInteractiveStreamUrl`)

#### ✅ Added
- Socket.IO events for terminal (`terminal:join`, `terminal:output`, etc.)
- Automatic reconnection via Socket.IO
- Room-based session management

---

## Migration Steps

### Step 1: Update Backend Dependencies

No changes needed - Socket.IO already installed.

Optional cleanup:
```bash
# Remove ws library if no other dependencies use it
cd backend
npm uninstall ws @types/ws
```

### Step 2: Update Backend Code

#### A. Add Terminal Handler to server.ts

```typescript
import { SocketIOTerminalHandler } from './services/socketIOTerminalHandler.js';

// After creating Socket.IO server
const terminalHandler = new SocketIOTerminalHandler({
  io,
  docker,
  backlogLimit: 200,
  shellCommand: ['/bin/bash'],
});

// Store reference for API access
export let terminalHandler: SocketIOTerminalHandler;
```

#### B. Update DevBotsManager Integration

```typescript
// In devBotsManager.factory.ts or similar
export function getTerminalHandler(): SocketIOTerminalHandler {
  return terminalHandler;
}
```

#### C. Update API Routes (if using REST for session management)

```typescript
// Start session endpoint
router.post('/interactive/session', async (req, res) => {
  const { sessionId, containerId } = req.body;

  await terminalHandler.startSession(sessionId, containerId);

  res.json({
    sessionId,
    // No longer need WebSocket URL - clients use Socket.IO
    message: 'Session started. Connect via Socket.IO and emit terminal:join',
  });
});

// Stop session endpoint
router.delete('/interactive/session/:id', async (req, res) => {
  await terminalHandler.stopSession(req.params.id);
  res.json({ success: true });
});
```

### Step 3: Update Frontend Code

#### A. Update useInteractiveSession Hook

**Before:**
```typescript
const socket = new WebSocket(url);

socket.addEventListener('open', () => {
  setConnectionState('connected');
});

socket.addEventListener('message', (event) => {
  const payload = JSON.parse(event.data);
  // Handle message
});

socket.addEventListener('close', () => {
  // Manually handle reconnection
});
```

**After:**
```typescript
import { useEnhancedSocket } from './useEnhancedSocket';

function useInteractiveTerminal() {
  const { socket } = useEnhancedSocket();

  // Join session
  const joinSession = (sessionId: string) => {
    socket?.emit('terminal:join', { sessionId });
  };

  // Listen for output
  useEffect(() => {
    if (!socket) return;

    socket.on('terminal:output', (data) => {
      appendLog({
        id: Date.now().toString(),
        body: data.text,
        timestamp: Date.now(),
        source: data.stream === 'system' ? 'system' : 'agent',
      });
    });

    socket.on('terminal:status', (data) => {
      if (data.state === 'connected') {
        setConnectionState('connected');
      } else if (data.state === 'ended') {
        setConnectionState('disconnected');
      }
    });

    socket.on('terminal:error', (data) => {
      setError(data.message);
    });

    return () => {
      socket.off('terminal:output');
      socket.off('terminal:status');
      socket.off('terminal:error');
    };
  }, [socket]);

  // Send input
  const sendInput = (sessionId: string, data: string) => {
    socket?.emit('terminal:input', { sessionId, data });
  };

  // Send signal
  const sendSignal = (sessionId: string, signal: 'interrupt' | 'terminate') => {
    socket?.emit('terminal:signal', { sessionId, signal });
  };

  // Resize
  const resize = (sessionId: string, rows: number, cols: number) => {
    socket?.emit('terminal:resize', { sessionId, rows, cols });
  };

  return {
    joinSession,
    leaveSession: (sessionId: string) => socket?.emit('terminal:leave', { sessionId }),
    sendInput,
    sendSignal,
    resize,
    connectionState,
    logs,
  };
}
```

#### B. Remove Old WebSocket Code

Delete or comment out:
- `getDevBotsInteractiveStreamUrl()` function
- Native `WebSocket` instantiation
- Manual reconnection timers
- WebSocket close/error handling

### Step 4: Update Tests

#### Backend Tests

Update tests to use Socket.IO mock instead of WebSocket mock:

```typescript
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';

describe('Terminal Handler', () => {
  let io: SocketIOServer;
  let httpServer: ReturnType<typeof createServer>;

  beforeEach(() => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer);

    terminalHandler = new SocketIOTerminalHandler({ io, docker: mockDocker });
  });

  it('should handle terminal session', async () => {
    await terminalHandler.startSession('test-session', 'container-123');
    expect(terminalHandler.getSession('test-session')).toBeDefined();
  });
});
```

#### Frontend Tests

Update to use Socket.IO client mock:

```typescript
import { io } from 'socket.io-client';

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));
```

### Step 5: Update Configuration

#### Cloudflare Tunnel

Ensure `http2Origin: false` in tunnel config:

```yaml
# ~/.cloudflared/app-monitor-config.yml
ingress:
  - hostname: app-monitor.joshwentworth.com
    service: http://localhost:80
    originRequest:
      http2Origin: false  # Required for WebSocket
```

#### Nginx

Verify WebSocket headers for `/socket.io/` path:

```nginx
location /socket.io/ {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
}
```

---

## Testing the Migration

### 1. Backend Health Check

```bash
# Start backend
cd backend && npm run dev

# Check Socket.IO connection
curl http://localhost:5000/socket.io/?EIO=4&transport=polling

# Should return: 0{"sid":"...","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}
```

### 2. Frontend Connection Test

```javascript
// In browser console
const socket = io('http://localhost:5000');

socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

socket.emit('terminal:join', { sessionId: 'test' });

socket.on('terminal:joined', (data) => {
  console.log('Joined:', data);
});
```

### 3. End-to-End Test

1. Start a dev-bot task with interactive session
2. Open interactive terminal in UI
3. Verify connection established
4. Type commands and verify output appears
5. Test reconnection (disable network, re-enable)
6. Verify multiple tabs can join same session

---

## Rollback Plan

If issues arise, rollback steps:

1. **Revert backend changes**
   ```bash
   git revert <commit-hash>
   npm install  # Reinstall ws if removed
   ```

2. **Revert frontend changes**
   ```bash
   git revert <commit-hash>
   ```

3. **Restart services**
   ```bash
   sudo systemctl restart app-monitor-backend
   ```

4. **Redeploy frontend**
   ```bash
   cd frontend && npm run build
   ```

---

## Troubleshooting

### Issue: Terminal not connecting

**Symptoms:** `terminal:joined` event not received

**Solutions:**
1. Check Socket.IO connection is established
2. Verify session exists: `terminalHandler.getSession(sessionId)`
3. Check browser console for Socket.IO errors
4. Verify API key authentication passed

### Issue: Output not appearing

**Symptoms:** Session connects but no output

**Solutions:**
1. Check PTY stream is active in backend logs
2. Verify client listening for `terminal:output` event
3. Check Socket.IO room joined: `socket.rooms.has('terminal:${sessionId}')`
4. Verify Docker container is running

### Issue: Reconnection fails

**Symptoms:** Connection drops and doesn't recover

**Solutions:**
1. Check Socket.IO reconnection config (should be automatic)
2. Verify session still exists after reconnect
3. Re-emit `terminal:join` after reconnection
4. Check backend logs for session cleanup

---

## Timeline

- **Week 1:** Backend implementation (DONE)
  - ✅ Create `SocketIOTerminalHandler`
  - ✅ Add event types
  - ✅ Write tests
  - ✅ Update documentation

- **Week 2:** Frontend migration (IN PROGRESS)
  - ⏳ Update `useInteractiveSession` hook
  - ⏳ Remove WebSocket code
  - ⏳ Update tests
  - ⏳ Test end-to-end

- **Week 3:** Production deployment
  - Deploy to staging
  - Smoke test all features
  - Deploy to production
  - Monitor for issues

- **Week 4:** Cleanup
  - Remove `ws` dependency
  - Delete old code
  - Archive migration docs

---

## Support

For issues or questions:
1. Check this migration guide
2. Review `/docs/architecture/unified-socketio-architecture.md`
3. Check backend logs: `tail -f backend/data/logs/app-monitor.log`
4. Check browser console for Socket.IO debug logs

---

## Success Criteria

Migration is complete when:
- ✅ All interactive terminal features work via Socket.IO
- ✅ No native WebSocket code remains
- ✅ Tests pass (backend + frontend)
- ✅ Production deployment successful
- ✅ No regressions in existing features
- ✅ Documentation updated
