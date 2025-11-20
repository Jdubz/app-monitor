# Admin Bot Chat Interface Implementation Plan

**Date:** 2025-11-20
**Status:** ✅ COMPLETED - This is a historical planning document
**Purpose:** Replace tmux-based terminal with a clean AI conversation interface for admin bot interactions

> **NOTE:** This implementation has been completed. For current implementation details, see the code:
> - Backend: `backend/src/services/AdminBotService.ts` - Core service implementation
> - Backend: `backend/src/routes/admin-bot/chat.routes.ts` - API routes
> - Frontend: `frontend/src/components/admin-bot/AdminBotChat.tsx` - Chat UI component
> - Frontend: `frontend/src/hooks/useAdminBotSSE.ts` - SSE connection hook

## Code Review Comments Addressed

During PR #289 review, AI code reviewers (Gemini Code Assist, Copilot) identified several potential issues in the proposed code snippets. These concerns were evaluated and addressed in the actual implementation:

### ✅ SSE Race Condition (Lines 408-432)
**Concern:** Clients connecting to `/stream` after session start would miss previous events.
**Resolution:** Implemented session status check on frontend mount (`AdminBotChat.tsx:58-88`) to reconnect to existing sessions. Single-user system design means no message history replay needed.

### ✅ Missing Process Error Handling (Lines 298-328)
**Concern:** No error handler for spawn failures (e.g., codex not installed).
**Resolution:** Added comprehensive error handling in `AdminBotService.ts` including spawn error detection and graceful error reporting via SSE.

### ✅ stdin Backpressure Handling (Line 350)
**Concern:** `stdin.write()` return value ignored, could lose messages if buffer full.
**Resolution:** Implemented proper backpressure handling with drain event waiting and 5-second timeout (`AdminBotService.ts:197-220`).

### ❌ npm ci Command "Incorrect" - Reviewer Error
**Concern:** Reviewer claimed `npm ci --omit=dev --workspaces=false` is incorrect.
**Reality Check:** This command is CORRECT and matches production deployment exactly (`scripts/production/deploy.sh:268`). TypeScript and @types/* are intentionally in dependencies (not devDependencies) to support this pattern. No changes needed.

**Implementation:** See code references above for actual implementation details.

---

## Executive Summary

**What:** Replace tmux-based terminal (Attempt 2) with clean AI chat interface using assistant-ui library and SSE streaming.

**Why:** Terminal has render flashing, line alignment issues, and is the wrong abstraction for AI conversations.

**How:**
- **Phase 0:** Delete all legacy code (TerminalService, InteractiveSessionManager, tests)
- **Phase 1:** Implement AdminBotService + SSE routes for Codex CLI
- **Phase 2:** Build chat UI with assistant-ui library
- **Phase 3:** Comprehensive testing (unit, integration, e2e)
- **Phase 4:** Polish and documentation

**Timeline:** 3 weeks total (2 days cleanup + 3 weeks implementation)

**Key Technologies:**
- Backend: AdminBotService (spawns Codex CLI), SSE for streaming
- Frontend: assistant-ui (400k+ downloads/month), EventSource for SSE
- MCP Integration: Pre-configured connection to App Monitor MCP server
- No database, no Socket.IO events (SSE only), Codex CLI only

---

## Migration Strategy: HARD CUTOVER

**CRITICAL:** This is a **complete replacement**, NOT a backwards-compatible migration.

✅ **Actions:**
- Remove ALL terminal-related code (TerminalService, Terminal.tsx, etc.)
- Remove ALL interactive session code (InteractiveSessionManager, routes, etc.)
- Delete all deprecated tests (e2e/tests/interactive-terminal.spec.ts)
- Clean cutover with NO legacy code remaining

❌ **NOT doing:**
- Maintaining backwards compatibility
- Supporting both systems during transition
- Gradual migration or feature flags

**Code Deletion Summary:**
- Backend: 3 files (~1,000 lines)
- Frontend: 2 files (~200 lines)
- Tests: 1 file (~300 lines)
- Docs: 2 files
- **Total: ~1,500 lines deleted**

---

## Context & Problem Statement

### Previous Implementation Attempts

1. **Attempt 1: Specialized Dev-Bot Connection**
   - Tried using a dedicated dev-bot instance for admin tasks
   - **Result:** Overly complex and unmaintainable
   - **Status:** Abandoned

2. **Attempt 2: tmux-based Terminal (Current)**
   - Implemented terminal using tmux + xterm.js + Socket.IO
   - **Problems:**
     - Render flashing and strange line alignment issues
     - CLI tools have display limitations over web connections
     - Not suitable for AI conversation UX
     - Unusable in current state
   - **Status:** Needs replacement

### Core Requirements

**The admin bot is designed for:**
- Planning and troubleshooting tasks
- Running on the server's host machine
- Integration with MCP server (once implemented)
- Conversation-based workflow (not terminal commands)

**Reference Documents:**
- MCP Server Design: `docs/technicalDesigns/app-monitor-mcp-server.md`
- Planning System: `docs/technicalDesigns/multi-phase-plan-system.md`
- Planning Status: `INTEGRATED_PLANNING_SYSTEM_STATUS.md`

---

## Design Principles

### MINIMAL Implementation

This implementation MUST be **MINIMAL**. Focus ONLY on core requirements:

✅ **Include:**
- AI conversation interface that renders nicely
- Input field for user messages
- SSE streaming for AI responses
- Start/exit commands for CLI session
- **Codex CLI** integration ONLY (expand to other tools later)

❌ **Exclude (No Nice-to-Haves):**
- Dashboards or metrics tracking
- Database columns for session analytics
- Custom markdown renderers (use existing libraries)
- Multiple AI provider support (Codex only)
- Session history UI
- Complex state management

---

## Research Findings

### Admin Bot Role & MCP Server Integration

The admin bot is referenced as an **"Admin Bot (Interactive)"** agent in the MCP server architecture (app-monitor-mcp-server.md). Key points:

#### Purpose & Capabilities
1. **Role:** AI agent for system management, planning, and troubleshooting
2. **Access:** Connects to App Monitor MCP server via JSON-RPC over stdio
3. **Permissions:** Admin-level access (can execute admin-only MCP tools)
4. **Available Tools (24 total):**
   - Plan Management: 11 tools (create, update, validate, save, list, etc.)
   - Task Operations: 6 tools (create, list, get, unblock, cancel, report)
   - Dev-Bot Control: 4 tools (list, status, recover, heartbeat check)
   - PR Evaluation: 2 tools (trigger evaluation, get blocking issues)
   - System Diagnostics: 1 tool (comprehensive system_health)

#### Current MCP Server Status
- **Implementation:** ✅ **ALREADY IMPLEMENTED** in `backend/src/mcp/server.ts`
- **Tools:** Core tools implemented (tasks, bots, PRs, system health)
- **Transport:** stdio (JSON-RPC over stdin/stdout)
- **Auth:** Role-based via `APP_MONITOR_MCP_USER_ROLE` environment variable
- **Plan Tools:** DEFERRED until planning system is stable (Nov 20, 2025 scope update)

#### Integration Architecture

```
Codex CLI (Admin Bot)
  ↓ reads config.toml
  ↓ spawns MCP server subprocess
  ↓
App Monitor MCP Server (stdio)
  ↓ uses
Backend Services (DevBotsManager, Database)
  ↓ executes
System Operations (tasks, bots, PRs, diagnostics)
```

The admin bot Codex session will be **pre-configured** to automatically connect to the MCP server.

### Existing AI Chat Libraries

Research identified three excellent options:

#### 1. assistant-ui ⭐ RECOMMENDED
- **Package:** `@assistant-ui/react`
- **Stars:** 400k+ monthly downloads
- **Features:**
  - Composable primitives (message list, input, thread, toolbar)
  - Production-ready: streaming, auto-scroll, retries, markdown, code highlighting
  - Keyboard shortcuts and accessibility built-in
  - Works with AI SDK, custom backends
  - Full TypeScript support
- **Setup:** `npx assistant-ui init` (existing project)
- **Why:** Most mature, actively maintained, designed for exactly this use case

#### 2. shadcn/ui AI Elements
- Copy-paste React components
- Integrates with Vercel AI SDK
- Maximum flexibility
- **Why:** Good if we want complete control, but more maintenance

#### 3. @llamaindex/chat-ui
- Pre-built chat components
- Minimal styling, Tailwind CSS customizable
- **Why:** Lightweight but less feature-complete than assistant-ui

### SSE Implementation Pattern

Based on research, the standard pattern for AI chat with SSE is:

```typescript
// Custom hook for SSE connection
function useSSE(endpoint: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const eventSource = new EventSource(endpoint);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Append streaming chunks to current message
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [endpoint]);

  return messages;
}
```

---

## Proposed Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (React)                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Chat Interface (assistant-ui)                    │  │
│  │  - Message list with streaming                    │  │
│  │  - Input field                                     │  │
│  │  - Auto-scroll, markdown rendering                │  │
│  └─────────────────┬───────────────────────────────┬─┘  │
│                    │ POST /messages                 │    │
│                    │ GET /messages/stream (SSE)     │    │
└────────────────────┼───────────────────────────────┼────┘
                     │                                │
┌────────────────────▼────────────────────────────────▼───┐
│                  Backend (Express)                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Admin Bot Chat Routes                            │  │
│  │  - POST /api/admin-bot/chat/start                 │  │
│  │  - POST /api/admin-bot/chat/message               │  │
│  │  - GET /api/admin-bot/chat/stream (SSE)           │  │
│  │  - POST /api/admin-bot/chat/stop                  │  │
│  └─────────────────┬─────────────────────────────────┘  │
│                    │                                     │
│  ┌─────────────────▼─────────────────────────────────┐  │
│  │  Admin Bot Service                                │  │
│  │  - Manages Codex CLI subprocess                   │  │
│  │  - Streams responses via SSE                      │  │
│  │  - Handles session lifecycle                      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │ spawn + stdio
                      ▼
            ┌──────────────────┐
            │   Codex CLI      │
            │  (Local Agent)   │
            └──────────────────┘
```

### Backend Implementation

#### Admin Bot Service (New)

```typescript
// backend/src/services/AdminBotService.ts

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export interface AdminBotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AdminBotSession {
  id: string;
  process: ChildProcess | null;
  status: 'idle' | 'running' | 'error';
  messages: AdminBotMessage[];
  startedAt: Date;
}

export class AdminBotService extends EventEmitter {
  private session: AdminBotSession | null = null;

  /**
   * Start a new admin bot session with Codex CLI
   */
  async startSession(): Promise<string> {
    if (this.session?.status === 'running') {
      throw new Error('Session already running');
    }

    const sessionId = randomUUID();

    // Spawn Codex CLI process
    const process = spawn('codex', ['chat'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Add any necessary env vars
      }
    });

    this.session = {
      id: sessionId,
      process,
      status: 'running',
      messages: [],
      startedAt: new Date()
    };

    // Set up output streaming
    process.stdout?.on('data', (data) => {
      this.emit('output', data.toString());
    });

    process.stderr?.on('data', (data) => {
      logger.error({ category: 'admin_bot', error: data.toString() });
    });

    process.on('exit', (code) => {
      this.emit('exit', code);
      if (this.session) {
        this.session.status = 'idle';
      }
    });

    return sessionId;
  }

  /**
   * Send a message to the admin bot
   */
  async sendMessage(message: string): Promise<void> {
    if (!this.session?.process) {
      throw new Error('No active session');
    }

    // Add user message to history
    this.session.messages.push({
      id: randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Send to Codex CLI stdin
    this.session.process.stdin?.write(message + '\n');
  }

  /**
   * Stop the current session
   */
  async stopSession(): Promise<void> {
    if (!this.session?.process) {
      return;
    }

    this.session.process.kill('SIGTERM');
    this.session = null;
  }

  /**
   * Get current session
   */
  getSession(): AdminBotSession | null {
    return this.session;
  }
}
```

#### API Routes (New)

```typescript
// backend/src/routes/admin-bot/chat.routes.ts

import { Router } from 'express';
import type { AdminBotService } from '../../services/AdminBotService.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';

export function createAdminBotChatRoutes(adminBotService: AdminBotService): Router {
  const router = Router();

  // Start a new chat session
  router.post('/start', async (req, res) => {
    try {
      const sessionId = await adminBotService.startSession();
      sendSuccess(res, { sessionId });
    } catch (error) {
      sendError(res, 'failed_to_start_session', 500, error);
    }
  });

  // Send a message
  router.post('/message', async (req, res) => {
    try {
      const { message } = req.body;
      await adminBotService.sendMessage(message);
      sendSuccess(res, { received: true });
    } catch (error) {
      sendError(res, 'failed_to_send_message', 500, error);
    }
  });

  // Stream responses via SSE
  router.get('/stream', (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream output from admin bot
    const outputHandler = (data: string) => {
      res.write(`data: ${JSON.stringify({ type: 'output', content: data })}\n\n`);
    };

    const exitHandler = (code: number) => {
      res.write(`data: ${JSON.stringify({ type: 'exit', code })}\n\n`);
      res.end();
    };

    adminBotService.on('output', outputHandler);
    adminBotService.on('exit', exitHandler);

    // Clean up on client disconnect
    req.on('close', () => {
      adminBotService.off('output', outputHandler);
      adminBotService.off('exit', exitHandler);
    });
  });

  // Stop session
  router.post('/stop', async (req, res) => {
    try {
      await adminBotService.stopSession();
      sendSuccess(res, { stopped: true });
    } catch (error) {
      sendError(res, 'failed_to_stop_session', 500, error);
    }
  });

  return router;
}
```

### Frontend Implementation

#### Using assistant-ui

```typescript
// frontend/src/components/admin-bot/AdminBotChat.tsx

import { useEffect, useState } from 'react';
import { Thread } from '@assistant-ui/react';
import { useSSE } from '@/hooks/useSSE';

export function AdminBotChat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Start session on mount
  useEffect(() => {
    fetch('/api/admin-bot/chat/start', { method: 'POST' })
      .then(res => res.json())
      .then(data => setSessionId(data.sessionId));

    return () => {
      fetch('/api/admin-bot/chat/stop', { method: 'POST' });
    };
  }, []);

  // Stream responses via SSE
  useSSE('/api/admin-bot/chat/stream', (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'output') {
      // Append to current assistant message
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + data.content }
          ];
        } else {
          return [...prev, { role: 'assistant', content: data.content }];
        }
      });
    }
  });

  const handleSendMessage = async (message: string) => {
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: message }]);

    // Send to backend
    await fetch('/api/admin-bot/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
  };

  return (
    <div className="h-full">
      <Thread
        messages={messages}
        onSendMessage={handleSendMessage}
        // assistant-ui handles rendering, streaming, auto-scroll
      />
    </div>
  );
}
```

---

## Integration with Existing Features

### DO NOT Duplicate These Services

The new chat interface will **reuse existing infrastructure**:

1. **Socket.IO Server** (`backend/src/server.ts`)
   - Already configured and running
   - Use existing `io` instance passed to services
   - DO NOT create a new Socket.IO server

2. **API Response Utilities** (`backend/src/utils/apiResponse.ts`)
   - Use `sendSuccess()` and `sendError()` helpers
   - DO NOT create custom response formatters

3. **Logger** (`backend/src/utils/logger.js`)
   - Use existing logger with `category: 'admin_bot_chat'`
   - DO NOT create custom logging

4. **Frontend API Client** (`frontend/src/services/api.ts`)
   - Use existing `api` instance for REST calls
   - DO NOT create custom fetch wrappers

5. **Frontend Socket Hook** (if exists)
   - Check for existing Socket.IO hooks before creating new ones
   - Reuse socket connection from monitor shell

### Files to REMOVE (Complete Deletion)

**Backend:**
- `backend/src/services/TerminalService.ts`
- `backend/src/services/InteractiveSessionManager.ts`
- `backend/src/routes/dev-bots/interactive.routes.ts` (stub file)

**Frontend:**
- `frontend/src/components/dev-bots/Terminal.tsx`
- `frontend/src/components/monitor/tabs/InteractiveTerminalTabContent.tsx`

**Tests:**
- `e2e/tests/interactive-terminal.spec.ts`
- Any TerminalService unit tests
- Any InteractiveSessionManager references in test mocks

**Documentation:**
- `docs/technicalDesigns/terminal-correct-architecture.md`

### Integration Points

**Backend Route Registration** (`backend/src/routes/dev-bots/index.ts`):
```typescript
// REMOVE this line (line 67):
router.use('/', createInteractiveRoutes(devBotsManager));

// REPLACE with:
router.use('/', createAdminBotChatRoutes(adminBotService));
```

**Frontend Tab Content** (Update existing tab):
```typescript
// Replace InteractiveTerminalTabContent with AdminBotChat
// Keep same route: /monitor/interactive
```

---

## Implementation Phases

### Phase 0: Cleanup Legacy Code (2 days)

**Goal:** Remove all terminal and interactive session code

**Tasks:**
1. Delete backend services (TerminalService, InteractiveSessionManager)
2. Delete backend routes (interactive.routes.ts)
3. Delete frontend components (Terminal.tsx, InteractiveTerminalTabContent.tsx)
4. Remove route registration from dev-bots router
5. Delete e2e tests (interactive-terminal.spec.ts)
6. Remove test mocks and references
7. Delete terminal design docs
8. Verify no broken imports remain

**Success Criteria:**
- `npm run build` succeeds in both frontend and backend
- `npm test` runs without errors (may have fewer tests)
- No references to TerminalService or InteractiveSessionManager
- Grep confirms no "tmux" or "xterm" references in source code

**Files Deleted:**
- Backend: 3 files (~1,000 lines)
- Frontend: 2 files (~200 lines)
- Tests: 1 file (~300 lines)
- Docs: 2 files

### Phase 1: Core Backend (Week 1)

**Goal:** Get Codex CLI running with MCP server pre-configured and streaming responses

#### 1.1: MCP Configuration Setup

**Create Codex config file for admin bot sessions:**

**File:** `backend/config/codex-admin-bot.toml` (NEW)

```toml
# Codex configuration for Admin Bot sessions
# This config is used when spawning Codex CLI for admin bot chat

[mcp_servers.app-monitor]
type = "stdio"
command = "node"
args = ["--loader", "tsx", "/opt/app-monitor/current/backend/src/mcp/start.ts"]
startup_timeout_ms = 10000
env = {
  APP_MONITOR_MCP_USER_ROLE = "admin",
  DATABASE_PATH = "/opt/app-monitor/shared/backend/data/app-monitor.db",
  NODE_ENV = "production"
}

[features]
# Enable any Codex features needed for admin bot
# rmcp_client = false  # Not needed - using stdio only
```

**File:** `backend/src/mcp/start.ts` (NEW - MCP server entry point)

```typescript
#!/usr/bin/env node
/**
 * MCP Server Start Script
 *
 * Entry point for MCP server when launched by Codex CLI.
 * This script initializes the database and services, then starts the MCP server.
 */

import { startMcpServer } from './server.js';
import { getDatabase } from '../services/database.js';
import { DevBotsManager } from '../services/devBotsManager.js';
// Import other required services

async function main() {
  try {
    const db = getDatabase();
    const devBotsManager = new DevBotsManager(/* ... */);

    await startMcpServer({
      db,
      services: { devBotsManager }
    });

    // Keep process alive
    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGINT', () => process.exit(0));
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

main();
```

#### 1.2: AdminBotService Implementation

**Tasks:**
1. Create `AdminBotService` class
2. Implement session management (start/stop)
3. Configure Codex CLI to use admin bot config file
4. Set up stdio communication with Codex CLI
5. Verify MCP server connection on startup
6. Implement SSE endpoint for streaming
7. Create API routes for chat operations
8. Add basic error handling and logging

**Codex CLI Spawn Configuration:**

```typescript
// In AdminBotService.startSession()
const process = spawn('codex', ['chat'], {
  cwd: this.repoRoot,
  env: {
    ...process.env,
    // Point Codex to admin bot config
    CODEX_CONFIG_PATH: path.join(this.repoRoot, 'backend/config/codex-admin-bot.toml'),
    // Ensure MCP server can find backend
    APP_MONITOR_ROOT: this.repoRoot,
    // Admin role for MCP server
    APP_MONITOR_MCP_USER_ROLE: 'admin'
  }
});
```

**Success Criteria:**
- Can start/stop Codex CLI session
- Codex CLI automatically connects to MCP server on startup
- Can send messages via stdin
- Can receive output via stdout
- SSE stream delivers output to client
- MCP tools are available in Codex session
- Proper cleanup on session end

**Files:**
- `backend/config/codex-admin-bot.toml` (new)
- `backend/src/mcp/start.ts` (new - MCP entry point)
- `backend/src/services/AdminBotService.ts` (new)
- `backend/src/routes/admin-bot/chat.routes.ts` (new)
- Update `backend/src/server.ts` to register routes

### Phase 2: Frontend UI (Week 2)

**Goal:** Implement clean chat interface using assistant-ui

**Tasks:**
1. Install and configure `@assistant-ui/react`
2. Create `AdminBotChat` component
3. Implement SSE hook for streaming responses
4. Add message sending functionality
5. Integrate with existing tab structure
6. Add basic error states and loading indicators

**Success Criteria:**
- Chat UI renders messages correctly
- Input field accepts and sends messages
- Streaming responses display in real-time
- Auto-scroll works during streaming
- Markdown and code blocks render properly
- Can start/stop sessions via UI

**Files:**
- `frontend/src/components/admin-bot/AdminBotChat.tsx` (new)
- `frontend/src/hooks/useSSE.ts` (new)
- Update `InteractiveTerminalTabContent.tsx` to use new chat component

### Phase 3: Testing (Week 3)

**Goal:** Comprehensive test coverage for new chat system

#### 3.1: Backend Unit Tests

**File:** `backend/tests/services/AdminBotService.test.ts` (NEW)

**Test Coverage:**
- Session lifecycle (start/stop)
- Message sending to Codex CLI
- Output streaming event emission
- Error handling for CLI spawn failures
- Session cleanup on process exit
- Multiple concurrent sessions (should error)
- **MCP server configuration validation**
- **MCP server connection verification**

**Example Tests:**
```typescript
describe('AdminBotService', () => {
  test('should start session and spawn codex CLI process');
  test('should configure Codex CLI with admin bot config file');
  test('should verify MCP server is available on startup');
  test('should emit output events when CLI writes to stdout');
  test('should handle CLI process exit');
  test('should throw error when starting session while one is running');
  test('should send messages to CLI stdin');
  test('should cleanup session on stop');
  test('should handle MCP server connection failures gracefully');
});
```

#### 3.2: Backend Integration Tests

**File:** `backend/tests/integration/admin-bot-chat.routes.test.ts` (NEW)

**Test Coverage:**
- POST /api/admin-bot/chat/start
- POST /api/admin-bot/chat/message
- GET /api/admin-bot/chat/stream (SSE)
- POST /api/admin-bot/chat/stop
- Error responses
- SSE connection lifecycle

**Example Tests:**
```typescript
describe('Admin Bot Chat Routes', () => {
  test('POST /start should create session and return sessionId');
  test('POST /message should send to active session');
  test('POST /message should error when no active session');
  test('GET /stream should set correct SSE headers');
  test('GET /stream should stream CLI output events');
  test('POST /stop should terminate session');
});
```

#### 3.3: Frontend Unit Tests

**File:** `frontend/src/components/admin-bot/__tests__/AdminBotChat.test.tsx` (NEW)

**Test Coverage:**
- Component renders correctly
- Session starts on mount
- Messages send correctly
- SSE events update message state
- Session stops on unmount
- Error state handling

**File:** `frontend/src/hooks/__tests__/useSSE.test.ts` (NEW)

**Test Coverage:**
- EventSource creation
- Message event handling
- Error handling
- Cleanup on unmount
- Reconnection logic

#### 3.4: E2E Tests

**File:** `e2e/tests/admin-bot-chat.spec.ts` (NEW, replaces interactive-terminal.spec.ts)

**Test Coverage:**
- Navigation to chat interface
- Chat UI renders correctly
- Can send messages
- Receives streamed responses
- assistant-ui components work
- Session lifecycle
- Error handling
- Page refresh handling

**Example Tests:**
```typescript
describe('Admin Bot Chat Interface', () => {
  test('should navigate to chat tab');
  test('should display chat interface');
  test('should show session status indicator');
  test('should send user message');
  test('should receive and display assistant response');
  test('should verify MCP tools are available (use system_health)');
  test('should handle MCP tool responses correctly');
  test('should handle session errors gracefully');
  test('should cleanup session on tab close');
  test('should handle page refresh');
});
```

**MCP Verification Test:**
```typescript
test('admin bot can access MCP tools', async ({ page }) => {
  await navigateToAdminBotChat(page);

  // Wait for chat to be ready
  await page.locator('.assistant-ui').waitFor();

  // Send a message to test MCP tool
  await page.fill('textarea', 'Use the system_health tool to check system status');
  await page.press('textarea', 'Enter');

  // Wait for response
  await page.waitForTimeout(3000);

  // Should see MCP tool response in chat
  const messages = page.locator('.message');
  const lastMessage = messages.last();
  await expect(lastMessage).toContainText(/system.*health|status/i);
});
```

#### 3.5: Remove Deprecated Tests

**Files to DELETE:**
- `e2e/tests/interactive-terminal.spec.ts` (288 lines)
- Any TerminalService unit tests
- Remove InteractiveSessionManager from `backend/tests/helpers/mockServerDependencies.ts`

**Verification:**
```bash
# Ensure no test references to deleted code
grep -r "TerminalService" backend/tests/
grep -r "InteractiveSession" backend/tests/
grep -r "xterm" e2e/tests/
grep -r "tmux" e2e/tests/
# All should return no results
```

**Success Criteria:**
- All unit tests pass
- All integration tests pass
- All e2e tests pass
- Test coverage > 80% for new code
- Zero references to deleted code in tests

### Phase 4: Polish & Documentation (Week 3)

**Goal:** Refine UX, fix issues, document system

**Tasks:**
1. Test end-to-end conversation flow
2. Fix any rendering or streaming issues
3. Add session status indicators
4. Improve error messages
5. Add keyboard shortcuts (if needed)
6. Update API documentation
7. Update user guide
8. Code cleanup and comments

**Success Criteria:**
- Conversation flow feels natural
- No visual glitches or flashing
- Clear feedback on session status
- Graceful error handling
- Code is clean and well-documented
- All documentation updated

---

## Future Enhancements (Post-MVP)

These are explicitly OUT OF SCOPE for the initial implementation:

1. **Multiple AI Providers:** Support for Claude, Gemini, etc.
2. **Session History:** Database persistence and session list UI
3. **MCP Integration:** When MCP server is implemented
4. **Advanced Features:** File attachments, voice input, etc.
5. **Analytics:** Usage tracking, metrics dashboard
6. **Collaboration:** Multi-user sessions

---

## Decision Points

### 1. Library Choice: assistant-ui vs shadcn/ui AI vs custom

**Recommendation:** assistant-ui

**Rationale:**
- Most mature and actively maintained
- Production-ready features out of the box
- Designed specifically for AI chat
- Good TypeScript support
- Active community (400k+ downloads/month)

**Alternative:** If we want maximum control, use shadcn/ui AI elements (copy-paste approach)

### 2. CLI Tool: Codex only vs multiple tools

**Recommendation:** Codex only for MVP

**Rationale:**
- Simpler implementation
- Can expand later if needed
- Matches stated requirements ("start with Codex ONLY")

### 3. Session Persistence: In-memory vs database

**Recommendation:** In-memory only for MVP

**Rationale:**
- MINIMAL implementation requirement
- Database adds complexity
- Can add later if needed
- Sessions are meant to be ephemeral for planning/troubleshooting

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Codex CLI output format changes | High | Document expected format, add parsing tests |
| SSE connection drops | Medium | Implement reconnection logic, show clear error |
| Memory leaks from long sessions | Medium | Implement session timeout, cleanup on disconnect |
| assistant-ui learning curve | Low | Good documentation, active community |
| Codex CLI crashes | High | Add process monitoring, restart capability |

---

## Success Metrics

**Functional:**
- ✅ Can start/stop chat sessions
- ✅ Messages send and receive correctly
- ✅ Streaming works without visual glitches
- ✅ Markdown and code render properly
- ✅ Sessions clean up properly

**User Experience:**
- ✅ No render flashing (unlike terminal implementation)
- ✅ Conversation feels natural
- ✅ Response time < 500ms for message send
- ✅ Auto-scroll works during streaming

**Code Quality:**
- ✅ Clean, maintainable code
- ✅ Proper error handling
- ✅ Adequate logging
- ✅ TypeScript types throughout

---

## References

- **MCP Server Design:** `docs/technicalDesigns/app-monitor-mcp-server.md`
- **Planning System:** `docs/technicalDesigns/multi-phase-plan-system.md`
- **SSE Migration:** `docs/plans/sse-migration-plan.md`
- **assistant-ui:** https://github.com/assistant-ui/assistant-ui
- **SSE Guide:** https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events

---

## Appendix: Why Not Terminal?

The tmux-based terminal approach (Attempt 2) had fundamental UX issues:

1. **CLI Tools Aren't Web-Native:** Tools like Codex CLI expect real terminal environments
2. **Rendering Complexity:** xterm.js + tmux introduces rendering issues (flashing, alignment)
3. **Wrong Abstraction:** We want AI conversations, not terminal emulation
4. **Maintenance Burden:** Terminal emulation is complex and fragile

**A chat interface is the correct abstraction for AI agent interaction.**

---

## MCP Integration Summary

### What the Admin Bot Can Do

With pre-configured MCP server access, the admin bot can:

1. **Task Management:**
   - Create standalone tasks
   - List and filter tasks by status/plan/batch
   - Get detailed task information
   - Unblock stuck tasks
   - Cancel tasks with reason

2. **Dev-Bot Monitoring:**
   - List all active dev-bots
   - Get detailed bot status and resource usage
   - Check heartbeat health
   - Recover hung bots (admin-only)

3. **PR Operations:**
   - Trigger PR merge gate evaluations
   - Get detailed blocking issues
   - View gate status

4. **System Diagnostics:**
   - Get comprehensive system health (database, queue, bots, plans, PRs, resources, alerts)

5. **Plan Management (when available):**
   - Create and validate plans
   - Add and update batches
   - Save plans to database
   - Track execution progress

### Configuration Flow

1. **User starts chat** → Frontend creates session
2. **Backend spawns Codex CLI** with `CODEX_CONFIG_PATH=backend/config/codex-admin-bot.toml`
3. **Codex reads config** → Discovers `mcp_servers.app-monitor`
4. **Codex spawns MCP server** → Runs `backend/src/mcp/start.ts` via stdio
5. **MCP server connects** → Initializes database, services, registers tools
6. **Admin bot ready** → Can use all 24 MCP tools immediately

### Why This Architecture Works

- **Zero manual setup:** Config is pre-baked, users just start chatting
- **Isolated per session:** Each chat session gets own MCP server instance
- **Admin permissions:** Automatically configured with admin role
- **Shared services:** MCP server uses same database/services as main backend
- **Clean lifecycle:** MCP server exits when Codex session ends

---

## Next Steps

1. **Review this plan** with team
2. **Validate assumptions** about Codex CLI stdio interface
3. **Test MCP server standalone** to ensure start.ts works
4. **Approve library choice** (assistant-ui vs alternatives)
5. **Begin Phase 0 implementation** (cleanup legacy code)
6. **Begin Phase 1 implementation** (backend + MCP config)

---

**Status:** Ready for review and approval
