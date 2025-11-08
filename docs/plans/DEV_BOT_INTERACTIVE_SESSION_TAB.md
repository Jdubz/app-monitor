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

## 7. Stakeholder Decisions

1. **Supported Models (Answered)** – Keep the selector limited to the already-wired Claude and Codex providers. Future models will hook into the same abstraction once dev-bots support them.
2. **Idle vs. Long-Lived Sessions (Answered)** – Interactive sessions exist to orchestrate higher-level planning and manual interventions. Admins may step away for stretches, but sessions must spin down after 5 minutes of *combined* inactivity to save resources while preserving state. No special “incident” override is required right now; long-lived behavior will be achieved via seamless context persistence and quick restarts rather than indefinitely running containers.
3. **Context Persistence (Answered)** – The experience must “feel” persistent even when the container stops. We need a provider-aware context store (recognizing Claude vs. Codex differences) that captures transcript, summarized state, and pending instructions so reconnects resume naturally.
4. **Auth Assumptions (Answered)** – Today the app only runs on the admin’s local network, so access itself implies admin rights. We can gate purely on email config for now and defer broader auth/hardening until the app is Internet-facing.
5. **Hotkeys (Answered)** – Support the standard terminal shortcuts (Esc interrupt, Ctrl+C, Ctrl+L clear, Ctrl+U delete line, Ctrl+W delete word, etc.). Surface them in a collapsible “Hotkeys” drawer within the tab so users can reference bindings quickly.

---

## 8. Next Steps

1. Gather answers to open questions.
2. Finalize API contract + DB migrations.
3. Spike WebSocket + xterm integration behind feature flag in staging.
4. Implement backend session orchestration + idle monitor.
5. Harden auth + release to admin for acceptance testing.

---

## 9. Workstreams Overview

### 9.1 Backend Orchestration & APIs
- **Schema**: add `interactive_sessions` table plus migrations to store session state, heartbeat timestamps, container metadata, and serialized context blobs.
- **DevBotsManager**: new `launchInteractiveWorker` path that skips concurrency limits, applies `interactive=true` labels, and plugs into the idle watchdog + reconnection story.
- **Lifecycle APIs**: `POST /interactive/session`, `GET /interactive/session`, `DELETE /interactive/session`, `POST /interactive/heartbeat`, `POST /interactive/interrupt`, and WebSocket streaming endpoints with admin gating.
- **Session State DTO**: `/interactive/session` responses must return the `DevBotsInteractiveSessionState` contract (session snapshot, allowed model catalog, heartbeat + idle timers, and WebSocket descriptor) sourced from `shared/api-contracts` so backend + frontend never diverge on shape.
- **Input + Streaming**: expose `POST /interactive/session/:id/input` for REST-based keystroke fallbacks while the `InteractiveSessionGateway` WebSocket handles low-latency PTY data and hotkeys against the shared `InteractiveSessionStreamManager`.
- **Idle Enforcement**: background job to monitor combined user/agent activity, broadcast impending timeout warnings, and gracefully stop containers after 5 minutes.
- **Persistence & Telemetry**: archive transcripts/log artifacts, emit metrics (`interactive_session_started`, `idle_timeout`, duration histograms), and log every command for auditing.

### 9.2 Frontend Interactive Tab
- **Store/Hook**: manage session state, WebSocket connection, reconnect logic, heartbeat pings, and command dispatch APIs.
- **UI**: new “Interactive Session (Admins)” tab with model selector (Claude/Codex), session controls, status pill, idle timer, and a collapsible hotkey drawer.
- **Terminal Layer**: integrate xterm.js + addons, wire standard shortcuts (Esc, Ctrl+C/L/U/W, etc.), and display both terminal output and optional chat/thread summaries.
- **Access Control**: today the tab simply checks the feature flag (local network only) and shows the session state to any operator; once real auth lands we can re-introduce admin-specific gating and messaging.

### 9.3 Ops & Enablement
- **Feature Flags/Env**: configuration toggles for enabling the tab, setting admin email(s), and future model additions.
- **Observability**: dashboards/alerts for long-running sessions, idle timeouts, and container cleanup failures.
- **Docs & Runbooks**: operational guide for starting/stopping sessions, interpreting logs/artifacts, and responding to stuck containers or idle failures.
- **Tech Debt Guardrails**: optional follow-up to quiet recurring `no-explicit-any` lint warnings so pre-push hooks stay signal-rich.

---

## 10. Dev-Bots Architecture Alignment (Nov 2025 refresh)

The latest dev-bots rewrite replaced the legacy in-memory queue with a SQLite-backed `TaskQueueService`, a dedicated `EphemeralWorkerService`, and centralized orchestration inside `DevBotsManager`. The interactive plan remains viable, but it now needs to plug into the following concrete touchpoints:

1. **Manager-owned Services** – `DevBotsManager` already wires `ProcessManager`, `TaskQueueService`, `EphemeralWorkerService`, and `TaskExecutionService` via dependency injection (`backend/src/services/devBotsManager.ts:120-166`). Any interactive capability must be injected the same way so health checks, logging, and lifecycle hooks stay centralized.
2. **Worker Lifecycle Rules** – `EphemeralWorkerService` enforces a `maxConcurrentWorkers` cap and mirrors the repo into containers via `copyWorkspaceToContainer` (`backend/src/services/ephemeralWorker.service.ts:300-350`). The interactive orchestrator should reuse `populateWorkspaceFromRepo` so the container inherits the same workspace snapshot without incrementing the worker count. Mark containers with `dev-bot.interactive=true` labels so cleanup scripts can continue skipping them.
3. **SQLite Persistence Expectations** – All task/worker metadata now lives in `backend/data/dev-bots.db`. Interactive session records should reuse this DB (new `interactive_sessions` table defined in `backend/migrations/007_interactive_sessions.sql`) to stay aligned with backup/export flows.
4. **API Middleware & Auth** – Every `/dev-bots/*` route automatically wraps responses in the `{ success, data }` envelope and normalizes errors (`backend/src/routes/dev-bots.routes.ts:120-220`). Interactive endpoints follow the same middleware, but explicit admin gating is deferred until the app has real auth (local network deployments simply use the default owner email for attribution).
5. **Socket + Log Infrastructure** – Log streaming is rate-limited by `LogStreamAccessTracker` and SSE utilities in the same route module. The interactive terminal should skip SSE entirely and rely on a dedicated WebSocket upgrade (see below) so it does not exhaust log-stream quotas.
6. **Idle Enforcement** – The dev-bots process already runs periodic health/cleanup intervals (`DevBotsManager.startLongRunningTaskMonitor`). Interactive sessions need a companion watchdog (similar cadence) that terminates the container after 5 minutes of no user+agent activity and emits a structured log event for observability.
7. **Docker Image & Credentials** – `createDevBotsManagerDependencies` hardcodes the worker image (`dev-bot:latest`) and env passthrough keys (`backend/src/services/devBotsManager.factory.ts`). The interactive orchestrator must use the same image/keys so model credentials (Claude, Codex) remain consistent and secrets stay centralized.

### Plan Adjustments Based on the Refresh

- **Backend**: implement `InteractiveSessionService`, `InteractiveSessionOrchestrator`, and `InteractiveSessionStreamManager` as DI-managed services so they are constructed inside `createDevBotsManagerDependencies` and owned by `DevBotsManager`. This keeps restart/health semantics aligned with the new architecture.
- **API Surface**: add admin-only REST endpoints (`GET/POST/DELETE /dev-bots/interactive/session`, heartbeat, interrupt) plus a WebSocket gateway mounted off the existing Express server. The gateway should stream PTY output directly from Docker via `docker.exec` and fan out to the frontend tab.
- **Idle / Metrics**: reuse the manager’s interval infrastructure to poll for idle sessions, log `interactive_session_idle_timeout` events, and end the session via `endInteractiveSession`. Emit Prometheus-friendly counters on start/end for dashboards.
- **Frontend Contracts**: rely on the new `DevBotsInteractiveSession*` types exported from `shared/api-contracts/index.ts` so the UI receives idle deadlines, container IDs, stream URLs, and context snapshots straight from the backend. The terminal tab can then reuse the same heartbeat cadence as the manager watchdog.
- **Terminal UX**: the interactive tab should stream PTY output over WebSocket, surface connection/idle state, expose one-click heartbeats, wire standard hotkeys (Esc / Ctrl+C / Ctrl+L / Ctrl+U / Ctrl+W), and let the hotkey drawer double as an action palette. Since the app still runs on a trusted local network there is no dedicated admin gate yet; once auth is ready we can tie the same UI affordances to role checks. Session details now highlight the owner email, session ID, and connection health so operators can see at a glance whether the socket is healthy.

With these adjustments, the plan remains compatible with the refactored dev-bots stack: we leverage the same Docker image, persistence layer, and monitoring hooks instead of bolting on bespoke infrastructure.
