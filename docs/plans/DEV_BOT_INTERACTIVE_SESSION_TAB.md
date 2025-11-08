# Dev-Bot Interactive Session Tab Plan

**Date:** 2025-11-08  
**Author:** Platform Tooling (Dev-Bot Enablement)  
**Status:** Draft – needs product sign-off

---

## 1. Background & Prior Work Review

- `docs/plans/DEV_BOT_EPHEMERAL_CONTAINER_MIGRATION.md` confirms every bot now runs inside an AutoRemove Docker container that copies the repo in via `tar | docker cp`. We can reuse this flow to spin up an **ephemeral “interactive” worker** without polluting local mirrors.
- `docs/plans/DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md` introduces the Work Target abstraction so bots can mount the canonical repo path even when backend binaries live elsewhere. The interactive session must call into this resolver to stay consistent with production deployment.
- `docs/plans/APP_MONITOR_CAPABILITY_ROADMAP.md` highlights “Service Orchestration & Control” and “Work-Target Intelligence” lanes, which this feature advances by adding live operator tooling atop the dev-bot fleet.
- Existing dev-bot queue UI (see `frontend/src/components/dev-bots/*`) already manages sockets, worker selection, and log streaming. The new tab should live alongside those components but represents a different workflow: **single privileged operator + transient shell** rather than queued tasks.

External inspiration:
- Forge (antinomyhq/forge) shows demand for a terminal-first AI pair programmer that can target Claude, GPT, etc., and wraps model/provider selection plus workspace streaming into a CLI UX. It demonstrates ergonomic patterns for switching models mid-session and piping shell output back into the agent. citeturn0search0
- ClaudeCodeUI (siteboon/claudecodeui) plus community discussions around Claude Code UIs underscore the appetite for a browser-based console, cautioning about security and authentication layers. citeturn0search3turn0reddit12
- xterm.js + xterm-pty are mature OSS components for embedding a bidirectional terminal in React apps, with websocket/PTY support and published security guidance that we can reuse for the terminal-like portion. citeturn0search4turn0search5

---

## 2. Problem Statement

Admins (currently limited to `contact@joshwentworth.com`) need a safe way to “drop into” a dev-bot shell, pick a foundation model (Claude, Codex, etc.), run short-lived experiments, and then let the bot continue autonomously even if the operator disconnects. Sessions must:

1. **Not count toward** the configured `maxWorkers` so the automation queue capacity is unaffected.
2. **Auto-suspend after 5 minutes** of combined user+agent inactivity unless manually ended.
3. **Persist conversational + workspace context** so reconnecting to the same session resumes state.
4. Enforce **single concurrent interactive session** globally, with enforced admin-only access.
5. Support terminal hotkeys (Esc interrupt, Ctrl+C passthrough, etc.) matching today’s CLI agent ergonomics.

---

## 3. Goals & Non-Goals

### Goals
1. Dedicated frontend tab (“Interactive Agent”) under the Dev-Bots navigation that exposes model selection, session controls, and a terminal/chat hybrid surface.
2. Backend APIs to manage session lifecycle, multiplex I/O, and enforce policy (auth, max-one-session).
3. Worker orchestration path that spawns an ephemeral container using the same image as other dev-bots but flagged as `interactive=true`, bypassing queue accounting.
4. Idle detection + teardown logic that respects both agent output and operator input timestamps.
5. Persisted session metadata (task transcript, file diffs, environment info) stored in SQLite so reconnects restore context.

### Non-Goals
- This does **not** expose interactive sessions to non-admins.
- No multi-session support; once stable we can revisit pooling.
- Does not attempt to modify existing task queue behavior or worker scaling limits.

---

## 4. Experience Blueprint

### 4.1 Navigation & Access Control
- Add a new top-level tab in `frontend/src/components/tabs/DevBotsTab.tsx` labeled “Interactive Session (Admins)”.
- Gate the tab via backend-provided feature flag (e.g., `devBotsStatus.features.interactiveShell`) AND email whitelist check on the authenticated user. UI should show an inline lock state if the viewer lacks access.

### 4.2 Session Panel Layout
1. **Session Header**
   - Model selector (dropdown seeded with providers already configured in `devBotsManager` – default Claude Sonnet).
   - “Start Session” / “End Session” button.
   - Status pill (Disconnected, Connecting, Running, Idle Timeout in XXs).
2. **Terminal / Console Split View**
   - Left: xterm.js-powered terminal streaming stdout/stderr via SSE or WebSocket.
   - Right (optional): collapsible chat thread summarizing agent actions + user prompts for readability.
3. **Footer Controls**
   - Hotkey legend (Esc interrupt, Ctrl+C, Ctrl+U clear line, etc.).
   - Idle timer indicator + “Keep Alive” button sending a noop ping.

### 4.3 Interaction Flow
1. User opens tab → backend reports whether an interactive session exists.
2. If none, user chooses a model and hits “Start Session”.
3. Backend spawns an interactive worker container:
   - Uses existing dev-bot Dockerfile.
   - Sets labels `interactive=true`, `ownerEmail=...`, `expiresAt=...`.
   - Registers session row in SQLite with state `running`.
4. Frontend establishes a WebSocket to `/api/dev-bots/interactive/:sessionId/stream` for bidirectional text (xterm-pty protocol).
5. User sends commands; agent responses stream back. Esc interrupts by POSTing `/interrupt`.
6. Idle watchdog: 
   - Worker emits heartbeats when generating outputs.
   - Frontend posts `/heartbeat` on keypress/command send.
   - Backend timer (cron or setInterval) checks combined idle duration; after 5 minutes triggers graceful stop, sending terminal notification first.
7. If the browser disconnects, backend keeps the container alive, streaming logs to disk. Reconnect replays buffered output then switches to live stream.
8. “End Session” triggers manual teardown even if idle timer hasn’t fired.

---

## 5. Technical Design

### 5.1 Backend Additions
| Area | Implementation Notes |
| --- | --- |
| **API Routes** | Extend `backend/src/routes/dev-bots.routes.ts` with `/interactive` namespace: `POST /interactive/session`, `GET /interactive/session`, `DELETE /interactive/session`, `POST /interactive/heartbeat`, `POST /interactive/interrupt`, `WS /interactive/session/:id/stream`. Reuse existing response envelope middleware. |
| **Auth** | Reuse current JWT cookie but add middleware verifying `user.email === 'contact@joshwentworth.com'`. Consider config-driven whitelist for future admins. |
| **Session Store** | New table `interactive_sessions` in SQLite (fields: `id`, `owner_email`, `status`, `model`, `started_at`, `last_agent_activity_at`, `last_user_activity_at`, `context_blob`, `container_id`). `context_blob` persists summary + conversation to restore after reconnects/spin down. |
| **DevBotsManager hooks** | Introduce `launchInteractiveWorker(model, ownerEmail)` delegating to the existing container factory but injecting `skipConcurrencyLimits=true`. Track container id for targeted stop. |
| **I/O Transport** | Implement PTY bridge using Node `node-pty` or an SSE/WebSocket pump. Because our frontend is React/Vite, use WebSocket for low-latency bidirectional traffic. Terminal input events POST to `/interactive/session/:id/input`. Output events publish to connected clients + append to rolling buffer persisted in SQLite or disk (for reconnection). |
| **Idle Scheduler** | Background job (setInterval or Bull queue) running every minute: compute `now - max(last_agent_activity_at, last_user_activity_at)`. If > 5 minutes, mark status `terminating`, send message, invoke stop routine, then set `completed_at`. |
| **Resilience** | On backend restart, sweep `interactive_sessions` for `status='running'` but missing Docker containers → mark `aborted` and free the slot. |

### 5.2 Frontend Changes
| Component | Details |
| --- | --- |
| **Store** | Extend `frontend/src/contexts/devBotsStore.tsx` (or create `useInteractiveSessionStore`) to fetch session state, manage WebSocket lifecycle, and expose commands (`start`, `sendInput`, `interrupt`, `end`, `keepAlive`). |
| **Terminal** | Add `@xterm/xterm` + `xterm-addon-fit`, `xterm-addon-serialize`. Wrap inside new `InteractiveTerminal` component. Use `xterm-pty` protocol so backend can manage PTY semantics. |
| **Tab** | New `InteractiveSessionTab.tsx` hooking into store and rendering layout described above. Should display read-only notice if another admin session is active (show owner + started time). |
| **Notifications** | Use existing toast system to surface idle warnings (e.g., “Session idle for 4 minutes; ending in 60s unless you interact”). |
| **Hotkeys** | Implement keyboard listener capturing Esc, Ctrl+C, etc., translating into `sendInput('\u0003')` as needed while preventing browser default shortcuts. Provide accessible buttons as fallbacks. |

### 5.3 Session Lifecycle State Machine

```
idle → starting → running → (terminating|disconnecting) → ended
        ^                                    |
        |------------ reconnect -------------|
```

- **starting**: container provisioning; user sees spinner.
- **running**: active WebSocket; idle timer ops.
- **disconnecting**: client offline but worker still running. Timer continues.
- **terminating**: triggered by idle timeout or manual end; backend sends final message, stops container, archives logs, transitions to `ended`.

### 5.4 Data Persistence & Context
- Persist `context_blob` as JSON storing:
  - Rolling conversation summary (for quick reload, not a full transcript).
  - Files touched / pending diffs.
  - Last command prompt text.
- Store raw terminal log on disk under `dev-bots/artifacts/interactive/<sessionId>.log` and register via existing WorkerLogLocator so the Dev-Bots UI can expose “Download Transcript”.

### 5.5 Security Considerations
1. **Admin-only access** with email whitelist + server-side enforcement.
2. **Single session guarantee** enforced by locking row in DB before provisioning.
3. **Resource isolation**: re-use ephemeral containers (no host bind aside from repo copy) + AutoRemove.
4. **Audit trail**: log every command + model selection to backend logger for compliance.
5. **Secret handling**: interactive bot inherits same environment variables as regular workers; ensure no additional credentials needed.

---

## 6. Operational Plan

| Area | Actions |
| --- | --- |
| **Observability** | Add metrics (`interactive_session_start`, `interactive_session_idle_exit`, `interactive_session_duration`). Ship logs into existing logging pipeline with `category: 'interactive-session'`. |
| **Alerts** | Pager alert if interactive session exceeds 30 minutes (prevents stranding containers). |
| **Testing** | Unit tests for new routes + idle scheduler. Integration test that mocks Docker client to ensure `skipConcurrencyLimits` works. Cypress/Vitest UI tests to verify tab gating and websocket reconnect. |
| **Rollout** | Feature flag exposed only in staging initially. After verification, enable in production for admin email. |

---

## 7. Open Questions for Stakeholders

1. **Model List** – Should the model dropdown mirror all providers (Claude Opus/Sonnet, GPT-4.1, Codex, etc.) or a curated subset? Are there cost constraints we need to enforce?
2. **Idle Timer Exceptions** – Do we ever allow longer sessions (e.g., during live incident response), and if so, how should the admin request an extension?
3. **Context Persistence Scope** – Is storing summarized context sufficient, or do we need full command transcripts and file diffs retained indefinitely?
4. **Frontend Auth Source of Truth** – Can we rely on existing user identity plumbing to expose the authenticated email to the React app, or do we need a new `/me` endpoint to confirm admin status?
5. **Shortcut Conflicts** – Should we reserve additional hotkeys (Ctrl+Enter to send, Ctrl+L to clear screen) or strictly mimic shell defaults to avoid confusion?

---

## 8. Next Steps

1. Gather answers to open questions.
2. Finalize API contract + DB migrations.
3. Spike WebSocket + xterm integration behind feature flag in staging.
4. Implement backend session orchestration + idle monitor.
5. Harden auth + release to admin for acceptance testing.
