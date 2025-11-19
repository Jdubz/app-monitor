# Socket.IO Terminal Integration - Next Steps

**Status:** Server integration complete, API wiring pending

**Date:** November 2025

---

## Current State

### ✅ Completed

1. **SocketIOTerminalHandler Implementation**
   - Location: `backend/src/services/socketIOTerminalHandler.ts`
   - Full test coverage: `backend/src/services/__tests__/socketIOTerminalHandler.test.ts`
   - Event types defined: `backend/src/types/socketEvents.ts`

2. **Server Integration**
   - Handler initialized in `backend/src/server.ts:198`
   - Exported for API access: `server.ts:29`
   - Configured with Docker instance, Socket.IO server, 200 message backlog

3. **Documentation**
   - Architecture: `docs/architecture/unified-socketio-architecture.md`
   - Migration guide: `docs/MIGRATION_SOCKETIO.md`

### ⏳ Pending

The handler is initialized but **not yet connected** to the session lifecycle. Sessions are created via REST API, but the terminal handler isn't notified to start PTY streaming.

---

## Next Implementation Steps

### Step 1: Wire Terminal Handler into Session Lifecycle

The terminal handler needs to be called when interactive terminal sessions are created/destroyed.

**Current Flow:**
```
REST API → InteractiveTerminalService.startSession() → Container created
                                                     → (handler not notified)
```

**Target Flow:**
```
REST API → InteractiveTerminalService.startSession() → Container created
                                                     → terminalHandler.startSession(sessionId, containerId)
```

**Implementation Options:**

#### Option A: Update InteractiveTerminalService (Recommended)

Modify `backend/src/services/interactiveTerminal.service.ts` to call terminal handler:

```typescript
import { terminalHandler } from '../server.js';

export class InteractiveTerminalService {
  async startSession(options: StartSessionOptions): Promise<StartSessionResult> {
    // ... existing container creation code ...

    // Start Socket.IO terminal streaming
    if (terminalHandler) {
      await terminalHandler.startSession(sessionId, containerId);
    }

    return result;
  }

  async stopSession(sessionId: string, reason?: string): Promise<void> {
    // ... existing cleanup code ...

    // Stop Socket.IO terminal streaming
    if (terminalHandler) {
      await terminalHandler.stopSession(sessionId);
    }
  }
}
```

**Pros:**
- Clean separation of concerns
- Terminal streaming independent of container lifecycle
- Easy to test

**Cons:**
- Circular dependency (service imports from server.ts)
- Could use dependency injection instead

#### Option B: Event-Based Integration

Use EventEmitter pattern to decouple:

```typescript
// In interactiveTerminal.service.ts
this.emit('session:started', { sessionId, containerId });
this.emit('session:stopped', { sessionId });

// In server.ts
terminalService.on('session:started', async ({ sessionId, containerId }) => {
  await terminalHandler.startSession(sessionId, containerId);
});

terminalService.on('session:stopped', async ({ sessionId }) => {
  await terminalHandler.stopSession(sessionId);
});
```

**Pros:**
- No circular dependencies
- Follows existing event patterns in codebase
- Loosely coupled

**Cons:**
- More indirection
- Event listeners need to be set up in server initialization

#### Option C: Pass Handler as Dependency

Inject handler into service via constructor:

```typescript
export class InteractiveTerminalService {
  constructor(
    private readonly db: DevBotsDatabase,
    private readonly workerService: EphemeralWorkerService,
    private readonly terminalHandler?: SocketIOTerminalHandler
  ) {}
}
```

**Pros:**
- Proper dependency injection
- No circular dependencies
- Testable with mocks

**Cons:**
- Requires factory/initialization changes
- Handler is optional (created after service in current setup)

### Step 2: Frontend Migration

Update `frontend/src/hooks/useInteractiveSession.ts` to use Socket.IO instead of native WebSocket:

```typescript
// Before (Native WebSocket)
const ws = new WebSocket(streamUrl);
ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  // Handle message
});

// After (Socket.IO)
const { socket } = useEnhancedSocket();
socket?.emit('terminal:join', { sessionId });
socket?.on('terminal:output', (data) => {
  // Handle output
});
```

**Files to update:**
- `frontend/src/hooks/useInteractiveSession.ts`
- Remove `getDevBotsInteractiveStreamUrl()` utility
- Update tests in `frontend/src/hooks/useInteractiveSession.test.tsx`

### Step 3: Remove Legacy WebSocket Code

Once Socket.IO integration is working:

1. Delete `backend/src/services/InteractiveSessionStreaming.ts`
2. Remove from `devBotsManager.factory.ts`
3. Uninstall `ws` and `@types/ws` packages
4. Clean up ~500 lines of legacy code

### Step 4: End-to-End Testing

Test complete workflow:

1. Start interactive session via REST API
2. Frontend joins via Socket.IO (`terminal:join`)
3. Verify backlog is sent to client
4. Type commands and verify output appears
5. Test reconnection (disconnect network, reconnect)
6. Verify multiple clients can join same session
7. Test through Cloudflare Tunnel with WebSocket upgrades

---

## Recommended Approach

**Use Option B (Event-Based)** for cleanest architecture:

1. Add events to `InteractiveTerminalService`:
   ```typescript
   this.emit('session:started', { sessionId, containerId });
   this.emit('session:stopped', { sessionId });
   ```

2. Wire up in `server.ts` after both services are initialized:
   ```typescript
   if (terminalService && terminalHandler) {
     terminalService.on('session:started', async ({ sessionId, containerId }) => {
       await terminalHandler.startSession(sessionId, containerId);
     });

     terminalService.on('session:stopped', async ({ sessionId }) => {
       await terminalHandler.stopSession(sessionId);
     });
   }
   ```

3. This maintains separation of concerns and follows existing event patterns in the codebase (DevBotsManager already uses EventEmitter extensively).

---

## Testing Strategy

### Unit Tests
- Mock terminal handler in `InteractiveTerminalService` tests
- Verify events are emitted correctly
- Test error handling when handler fails

### Integration Tests
- Verify full session lifecycle with real Socket.IO server
- Test PTY stream → Socket.IO broadcast
- Test backlog delivery to new clients

### E2E Tests
- Complete user workflow through UI
- Network interruption/reconnection scenarios
- Multi-client collaboration

---

## Success Criteria

- ✅ Sessions started via REST API automatically start Socket.IO streaming
- ✅ Frontend receives terminal output via Socket.IO
- ✅ Input from frontend is forwarded to container
- ✅ Backlog is sent to late-joining clients
- ✅ Multiple clients can join same session
- ✅ Works through Cloudflare Tunnel
- ✅ All tests passing
- ✅ Native WebSocket code removed

---

## Notes

- The REST API endpoints do NOT need to change (they just manage container lifecycle)
- Socket.IO terminal handler is already listening for `terminal:*` events
- The missing link is notifying the handler when sessions are created
- Once wired up, the unified architecture will be complete
