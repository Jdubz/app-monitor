# Interactive Terminal Reset (V0)

**Purpose:** Replace the fragile interactive session stack with a single-purpose terminal that reliably connects to a dev-bot container, focusing on stability, minimal surface area, and testability.

**Delete After:** Feature shipped and architecture docs updated.

---

## Problem & Evidence

- **Overbuilt client stack:** `useInteractiveSession` manages heartbeats, idle countdowns, reconnection timers, and model selection that never worked in production; the hook alone spans hundreds of lines with unused states (`sendDevBotsInteractiveHeartbeat`, socket reconnect, etc.).citefrontend/src/hooks/useInteractiveSession.ts:1-120
- **UI clutter versus functionality:** The interactive tab renders model dropdowns, heartbeat dashboards, and hotkey drawers while the core action (sending shell input) remains unreliable; the component forbids a restart while a broken session is “active,” leaving users stuck.citefrontend/src/components/dev-bots/interactive/InteractiveSessionTab.tsx:70-200
- **Backend complexity without payoff:** We provision an interactive worker through the same orchestrator used for autonomous bots, then track idle timeouts, allowed model lists, and persistent DB rows even though exactly one session is allowed. Each layer (service, orchestrator, stream manager, gateway) adds failure points.citebackend/src/services/interactiveSession.service.ts:1-120backend/src/services/interactiveSessionOrchestrator.ts:1-120backend/src/services/interactiveSessionStreamManager.ts:1-160
- **Production telemetry shows repeated socket/API failures:** Frontend logs from Nov 15 show successive `AxiosError: Network Error` bursts when the monitor attempts to call dev-bot APIs, illustrating the same transport layer the interactive stream relies on; if we can’t keep a basic HTTPS request alive, the heartbeat/websocket stack collapses immediately.citelogs/frontend/2025-11-15.jsonl:10-26
- **Docker permission friction:** All interactive sessions inherit the regular dev-bot container user, so any manual `chmod`, `git`, or background process that expects root-style access fails with `EACCES`, matching the “permission problems” seen when shelling in. The builder today never elevates or preps a writable scratch space.citebackend/src/services/devbot/DevBotContainerBuilder.ts:311-335backend/src/services/dockerManager.ts:91-112

## Goals
1. Deliver a *working* browser terminal connected to a dedicated dev-bot container with isolated filesystem.
2. Remove unused session concepts: model selection, heartbeats, idle watchdogs, historical records, complex metadata.
3. Keep only two critical runtime controls: **send** (enter) and **interrupt** (ESC/SIGINT).
4. Make the implementation testable in non-prod environments by mocking Docker interactions.
5. Delete dead code—no dual systems.

## Non-Goals
- Multi-session support, AI model selection UI, or collaborative terminals.
- Persisting terminal history beyond the live session.
- Shipping a full-featured SSH replacement (file upload, port forwarding, etc.).

---

## Proposed Architecture

### Backend (API & Container)
1. **InteractiveTerminalService (new):**
   - In-memory session registry keyed by `sessionId`, storing `containerId`, `status`, and timestamps.
   - Emits lifecycle events for telemetry but does *not* persist to SQLite (historic tracking moves to logs).
   - Simple API: `start()`, `stop()`, `sendInput()`, `sendInterrupt()`, `reset()`.
2. **Dedicated container builder:**
   - Based on `DevBotContainerBuilder.interactiveSession` but modified to:
     - Mount a fresh tmpfs or seeded `/workspace` folder per session.
     - Run as a user with passwordless sudo (or root) to avoid permission dead-ends.
     - Pre-install shell niceties (bash, git, editors) and agent CLI.
3. **Stream transport:**
   - Keep a single `InteractiveTerminalGateway` (WebSocket) exposing `/api/interactive-terminal/:sessionId`.
   - Stream manager trimmed to one active session; no backlog or PTY resize queue beyond what xterm needs.
   - Input API limited to two messages: `{type:'input', data:'ls\n'}` and `{type:'signal', signal:'interrupt'}`.
4. **REST endpoints:**
   - `POST /api/interactive-terminal/session` → start container; returns `{sessionId, wsUrl}`.
   - `DELETE /api/interactive-terminal/session/:id` → stop container.
   - `POST /api/interactive-terminal/session/:id/reset` → stop + start new container (optional).

### Frontend (Terminal Shell)
1. **New hook `useInteractiveTerminal`:** wraps just three calls—`start`, `stop`, `sendLine`, `sendInterrupt`—plus WebSocket state. No heartbeat timers, idle countdowns, or model pickers.
2. **Terminal UI:**
   - Auto-start button, `Reset session` button, log panel (xterm) with ESC mapped to interrupt.
   - Remove model selector, idle warnings, manual heartbeat buttons, and advanced hotkey drawer.
   - Provide explicit status banner if the stream drops; user can click “Reconnect” to recreate session.

3. **Protected workspace notice** clarifies that changes live only inside the session container; nothing syncs elsewhere.

---

## Implementation Plan

### 1. Remove Legacy Stack
- Delete files after ensuring no imports remain:
  - `frontend/src/hooks/useInteractiveSession.ts`
  - `frontend/src/components/dev-bots/interactive/InteractiveSessionTab.tsx` + `HotkeysDrawer.tsx`
  - `backend/src/services/interactiveSession*.ts` (service, orchestrator, coordinator, stream manager, gateway)
  - Related context or store wiring in `DevBotsManager` and `DevBotsStoreProvider`.
- Drop SQL artifacts tied to `interactive_sessions` (table + migration refs) via new migration that:
  - Backs up table to `interactive_sessions_legacy` (optional) then drops it, or keeps only `id`, `status`, `started_at`, `ended_at` if we need chokepoint metrics.

### 2. Backend Rewrite
1. **InteractiveTerminalService**
   - Lives in `backend/src/services/interactiveTerminal.service.ts`.
   - Holds a `Map<sessionId, SessionState>` and enforces single active session (for now).
   - Creates containers through a new helper `InteractiveTerminalContainerFactory` that wraps `DevBotContainerBuilder`.
2. **Docker orchestration**
   - Launch container with:
     - Bind-mounted `/opt/app-monitor/interactive/<sessionId>` (auto-cleaned).
     - User `root` or `devbot` + `chmod 777 /workspace` executed pre-start to avoid permission issues logged previously.citebackend/src/services/dockerManager.ts:91-112
   - Exec command `/bin/bash -l` with `TERM` env; no agent script injection.
3. **Stream Manager Simplification**
   - Inline version inside `InteractiveTerminalService` if possible: call `container.exec` once, pipe to WebSocket.
   - Remove backlog logic; forward STDOUT chunks directly, rely on client buffer.
4. **REST + Gateway**
   - Add routes under `backend/src/routes/interactiveTerminal.routes.ts`.
   - Reuse `ws` server upgrade but shift path to `/api/interactive-terminal`.
   - Broadcast minimal payloads: `{type:'stdout', data:'...'}` and `{type:'status', state:'closed'}`.

### 3. Frontend Rewrite
1. **API layer**
   - Replace interactive endpoints in `frontend/src/services/api.ts` with:
     - `startInteractiveTerminal(): { sessionId, streamUrl }`
     - `stopInteractiveTerminal(sessionId)`
   - Remove `sendDevBotsInteractiveHeartbeat` et al.
2. **Hooks & Components**
   - New `useInteractiveTerminal` returning `{state, start, stop, sendLine, interrupt, status}`.
   - Update `InteractiveTerminalTabContent` to render:
     - Start/Reset/Stop buttons
     - `xterm` window occupying rest of space
     - Input bar with `Enter` to send line, `Esc` to interrupt
   - Delete heartbeat UI and `HotkeysDrawer`.
3. **State wiring**
   - Remove interactive session entries from `DevBotsStore`.
   - Feature flag `VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB` defaults true; tab hidden entirely if backend returns 404.

### 4. Testing & Tooling
1. **Docker mocking**
   - Introduce `tests/mocks/dockerode.ts` implementing a subset of the Dockerode API:
     - `createContainer`, `getContainer().exec().start()` returning Node streams backed by `PassThrough`.
   - Use the mock in unit tests (`InteractiveTerminalService`, stream manager) via dependency injection.
2. **Backend tests**
   - Unit: verify start/stop lifecycle, input/interrupt forwarding, reset path, cleanup on error.
   - Integration: spin up `ws` server using `supertest` + `ws` client to ensure messages flow.
3. **Frontend tests**
   - Component test for `InteractiveTerminalTabContent` with mocked API + fake WebSocket (jest/websocket-mock), verifying:
     - Start button triggers POST.
     - Typing + Enter sends payload.
     - Esc dispatches interrupt.
4. **Playwright follow-up**
   - Once npm cache issues are solved, add e2e spec hitting a mocked backend (MSW) to confirm UI flows; for prod, rely on manual smoke.

### 5. Observability
- Add structured logs on start/stop/input errors (category `interactive_terminal`).
- Emit metrics: `interactive_terminal.active`, `interactive_terminal.restart_count`.
- Frontend: surface toasts when socket drops, with retry instructions.

---

## Deprecations & Cleanup Checklist
- [ ] Remove `interactive_sessions` table + migrations or shrink to minimal schema.
- [ ] Delete `InteractiveSessionService`, `InteractiveSessionOrchestrator`, `InteractiveSessionStreamManager`, `InteractiveSessionGateway`, and coordinator wiring from `DevBotsManager`.
- [ ] Update `DevBotsManager` API to expose new service methods (`startInteractiveTerminal`, `stopInteractiveTerminal`, `sendTerminalInput`).
- [ ] Purge unused API helpers in `frontend/src/services/api.ts`.
- [ ] Remove `HotkeysDrawer`, idle alerts, heartbeat UI, and dataset of allowed models.
- [ ] Drop any feature flags named `VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB` if no longer needed, or repurpose to gate entire tab.

---

## Rollout Plan
1. Ship backend service behind feature flag `INTERACTIVE_TERMINAL_V0=true`.
2. Deploy frontend that detects the new endpoint; if disabled, hide the tab and show “coming soon.”
3. Once prod confirms stability, delete flag + legacy artifacts, migrate docs (`docs/architecture/dev-bots-architecture.md`) to describe the simplified terminal.
4. Archive this technical design after rollout is complete.

---

## Risks & Mitigations
- **Docker unavailable outside prod:** Use the mock service to keep tests deterministic; in dev, allow `INTERACTIVE_TERMINAL_V0=mock` to disable backend start and return “not enabled” so developers can still build UI.
- **Permission regressions:** Run container startup self-check (`touch /workspace/.write-test`) and fail fast with actionable error sent to client if FS not writable.
- **Resource leaks:** Add a watchdog that force-destroys containers older than 2 hours even if UI disconnects.

---

## Testing Summary
- Unit: service lifecycle, container exec wiring (with docker mock), PTY interrupt handling.
- Integration: HTTP/WebSocket path from `/api/interactive-terminal` through to ws client.
- Frontend: component/unit tests verifying simplified controls, Esc handling, reconnection UX.
- E2E: Playwright spec once npm dependency issues (cache corruption) are resolved; track under separate ticket.

---

Once implemented, the master design intent remains intact—autonomy first, isolation enforced (unique container per session), minimalist UI, and no background timers beyond the WebSocket connection. This V0 deliberately scopes the feature to a single reliable terminal so we can expand later without historical baggage.
