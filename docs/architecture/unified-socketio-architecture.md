# Unified Socket.IO Architecture

**Purpose:** Documentation for the consolidated real-time communication architecture using Socket.IO

**Status:** In Progress (Migration from native WebSocket)

**Date:** November 2025

---

## Overview

App-monitor uses a unified Socket.IO architecture for all real-time communication, replacing the previous mixed approach of Socket.IO and native WebSockets. This consolidation provides:

- **Single WebSocket implementation** - Easier to maintain and debug
- **Built-in resilience** - Automatic reconnection, heartbeat, polling fallback
- **Type safety** - Full TypeScript support with type-safe events
- **Better debugging** - Socket.IO dev tools and logging
- **Cloudflare Tunnel compatibility** - Works through proxies with polling fallback

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Socket.IO Client (/socket.io)                              │
│    ↓                                                         │
│    ├─ Global Events (task updates, system status)           │
│    └─ Terminal Sessions (rooms: terminal:${sessionId})      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ WebSocket (with polling fallback)
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                        Backend                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Socket.IO Server (/socket.io)                              │
│    ↓                                                         │
│    ├─ Global Event Broadcaster                              │
│    │   • DevBotsManager events                              │
│    │   • System status changes                              │
│    │   • Docker warnings/errors                             │
│    │                                                         │
│    └─ SocketIOTerminalHandler                               │
│        • Per-session rooms (terminal:${sessionId})          │
│        • PTY stream management                              │
│        • Input/output forwarding                            │
│        • Signal handling (interrupt, terminate)             │
│        • Resize support                                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Event Categories

### 1. Task Queue Events (Global Broadcast)

**Purpose:** Real-time updates for dev-bot task execution

**Events:**
```typescript
// Server → All Clients
'claude:taskAdded'              // New task created
'claude:taskAssigned'           // Task assigned to agent
'claude:taskStarted'            // Task execution started
'claude:taskCompleted'          // Task completed successfully
'claude:taskFailed'             // Task failed
'claude:systemStatusChange'     // System status updated
'claude:coordinatorHealthChange' // Coordinator health changed
'claude:dockerError'            // Docker error occurred
'claude:dockerWarning'          // Docker warning
```

### 2. Docker Container Monitoring (Per-Client)

**Purpose:** Container status monitoring for specific containers

**Events:**
```typescript
// Client → Server
'docker:startMonitor'  // Start monitoring container
'docker:stopMonitor'   // Stop monitoring container

// Server → Client
'docker:containerStatus'  // Container status update
'docker:monitorStarted'   // Monitoring started
'docker:monitorStopped'   // Monitoring stopped
'docker:monitorError'     // Monitoring error
```

### 3. Interactive Terminal (Session Rooms)

**Purpose:** Real-time terminal I/O for interactive sessions

**Architecture:**
- Uses Socket.IO rooms for session isolation
- Room name: `terminal:${sessionId}`
- Multiple clients can join same session (collaborative terminal)

**Events:**
```typescript
// Client → Server
'terminal:join'    // Join terminal session (joins room)
'terminal:leave'   // Leave terminal session
'terminal:input'   // Send input to terminal (stdin)
'terminal:signal'  // Send signal (interrupt/terminate)
'terminal:resize'  // Resize terminal (rows/cols)

// Server → Client (broadcast to room)
'terminal:joined'  // Successfully joined session
'terminal:output'  // Terminal output (stdout/system)
'terminal:status'  // Status change (connected/ended)
'terminal:error'   // Error occurred
```

---

## Type-Safe Events

All Socket.IO events are fully type-safe using TypeScript interfaces:

**Location:** `/backend/src/types/socketEvents.ts`

```typescript
export interface ClientToServerEvents {
  'terminal:join': (data: { sessionId: string }) => void;
  'terminal:input': (data: { sessionId: string; data: string }) => void;
  // ... more events
}

export interface ServerToClientEvents {
  'terminal:output': (data: {
    sessionId: string;
    stream: 'stdout' | 'stderr' | 'system';
    text: string;
    timestamp: string;
  }) => void;
  // ... more events
}
```

---

## Socket.IO Terminal Handler

**Location:** `/backend/src/services/socketIOTerminalHandler.ts`

**Responsibilities:**
1. **Session Management** - Start/stop terminal sessions
2. **PTY Streaming** - Forward Docker exec PTY streams
3. **Client Management** - Handle join/leave with Socket.IO rooms
4. **Backlog** - Maintain recent output history (configurable limit)
5. **Event Broadcasting** - Send output to all clients in session room

**Key Methods:**
```typescript
class SocketIOTerminalHandler {
  async startSession(sessionId: string, containerId: string): Promise<void>
  async stopSession(sessionId: string): Promise<void>
  getSession(sessionId: string): TerminalSession | undefined
  getAllSessions(): TerminalSession[]
}
```

---

## Configuration

### Backend (server.ts)

```typescript
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ALLOWED_CORS_HEADERS,
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],  // WebSocket preferred, polling fallback
  allowEIO3: true,
});

// Initialize terminal handler
const terminalHandler = new SocketIOTerminalHandler({
  io,
  docker,
  backlogLimit: 200,
  shellCommand: ['/bin/bash'],
});
```

### Frontend (useEnhancedSocket.ts)

```typescript
const service = createSocketService({
  url: SOCKET_URL,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
  timeout: 20000,
  autoConnect: true,
  transports: ['websocket', 'polling'],  // Try WebSocket first
  auth: {
    apiKey,
  },
});
```

---

## Migration from Native WebSocket

### Before (Mixed Architecture)
- **Socket.IO** - Task queue, system events
- **Native WebSocket (`ws`)** - Interactive terminal
- **Different paths** - `/socket.io` and `/api/dev-bots/interactive/session/*/stream`
- **Different reconnection logic** - Socket.IO auto, WebSocket manual
- **Inconsistent events** - Different naming conventions

### After (Unified Socket.IO)
- **Single implementation** - Socket.IO for everything
- **Single path** - All events through `/socket.io`
- **Unified reconnection** - Socket.IO handles all reconnection
- **Consistent events** - `category:action` naming convention
- **Type-safe** - Full TypeScript support across all events

### Breaking Changes
1. **Frontend:** Interactive terminal must use Socket.IO events instead of native WebSocket
2. **Backend:** `InteractiveSessionStreaming` replaced by `SocketIOTerminalHandler`
3. **Events:** Terminal events renamed to `terminal:*` pattern
4. **Connection:** Clients must use `terminal:join` instead of WebSocket URL

---

## Benefits

### 1. Simplified Architecture
- Single WebSocket library to maintain
- Fewer dependencies (`ws` library removed)
- Consistent event handling patterns
- ~500 lines of code removed

### 2. Better Reliability
- Built-in reconnection with exponential backoff
- Automatic heartbeat/ping-pong
- Polling fallback for restricted environments
- Connection state management

### 3. Enhanced Developer Experience
- Type-safe events with TypeScript
- Socket.IO dev tools for debugging
- Better error messages
- Consistent API surface

### 4. Production Ready
- Works through Cloudflare Tunnel (free tier)
- Handles network interruptions gracefully
- Scales with Socket.IO clustering
- Battle-tested library

---

## Cloudflare Tunnel Compatibility

### Requirements
1. **Disable HTTP/2 to origin** - Set `http2Origin: false` in tunnel config
2. **WebSocket setting** - Enable WebSockets in Cloudflare dashboard (Network tab)
3. **Nginx configuration** - Proper WebSocket upgrade headers

### Tunnel Configuration
```yaml
# ~/.cloudflared/app-monitor-config.yml
ingress:
  - hostname: app-monitor.joshwentworth.com
    service: http://localhost:80
    originRequest:
      http2Origin: false  # Critical for WebSocket support
      disableChunkedEncoding: true
      connectTimeout: 30s
      keepAliveTimeout: 90s
```

### Nginx Configuration
```nginx
# /etc/nginx/sites-available/app-monitor
location /socket.io/ {
    proxy_pass http://app_monitor_backend;
    proxy_http_version 1.1;

    # WebSocket upgrade headers
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Timeouts
    proxy_read_timeout 3600s;
    proxy_connect_timeout 75s;

    # Disable buffering
    proxy_buffering off;
}
```

---

## Testing

### Unit Tests
- **Location:** `/backend/src/services/__tests__/socketIOTerminalHandler.test.ts`
- **Coverage:** Session management, event handling, backlog, error handling

### Integration Tests
- Socket.IO connection lifecycle
- Event broadcasting to rooms
- PTY streaming integration
- Error scenarios

### E2E Tests
- Full terminal session workflow
- Multiple client connections
- Reconnection scenarios
- Network interruption recovery

---

## Troubleshooting

### Issue: WebSocket not connecting
**Symptoms:** Connection falls back to polling immediately
**Solutions:**
1. Check Cloudflare Tunnel config (`http2Origin: false`)
2. Enable WebSockets in Cloudflare dashboard
3. Verify nginx WebSocket headers
4. Check browser console for upgrade errors

### Issue: Terminal output not received
**Symptoms:** Terminal joins but no output
**Solutions:**
1. Verify session exists: `terminalHandler.getSession(sessionId)`
2. Check PTY stream is active
3. Verify client joined room: `socket.rooms.has('terminal:${sessionId}')`
4. Check for Docker exec errors in logs

### Issue: Multiple clients not seeing same output
**Symptoms:** One client sees output, others don't
**Solutions:**
1. Verify all clients joined the room via `terminal:join`
2. Check Socket.IO room broadcasting
3. Verify session ID matches across clients

---

## Future Enhancements

1. **Collaborative Features**
   - Multi-user terminal sessions
   - User cursors and presence
   - Session recording/replay

2. **Performance Optimization**
   - Binary transport for terminal data
   - Compression for large outputs
   - Adaptive backlog sizing

3. **Advanced Features**
   - Terminal tabs/splits
   - File transfer over Socket.IO
   - Session persistence/resume

---

## References

- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [Cloudflare Tunnel WebSocket Support](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/configuration/local-management/ingress/#websocket)
- [TypeScript Socket.IO Types](https://socket.io/docs/v4/typescript/)
- [Interactive Terminal Design](/docs/technicalDesigns/interactive-terminal-reset.md)
