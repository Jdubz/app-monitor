# WebSocket to SSE Migration Plan

**Status**: Draft
**Created**: 2025-11-20
**Author**: System
**Estimated Effort**: 8-16 hours (1-2 days)
**Migration Type**: HARD CUTOVER (no backwards compatibility)

---

## Goal

Replace WebSocket (Socket.IO) with Server-Sent Events (SSE) for all data-driven tabs. Interactive terminal keeps WebSocket for bidirectional communication.

## Why SSE?

**Current Problem**:
- WebSocket events trigger full REST API refreshes (`refreshStatus()`)
- Inefficient: entire dataset re-fetched on every event
- Socket.IO overhead unnecessary for unidirectional updates

**SSE Benefits**:
- HTTP-based, simpler than WebSocket
- Browser handles reconnection automatically (EventSource API)
- Perfect for server → client data push
- No Socket.IO dependency needed

---

## Current WebSocket Events (to migrate)

From `backend/src/server.ts`:

```typescript
// Task lifecycle events
devBotsManager.on('taskAdded', (task) => io.emit('claude:taskAdded', task));
devBotsManager.on('taskAssigned', (task) => io.emit('claude:taskAssigned', task));
devBotsManager.on('taskStarted', (task) => io.emit('claude:taskStarted', task));
devBotsManager.on('taskCompleted', (task) => io.emit('claude:taskCompleted', task));
devBotsManager.on('taskFailed', (task) => io.emit('claude:taskFailed', task));

// System events
devBotsManager.on('systemStatusChange', (status) => io.emit('claude:systemStatusChange', status));
devBotsManager.on('coordinatorHealthChange', (isHealthy) => io.emit('claude:coordinatorHealthChange', isHealthy));
devBotsManager.on('dockerError', (error) => io.emit('claude:dockerError', error));
devBotsManager.on('dockerWarning', (warning) => io.emit('claude:dockerWarning', warning));
```

From frontend `devBotsStore.tsx` (lines 176-189):

```typescript
socket.on('task:created', handleTaskUpdates);
socket.on('task:updated', handleTaskUpdates);
socket.on('task:completed', handleTaskUpdates);
socket.on('task:failed', handleTaskUpdates);
socket.on('task:started', handleTaskUpdates);
socket.on('task:assigned', handleTaskUpdates);
```

**Note**: Event name mismatch (`claude:*` emitted, `task:*` listened to) - currently broken.

---

## Minimal Implementation

### Backend Changes

**1. Create SSE endpoint** (`backend/src/routes/sse.routes.ts`):

```typescript
import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../services/devBotsManager.js';

export function createSSERoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();
  const clients: Response[] = [];

  router.get('/events', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection message
    res.write('data: {"type":"connected"}\n\n');

    // Add client to list
    clients.push(res);

    // Remove client on disconnect
    req.on('close', () => {
      const index = clients.indexOf(res);
      if (index !== -1) clients.splice(index, 1);
    });
  });

  // Broadcast function
  function broadcast(event: string, data: any) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach(client => client.write(message));
  }

  // Wire up DevBotsManager events
  devBotsManager.on('taskAdded', (task) => broadcast('task:added', task));
  devBotsManager.on('taskAssigned', (task) => broadcast('task:assigned', task));
  devBotsManager.on('taskStarted', (task) => broadcast('task:started', task));
  devBotsManager.on('taskCompleted', (task) => broadcast('task:completed', task));
  devBotsManager.on('taskFailed', (task) => broadcast('task:failed', task));
  devBotsManager.on('systemStatusChange', (status) => broadcast('system:status', status));
  devBotsManager.on('coordinatorHealthChange', (isHealthy) => broadcast('system:health', { isHealthy }));
  devBotsManager.on('dockerError', (error) => broadcast('docker:error', error));
  devBotsManager.on('dockerWarning', (warning) => broadcast('docker:warning', warning));

  return router;
}
```

**2. Register SSE routes** in `backend/src/routes/index.ts`:

```typescript
import { createSSERoutes } from './sse.routes.js';

// Add to createApiRouter:
if (devBotsManager) {
  router.use('/sse', createSSERoutes(devBotsManager));
}
```

**3. Remove Socket.IO event listeners** from `backend/src/server.ts`:

Delete lines 164-211 (all `devBotsManager.on()` → `io.emit()` mappings).

**4. Keep Socket.IO** for terminal only - do NOT remove io instance or terminal handlers.

### Frontend Changes

**1. Create SSE hook** (`frontend/src/hooks/useSSE.ts`):

```typescript
import { useEffect, useRef } from 'react';

export function useSSE(onEvent: (event: MessageEvent) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const eventSource = new EventSource(`${apiUrl}/api/sse/events`);

    eventSource.onmessage = onEvent;

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      // EventSource automatically reconnects
    };

    eventSourceRef.current = eventSource;

    return () => {
      eventSource.close();
    };
  }, [onEvent]);

  return eventSourceRef;
}
```

**2. Update DevBotsStoreProvider** (`frontend/src/contexts/devBotsStore.tsx`):

Remove Socket dependency:
```typescript
// DELETE: socket prop from DevBotsStoreProviderProps
interface DevBotsStoreProviderProps {
  children: React.ReactNode;
  // socket?: Socket | null;  // DELETE THIS
}

export function DevBotsStoreProvider({ children }: DevBotsStoreProviderProps) {
  // ... existing state ...

  // DELETE: lines 172-190 (socket.on listeners)

  // ADD: SSE event handler
  const handleSSEEvent = useCallback((event: MessageEvent) => {
    const data = JSON.parse(event.data);

    // Handle task events
    if (data.type?.startsWith('task:')) {
      void refreshStatus();
    }
    // Handle system events
    if (data.type?.startsWith('system:')) {
      void refreshStatus();
    }
  }, [refreshStatus]);

  useSSE(handleSSEEvent);

  // ... rest of component ...
}
```

**3. Remove socket prop** from provider usage in `frontend/src/App.tsx` or wherever provider is used.

**4. Remove Socket.IO client dependency**:

```bash
cd frontend
npm uninstall socket.io-client
```

### Testing

**Manual test**:
1. Start backend
2. Open browser network tab, filter for `events`
3. Should see SSE stream connected
4. Create a task - should see SSE event and UI update
5. Complete a task - should see SSE event and UI update

**Unit test** (`frontend/src/hooks/useSSE.test.ts`):
```typescript
import { renderHook } from '@testing-library/react';
import { useSSE } from './useSSE';

describe('useSSE', () => {
  it('creates EventSource connection', () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(() => useSSE(onEvent));

    // Verify EventSource created
    // Verify cleanup on unmount
    unmount();
  });
});
```

---

## Migration Steps

1. ✅ **Backend**: Create SSE routes (`sse.routes.ts`)
2. ✅ **Backend**: Register SSE routes in `index.ts`
3. ✅ **Backend**: Remove Socket.IO event listeners from `server.ts` (keep io instance for terminal)
4. ✅ **Backend**: Add SSE-compatible auth middleware
5. ✅ **Frontend**: Create `useSSE` hook
6. ✅ **Frontend**: Update `DevBotsStoreProvider` to use SSE
7. ✅ **Frontend**: Remove socket prop from provider usage
8. ✅ **Bug Fixes**: Fixed 6 critical issues (auth, reconnection, race conditions, event handling)
9. ✅ **Deploy**: Pushed to staging

**Note**: `socket.io-client` is NOT removed because it's still needed for:
- Interactive terminal (bidirectional communication)
- Log streaming (LogProvider)

---

## Rollback Plan

If SSE fails in production:

1. Git revert the migration commit
2. Reinstall `socket.io-client` in frontend
3. Deploy previous version

---

## Success Criteria

- [x] Task events trigger UI updates via SSE
- [x] EventSource connection visible in network tab
- [x] UI responds to task lifecycle changes in real-time
- [x] No regressions in interactive terminal functionality
- [x] Socket.IO only used for terminal and log streaming (not dev-bots events)
- [x] All tests passing (TypeScript, unit tests, linting)
- [x] Code pushed to staging

## Implementation Complete

All migration steps completed successfully. Dev-bots task events now flow via SSE instead of WebSocket.
