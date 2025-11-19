# Terminal - Correct Architecture Design

**Date:** 2025-11-18
**Status:** APPROVED - Ready for Implementation
**Requirement:** Terminal sessions MUST survive disconnects

## Core Principle

**Session persistence is NOT optional.** Poor network connections should never cause lost work.

## The Right Solution: tmux + node-pty

### Why tmux?

tmux (terminal multiplexer) is THE standard solution for persistent terminal sessions:

1. **Sessions survive disconnects** - This is its primary purpose
2. **Battle-tested** - Used in production for decades
3. **Simple model** - Create session, attach, detach, reattach
4. **Already installed** - Ships with most Linux distributions
5. **Zero database needed** - tmux manages session state in memory

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend: xterm.js                             │
│  - User types in terminal                       │
│  - Displays output                              │
└─────────────────────────────────────────────────┘
                     ↕ WebSocket
┌─────────────────────────────────────────────────┐
│  Backend: Simple Terminal Service               │
│  - On connect: attach to tmux session           │
│  - On input: forward to tmux                    │
│  - On output: forward to WebSocket              │
│  - On disconnect: detach (tmux keeps running)   │
└─────────────────────────────────────────────────┘
                     ↕ node-pty
┌─────────────────────────────────────────────────┐
│  Host: tmux session                             │
│  - Runs on host machine (not Docker initially)  │
│  - Persistent across WebSocket disconnects      │
│  - bash shell inside tmux                       │
└─────────────────────────────────────────────────┘
```

### Session Lifecycle

**First Connection:**
```bash
# Backend creates or attaches to tmux session
tmux new-session -d -s "terminal-${userId}" bash
# Attach node-pty to the tmux session
pty.spawn('tmux', ['attach-session', '-t', `terminal-${userId}`])
```

**Disconnect:**
```bash
# Just close the WebSocket
# tmux session keeps running in background
```

**Reconnect:**
```bash
# Backend reattaches to existing tmux session
pty.spawn('tmux', ['attach-session', '-t', `terminal-${userId}`])
# User sees exactly where they left off
```

### Implementation Plan

#### Phase 1: Gut the Old Implementation (1-2 hours)

**Delete entirely:**
```
backend/src/services/InteractiveSessionManager.ts
backend/src/services/socketIOTerminalHandler.ts
backend/src/routes/dev-bots/interactive.routes.ts
backend/src/routes/dev-bots/interactive-terminal.routes.ts
frontend/src/components/dev-bots/interactive/InteractiveSessionTab.tsx
frontend/src/hooks/useInteractiveSession.ts
```

**Remove from database:**
```sql
DROP TABLE IF EXISTS interactive_sessions;
```

**Remove from server.ts:**
- All InteractiveSessionManager setup
- All event listeners (sessionUpdated, sessionEnded)
- SocketIOTerminalHandler initialization

**Remove from routes:**
- All /dev-bots/interactive/* endpoints

#### Phase 2: Build Simple Terminal Service (2-3 hours)

**Backend: `backend/src/services/TerminalService.ts`**

```typescript
import pty from 'node-pty';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';

interface TerminalSession {
  userId: string;
  ptyProcess: pty.IPty;
  lastActivity: number;
}

export class TerminalService {
  private sessions = new Map<string, TerminalSession>();
  private readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  constructor(private io: SocketIOServer) {
    this.setupSocketHandlers();
    this.startIdleChecker();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      const userId = this.getUserId(socket); // From auth header or session
      let session: TerminalSession | null = null;

      socket.on('terminal:connect', async ({ rows, cols }) => {
        try {
          session = await this.getOrCreateSession(userId, rows, cols);

          // Forward tmux output to client
          session.ptyProcess.onData((data) => {
            socket.emit('terminal:output', data);
          });

          // Send any buffered output
          socket.emit('terminal:ready');

          logger.info({
            category: 'terminal',
            action: 'connected',
            message: 'Terminal session connected',
            details: { userId, isNew: !this.sessions.has(userId) }
          });
        } catch (error) {
          logger.error({
            category: 'terminal',
            action: 'connect_failed',
            message: 'Failed to connect to terminal',
            error,
            details: { userId }
          });
          socket.emit('terminal:error', { message: 'Failed to connect' });
        }
      });

      socket.on('terminal:input', (data: string) => {
        if (session) {
          session.ptyProcess.write(data);
          session.lastActivity = Date.now();
        }
      });

      socket.on('terminal:resize', ({ rows, cols }) => {
        if (session) {
          session.ptyProcess.resize(cols, rows);
        }
      });

      socket.on('disconnect', () => {
        // Session stays alive! User can reconnect
        logger.info({
          category: 'terminal',
          action: 'disconnected',
          message: 'WebSocket disconnected, tmux session remains active',
          details: { userId }
        });
      });
    });
  }

  private async getOrCreateSession(
    userId: string,
    rows: number,
    cols: number
  ): Promise<TerminalSession> {
    // Check if session exists
    let session = this.sessions.get(userId);

    if (session) {
      // Reattach to existing tmux session
      logger.info({
        category: 'terminal',
        action: 'reattach',
        message: 'Reattaching to existing tmux session',
        details: { userId }
      });
      return session;
    }

    // Create new tmux session
    const tmuxSessionName = `terminal-${userId}`;

    // Try to attach to existing tmux session first
    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn('tmux', ['attach-session', '-t', tmuxSessionName], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME || '/home/jdubz',
      });

      logger.info({
        category: 'terminal',
        action: 'reattached_existing_tmux',
        message: 'Reattached to existing tmux session',
        details: { userId, tmuxSessionName }
      });
    } catch (error) {
      // Session doesn't exist, create new one
      ptyProcess = pty.spawn('tmux', ['new-session', '-s', tmuxSessionName, 'bash'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME || '/home/jdubz',
      });

      logger.info({
        category: 'terminal',
        action: 'created_new_tmux',
        message: 'Created new tmux session',
        details: { userId, tmuxSessionName }
      });
    }

    session = {
      userId,
      ptyProcess,
      lastActivity: Date.now(),
    };

    this.sessions.set(userId, session);
    return session;
  }

  private startIdleChecker(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [userId, session] of this.sessions.entries()) {
        if (now - session.lastActivity > this.IDLE_TIMEOUT_MS) {
          logger.info({
            category: 'terminal',
            action: 'idle_cleanup',
            message: 'Killing idle tmux session',
            details: { userId, idleMinutes: Math.floor(this.IDLE_TIMEOUT_MS / 60000) }
          });

          // Kill tmux session
          session.ptyProcess.kill();
          this.sessions.delete(userId);
        }
      }
    }, 60000); // Check every minute
  }

  private getUserId(socket: Socket): string {
    // Get from auth headers or use socket ID as fallback
    const userEmail = socket.handshake.headers['x-user-email'];
    return (userEmail as string) || socket.id;
  }
}
```

**Backend: Update `server.ts`**

```typescript
import { TerminalService } from './services/TerminalService.js';

// After Socket.IO setup
const terminalService = new TerminalService(io);
```

**Frontend: `frontend/src/components/Terminal.tsx`**

```typescript
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';

export function Terminal() {
  const terminalRef = useRef<Terminal>();
  const socketRef = useRef<Socket>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize xterm.js
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      fontSize: 14,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminalRef.current = terminal;

    // Connect to Socket.IO
    const socket = io('/terminal', {
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to terminal server');
      socket.emit('terminal:connect', {
        rows: terminal.rows,
        cols: terminal.cols,
      });
    });

    socket.on('terminal:ready', () => {
      console.log('Terminal ready');
    });

    socket.on('terminal:output', (data: string) => {
      terminal.write(data);
    });

    socket.on('terminal:error', ({ message }: { message: string }) => {
      terminal.write(`\r\n\x1b[31mError: ${message}\x1b[0m\r\n`);
    });

    // Send input to server
    terminal.onData((data) => {
      socket.emit('terminal:input', data);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      socket.emit('terminal:resize', {
        rows: terminal.rows,
        cols: terminal.cols,
      });
    });
    resizeObserver.observe(containerRef.current);

    // Cleanup
    return () => {
      terminal.dispose();
      socket.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
```

#### Phase 3: Add Docker Layer (Later)

Once host-based terminal works:

```typescript
// Instead of spawning tmux directly on host
pty.spawn('docker', ['exec', '-it', 'dev-container', 'tmux', 'attach-session', '-t', sessionName])

// Or use docker-compose exec
pty.spawn('docker-compose', ['exec', 'dev-terminal', 'tmux', 'attach-session', '-t', sessionName])
```

### Benefits of This Approach

1. **Session persistence** - tmux keeps sessions alive across disconnects ✅
2. **Simple** - ~200 lines total instead of 1500+ ✅
3. **No database** - tmux manages state ✅
4. **Battle-tested** - tmux is proven technology ✅
5. **Easy to debug** - Can attach manually: `tmux attach -t terminal-user@example.com` ✅
6. **Incremental** - Start with host, add Docker later ✅

### Security Considerations (For Later)

1. User isolation (one tmux session per user)
2. Command restrictions (can add via bash restricted mode)
3. Docker containerization (next phase)
4. Resource limits (tmux session limits)

## Implementation Timeline

- **Phase 1 (Delete old code):** 1-2 hours
- **Phase 2 (New implementation):** 2-3 hours
- **Testing:** 1 hour
- **Total:** 4-6 hours

## Next Steps

1. ✅ Get approval for this approach
2. Create backup branch
3. Delete old implementation
4. Implement TerminalService
5. Test reconnection scenarios
6. Deploy to staging
7. Add Docker layer (separate PR)

## Files to Create

```
backend/src/services/TerminalService.ts  (new)
frontend/src/components/Terminal.tsx      (new - replaces InteractiveSessionTab)
```

## Files to Delete

```
backend/src/services/InteractiveSessionManager.ts
backend/src/services/socketIOTerminalHandler.ts
backend/src/routes/dev-bots/interactive.routes.ts
backend/src/routes/dev-bots/interactive-terminal.routes.ts
frontend/src/components/dev-bots/interactive/InteractiveSessionTab.tsx
frontend/src/components/dev-bots/interactive/InteractiveTerminal.tsx
frontend/src/components/dev-bots/interactive/HotkeysDrawer.tsx
frontend/src/hooks/useInteractiveSession.ts
```

~1800 lines deleted, ~300 lines added = **Net reduction of 1500 lines**
