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

Operators need a lightweight way to “drop into” a dev-bot shell when automation falls short. The interactive session must:

1. Launch outside the queue so it doesn’t count toward `maxWorkers`.
2. Offer a 5-minute idle timeout (or manual stop) to avoid orphaned containers.
3. Stream PTY output over WebSocket with familiar hotkeys (Esc, Ctrl+C, Ctrl+L/U/W).
4. Skip complex auth/audit requirements—trusted users on the local network can access it.

---

## 3. Goals & Non-Goals

### Goals
1. Ship a frontend “Interactive Session” tab with model selector, terminal output, and start/stop controls.
2. Provide backend APIs/WebSocket streams so the tab can start a dev-bot container, send commands, and receive PTY output.
3. Ensure the interactive worker bypasses queue capacity but still uses the canonical dev-bot image/config.
4. Add a simple idle timeout watchdog and manual “End Session” to keep containers tidy.

### Non-Goals
- Fine-grained auth or email whitelists (assume trusted LAN access).
- Persisted transcripts, chat summaries, or reconnectable session context.
- Observability dashboards, Prometheus metrics, or compliance-ready audit logs.
- Multi-session support or queue-management changes.

---

## 4. Experience Blueprint

### 4.1 Navigation & Access Control
- Add a new top-level tab in `frontend/src/components/tabs/DevBotsTab.tsx` labeled “Interactive Session”.
- Visibility is controlled only by the existing feature flag (`devBotsStatus.features.interactiveShell` / `VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB`). No user-level gating in this iteration.

### 4.2 Session Panel Layout
1. **Session Header**
   - Model selector (dropdown seeded with providers already configured in `devBotsManager` – default Claude Sonnet).
   - “Start Session” / “End Session” button.
   - Status pill (Disconnected, Connecting, Running, Idle Timeout in XXs).
2. **Terminal View**
   - Single xterm.js-powered terminal streaming stdout/stderr via WebSocket.
3. **Footer Controls**
   - Hotkey legend (Esc interrupt, Ctrl+C, Ctrl+U clear line, etc.).
   - Idle timer indicator + “Keep Alive” button sending a noop ping.

### 4.3 Interaction Flow
1. User opens the tab → frontend calls `GET /dev-bots/interactive/session` to learn current status.
2. If no session is running, user selects a model and clicks “Start Session”.
3. Backend launches an interactive worker container (same dev-bot image labeled `interactive=true`) and returns `{ sessionId, model, streamUrl }`.
4. Frontend opens `WS /api/dev-bots/interactive/:sessionId/stream` for PTY output/input.
5. Commands go through `POST /dev-bots/interactive/session/:id/input`; interrupts hit `/.../interrupt`; optional keep-alives hit `/.../heartbeat`.
6. Backend watchdog checks the last activity timestamp every minute and ends the session after 5 minutes of inactivity, sending a final socket message.
7. User can manually press “End Session” at any time, which stops the container and closes the WebSocket.

---

## 5. Technical Design

### 5.1 Backend Additions
| Area | Implementation Notes |
| --- | --- |
| **API Routes** | Add `/dev-bots/interactive/session` routes: `GET` (describe session), `POST` (start), `DELETE` (end), plus `POST /interactive/session/:id/input`, `POST /interactive/session/:id/interrupt`, `POST /interactive/session/:id/heartbeat`. |
| **WebSocket** | Provide `WS /dev-bots/interactive/session/:id/stream` that transports PTY data in both directions. |
| **Session Tracking** | Persist minimal metadata (id, model, status, timestamps, container id) in SQLite or in-memory. No conversation context blob required. |
| **DevBotsManager Hook** | Add a helper that launches a container via existing Docker orchestration with `skipConcurrencyLimits=true` and returns stream info/container id. |
| **Idle Timeout** | Simple `setInterval` inside the service checks `lastActivity` every minute; after 5 minutes of inactivity call `endSession()` and emit a message. |
| **Restart Cleanup** | On server boot, if a leftover container ID exists, attempt to stop it before accepting a new session. |

### 5.2 Frontend Changes
| Component | Details |
| --- | --- |
| **Hook/Store** | Keep `useInteractiveSession` as the primary state holder: call the new REST endpoints, manage WebSocket lifecycle, expose `start`, `sendInput`, `interrupt`, `keepAlive`, `end`. |
| **Terminal** | Rely on `@xterm/xterm` + `addon-fit`; no secondary chat pane or serialize addon required for this scope. |
| **Tab** | `InteractiveSessionTab.tsx` shows model selector, session controls, terminal, and hotkey drawer. If a session already exists, disable the start button and show the running state. |
| **Notifications** | Optional toast when idle timeout is imminent; otherwise rely on inline status pills. |
| **Hotkeys** | Maintain the Esc / Ctrl+C / Ctrl+U / Ctrl+W bindings via the existing terminal component. |

### 5.3 Session Lifecycle State Machine

- `idle` → no container running.
- `launching` → container provisioning; frontend shows spinner.
- `running` → PTY stream active; heartbeat timestamps update on every input/output.
- `terminating` → triggered by idle timeout or manual “End Session”; backend sends final message, stops container.
- `completed` → session metadata cleared; frontend returns to idle state.

### 5.4 Data Persistence & Context
- Only keep `session_id`, `model`, `status`, `container_id`, `started_at`, `last_activity_at` in SQLite using `app-monitor.db` (or an in-memory map). No transcript, file history, or downloadable logs.

### 5.5 Security Considerations
1. Trust the local network; no email whitelist for now.
2. Still limit to one session at a time so containers don’t pile up.
3. Interactive worker uses the standard dev-bot image/env; no additional secrets required.

---

## 6. Operational Plan

| Area | Actions |
| --- | --- |
| **Observability** | Rely on structured log lines for start/end/idle events; defer metrics until a later phase. |
| **Testing** | Unit tests for the new routes + idle watchdog; Vitest coverage for `useInteractiveSession` happy path + socket reconnect. |
| **Rollout** | Ship behind `DEV_BOTS_ENABLE_INTERACTIVE` + `VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB`; default on in staging/local. |

---

## 7. Stakeholder Decisions

1. **Supported Models (Answered)** – Keep the selector limited to the already-wired Claude and Codex providers. Future models will hook into the same abstraction once dev-bots support them.
2. **Idle vs. Long-Lived Sessions (Answered)** – Interactive sessions exist to orchestrate higher-level planning and manual interventions. Admins may step away for stretches, but sessions must spin down after 5 minutes of *combined* inactivity to save resources while preserving state. No special “incident” override is required right now; long-lived behavior will be achieved via seamless context persistence and quick restarts rather than indefinitely running containers.
3. **Context Persistence (Revised)** – Not required for this iteration; operators accept that ending a session clears context.
4. **Auth Assumptions (Revised)** – No whitelist for now. The app still runs on a trusted local network; once we need remote access we’ll revisit auth and auditing.
5. **Hotkeys (Answered)** – Support the standard terminal shortcuts (Esc interrupt, Ctrl+C, Ctrl+L clear, Ctrl+U delete line, Ctrl+W delete word, etc.). Surface them in a collapsible “Hotkeys” drawer within the tab so users can reference bindings quickly.

---

## 8. Next Steps

1. Finalize the reduced API contract (minimal metadata + PTY WebSocket).
2. Implement backend session orchestration + idle monitor.
3. Wire `useInteractiveSession` + InteractiveSessionTab to the real endpoints.
4. Verify end-to-end flow in staging with the feature flag enabled.
5. Follow up later with auth/observability enhancements if needed.

---

## 9. Workstreams Overview

### 9.1 Backend Orchestration & APIs
- **Schema**: minimal `interactive_sessions` table in `app-monitor.db` (id, model, status, container id, timestamps).
- **DevBotsManager**: helper that launches/kills containers with `skipConcurrencyLimits=true` and exposes PTY streams.
- **Lifecycle APIs**: `GET/POST/DELETE /dev-bots/interactive/session`, plus `POST /interactive/session/:id/{input|interrupt|heartbeat}` and the WebSocket stream.
- **Idle Enforcement**: simple interval timer that ends the session after 5 minutes without activity and prints a final terminal message.
- **Persistence**: no transcript export—just enough metadata to clean up on restart.

### 9.2 Frontend Interactive Tab
- **Hook**: `useInteractiveSession` already manages sockets + commands; finish wiring it to the new backend contract.
- **UI**: keep the existing tab layout (model picker, status pills, xterm terminal, hotkey drawer). Remove admin-only copy.
- **Terminal Layer**: xterm.js + `addon-fit` only; no chat/thread pane.
- **Feature Flag**: tab is visible whenever the global flag is on; no additional gating yet.

### 9.3 Ops & Enablement
- **Feature Flags/Env**: `DEV_BOTS_ENABLE_INTERACTIVE` on the server + `VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB` on the client.
- **Observability**: rely on log messages (start/end/idle timeout). No dashboards in this phase.
- **Docs**: add a short README/runbook section describing how to start/stop a session and what the idle timeout does.

---

## 10. Dev-Bots Architecture Alignment (Nov 2025 refresh)

The latest dev-bots rewrite replaced the legacy in-memory queue with a SQLite-backed `TaskQueueService`, a dedicated `EphemeralWorkerService`, and centralized orchestration inside `DevBotsManager`. The interactive plan remains viable, but it now needs to plug into the following concrete touchpoints:

1. **Manager-owned Services** – `DevBotsManager` already wires `ProcessManager`, `TaskQueueService`, `EphemeralWorkerService`, and `TaskExecutionService` via dependency injection (`backend/src/services/devBotsManager.ts:120-166`). Any interactive capability must be injected the same way so health checks, logging, and lifecycle hooks stay centralized.
2. **Worker Lifecycle Rules** – `EphemeralWorkerService` enforces a `maxConcurrentWorkers` cap and mirrors the repo into containers via `copyWorkspaceToContainer` (`backend/src/services/ephemeralWorker.service.ts:300-350`). The interactive orchestrator should reuse `populateWorkspaceFromRepo` so the container inherits the same workspace snapshot without incrementing the worker count. Mark containers with `dev-bot.interactive=true` labels so cleanup scripts can continue skipping them.
3. **SQLite Persistence Expectations** – All task/worker metadata now lives in `backend/data/app-monitor.db`. Interactive session records should reuse this DB (new `interactive_sessions` table defined in `backend/migrations/007_interactive_sessions.sql`) to stay aligned with backup/export flows.
4. **API Middleware & Auth** – Every `/dev-bots/*` route automatically wraps responses in the `{ success, data }` envelope and normalizes errors (`backend/src/routes/dev-bots.routes.ts:120-220`). Interactive endpoints follow the same middleware, but explicit admin gating is deferred until the app has real auth (local network deployments simply use the default owner email for attribution).
5. **Socket + Log Infrastructure** – Log streaming is rate-limited by `LogStreamAccessTracker` and SSE utilities in the same route module. The interactive terminal should skip SSE entirely and rely on a dedicated WebSocket upgrade (see below) so it does not exhaust log-stream quotas.
6. **Idle Enforcement** – The dev-bots process already runs periodic health/cleanup intervals (`DevBotsManager.startLongRunningTaskMonitor`). Interactive sessions need a companion watchdog (similar cadence) that terminates the container after 5 minutes of no user+agent activity and emits a structured log event for observability.
7. **Docker Image & Credentials** – `createDevBotsManagerDependencies` hardcodes the worker image (`dev-bot:latest`) and env passthrough keys (`backend/src/services/devBotsManager.factory.ts`). The interactive orchestrator must use the same image/keys so model credentials (Claude, Codex) remain consistent and secrets stay centralized.

### Plan Adjustments Based on the Refresh

- **Backend**: implement `InteractiveSessionService` + stream manager as DI-managed services owned by `DevBotsManager`.
- **API Surface**: add the minimal REST/WebSocket endpoints described above—no admin-only gating for now.
- **Idle Enforcement**: reuse the manager’s interval infrastructure to watch idle sessions and end them after 5 minutes, logging to the standard dev-bots logger.
- **Frontend Contracts**: continue using the shared `DevBotsInteractiveSession*` types so backend/frontend stay in sync on fields (session id, model, stream URL, idle timeout).
- **Terminal UX**: keep the PTY stream, status pills, hotkey drawer, and keep-alive button; no additional chat pane or role-based messaging until auth hardening returns.

With these adjustments, the plan remains compatible with the refactored dev-bots stack: we leverage the same Docker image, persistence layer, and monitoring hooks instead of bolting on bespoke infrastructure.
