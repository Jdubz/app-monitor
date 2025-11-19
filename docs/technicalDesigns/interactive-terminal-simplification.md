# Interactive Terminal Design

**Purpose:** Document the architectural decision to use tmux-based terminal sessions instead of database-backed session management.

**Decision Date:** 2025-11-18

---

## Problem Statement

The original interactive terminal implementation had excessive complexity:

1. **Session lifecycle management** - Complex state machine (pending → running → ended)
2. **Dynamic container orchestration** - Containers spin up/down per session
3. **Database persistence** - Session records that could become orphaned
4. **Event coordination** - Multiple event emitters across services
5. **REST API + Socket.IO** - Two different communication mechanisms

**Core Issue:** Over-engineering for what should be a simple terminal interface.

---

## Architecture Decision

**Chosen Solution:** tmux-based sessions with Socket.IO events

### Why tmux?

1. **Built-in persistence** - Sessions survive disconnects automatically
2. **Battle-tested** - Industry standard for session management
3. **Simple** - No custom state management needed
4. **Reattachable** - Multiple clients can connect to same session

### Why Socket.IO only?

1. **Single protocol** - Removes REST API complexity
2. **Real-time** - Terminal I/O requires bidirectional streaming
3. **Reconnection** - Built-in automatic reconnection
4. **Type-safe** - Full TypeScript event definitions

---

## Implementation Constraints

### Required Components

**Backend:**
- `TerminalService` - Session creation, attachment, lifecycle
- Socket.IO event handlers for `terminal:*` events
- `node-pty` integration with tmux

**Frontend:**
- xterm.js terminal component
- Socket.IO client with event handlers
- Auto-reconnect on disconnect

### Event Protocol

```typescript
// Client → Server
'terminal:create'  // Create new tmux session
'terminal:attach'  // Attach to existing tmux session
'terminal:input'   // Send input to terminal (stdin)
'terminal:resize'  // Resize terminal (rows/cols)

// Server → Client
'terminal:created' // Session created successfully
'terminal:attached'// Attached to session
'terminal:output'  // Terminal output (stdout)
'terminal:closed'  // Terminal session ended
'terminal:error'   // Error occurred
```

### Non-Negotiables

1. **No database persistence** - tmux manages all session state
2. **No REST API** - All communication via Socket.IO
3. **No container-per-session** - Terminal runs on host or shared container
4. **Session ID sanitization** - Prevent command injection via tmux session names
5. **Idle timeout** - Sessions auto-terminate after 1 hour idle

---

## Trade-offs

### What We Gain

- **Simplicity:** Single service instead of 5
- **Reliability:** tmux handles session persistence
- **Performance:** No database I/O for session state
- **Maintainability:** ~4,700 fewer lines of code

### What We Lose

- **Session history:** No database records (use tmux logs if needed)
- **Cross-server sessions:** tmux is local to server (acceptable for now)
- **Fine-grained control:** Rely on tmux's session management

### Acceptable Limitations

- Sessions don't survive server reboots (acceptable - this is a dev tool)
- Single-server only (can add Redis-backed session store later if needed)
- No session analytics (not needed for MVP)

---

## Security Considerations

1. **Command injection prevention** - Session IDs sanitized with whitelist regex
2. **Authentication** - Socket.IO connection requires auth token
3. **Session isolation** - Each user gets separate tmux sessions
4. **Tmux availability check** - Verify tmux installed before creating sessions

---

## Migration Strategy

**Removed:**
- `InteractiveSessionManager` (5 services, ~1,800 lines)
- `interactive_sessions` database table (migration 028)
- REST API endpoints (`/api/dev-bots/interactive/*`)
- WebSocket-based terminal handler

**Replaced with:**
- `TerminalService` (~350 lines)
- Socket.IO events (`terminal:*`)
- tmux session management

---

## References

- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [node-pty](https://github.com/microsoft/node-pty)
- [tmux Manual](https://man7.org/linux/man-pages/man1/tmux.1.html)
- [xterm.js](https://github.com/xtermjs/xterm.js)
- [Unified Socket.IO Architecture](/docs/architecture/unified-socketio-architecture.md)
