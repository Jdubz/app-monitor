# Frontend Tabbed Intervention Panel Plan

**Status:** Planning  
**Created:** 2025-11-15  
**Owner:** Frontend / Platform Tooling  
**Scope:** App Monitor frontend (React + Vite + shadcn/ui)  

---

## Goal

Redesign the App Monitor frontend into a **tabbed, dual-pane intervention console** aligned with the master design intent:

- **Autonomy-first:** UI assumes the dev-bot system runs continuously; humans only plan, monitor, and intervene.
- **Minimalist UI:** No analytics dashboards or vanity metrics—only binary states, high-signal alerts, and critical controls.
- **Chain-aware:** Surfaces chains, tasks, PRs, and plans as first-class objects with clear intervention points.
- **Event-driven:** Prefer WebSocket-driven updates over polling; no new timers or cron-style loops in the frontend.

Result: A small set of **high-signal tabs** (PR Tracking, Dev-Bots, Task Queue, Plans, Interactive Terminal), each with a dual-pane layout that lets humans see the overview and make critical decisions with at most two clicks.

---

## High-Level UX Structure

### Global Shell

- **Header:** Update existing `Header` copy to reflect autonomous dev-console focus (no log viewer language).
- **Top Status Strip:** Global binary status for:
  - Blocked chains
  - Blocked / escalated PRs
  - Quarantined tasks
  - Interactive sessions active
- **Primary Tab Bar (shadcn `Tabs`):**
  - `Dev-Bots` (default)
  - `PR Tracking`
  - `Task Queue`
  - `Plans`
  - `Interactive Terminal`
- **Shared Dual-Pane Pattern:**
  - `DualPaneLayout` wrapper component:
    - `left` = overview list and summary cards
    - `right` = detail pane for currently selected object
    - Responsive: stacked on small screens, split grid on `lg+`.

Implementation:
- New layout shell component (e.g. `DevMonitorShell.tsx`) composed inside `AppContent`.
- Use shadcn `Tabs`, `Card`, `ScrollArea`, `Badge`, and `Button` throughout; avoid bespoke tab implementations.

---

## Tab Designs (Overview Only)

Detailed visuals are in:
- `docs/front-end-designs/dev-bots-tab-preview.svg`
- `docs/front-end-designs/pr-tracking-tab-preview.svg`
- `docs/front-end-designs/task-queue-tab-preview.svg`
- `docs/front-end-designs/plans-tab-preview.svg`
- `docs/front-end-designs/interactive-terminal-tab-preview.svg`

### 1. Dev-Bots Tab

**Purpose:** High-level automation health and chain-centric status; quickest path to understand whether dev-bots are doing useful work.

- **Left Pane (Overview):**
  - Three summary cards (queue, workers, scope/safety) wired to existing dev-bots status.
  - Chain-aware list:
    - Each row = chain (`id`, linked plan, linked PR, status, last update).
    - Severity color and badges (running, blocked, quarantined, depth 4/4).
    - Filters: `All`, `Blocked`, `Quarantined`.
  - Reuse/extend existing `ChainStatusPanel` data model but present as chain rows, not metrics grid.

- **Right Pane (Detail):**
  - Selected chain detail:
    - Chain header: status chips, associated plans and PRs.
    - Minimal timeline: Implementation → Review → Fix → Complete with current step.
    - Last automation attempt summary (from session-summary / dev-bot foundational upgrades).
    - Scope violations and safety status (from context management + foundational upgrades).
  - Critical actions (2-click max, all backend-backed):
    - Escalate chain.
    - Pause new implementation tasks for chain.
    - Open interactive session scoped to chain/work-target.

### 2. PR Tracking Tab

**Purpose:** Chain-aware PR view from `pr-self-healing-and-resilience.md`; show which PRs are blocked and what gate is failing.

- **Left Pane (Overview):**
  - Summary cards: open PRs, auto-merge-ready PRs, escalations.
  - PR chain list with:
    - PR number/title, branch, chain id, status (healthy / blocked / escalated).
    - Merge gates aggregate (e.g., `gates 6/8`) plus primary blocker.
    - Filters: `All`, `Blocked`, `Pending human`, `Auto-merge ready`.

- **Right Pane (Detail):**
  - Merge gate checklist (the 8 core gates) with simple binary chips.
  - Chain-aware timeline for this PR (implementation, reviews, fixes) with depth tracking.
  - Critical controls:
    - Escalate chain when automated retries are exhausted.
    - Re-run CI / gate evaluations.
    - Pause/disable auto-merge for the PR.

### 3. Task (Chain) Queue Tab

**Purpose:** Central place to reason about queue health, stuck tasks, and quarantine; complements Dev-Bots tab.

- **Left Pane (Overview):**
  - Summary cards: queue depth, oldest task age, quarantined chains count.
  - Chain-aware task list:
    - Each row: task title, type, chain id, age, status.
    - Grouped or filterable by queue (implementation vs follow-up).
  - Queue controls (existing + new endpoints from designs):
    - Pause/resume queue.
    - Clear implementation tasks (with confirmation).
    - Clear follow-up tasks.

- **Right Pane (Detail):**
  - Selected task’s:
    - Last automation attempt summary (session summary + artifacts).
    - Linked PR, plan, and diagnostics (context management + foundational upgrades).
  - Interventions:
    - Quarantine chain.
    - Retry this task now (without changing queue config).
    - Open interactive session at task’s work-target.

### 4. Plans Tab

**Purpose:** Surface DB-backed plans from the integrated planning system, driven entirely by actual task/PR/chain state.

- **Left Pane (Overview):**
  - Summary cards: active plans, blocked plans, median progress.
  - Plans table:
    - Plan title, type, status (planning / in_progress / blocked / completed), percent complete.
    - Number of open blockers (PR + chains + tasks).

- **Right Pane (Detail):**
  - Selected plan’s:
    - Progress breakdown (tasks, PRs, chains) using the `PlanProgressCalculator` design.
    - Aggregated blockers (PRs, chains, tasks) with links into PR and Task Queue tabs.
    - Goals & scope boundaries (matching the design doc fields).
  - Controls:
    - Open plan markdown in docs.
    - Pause new tasks for plan (no new chains; existing chains complete).

### 5. Interactive Terminal Tab

**Purpose:** Dedicated view for manual interactive sessions, built on `useInteractiveSession` and existing terminal UI.

- **Left Pane (Overview):**
  - New sessions list:
    - Active + recent interactive sessions (owner, model, status, idle countdown).
    - Quick filter: `Active` / `Recent`.
  - “Start new session” control:
    - Model selector (reusing existing logic).
    - Clear indication of environment/work-target.

- **Right Pane (Detail):**
  - Terminal window for the selected session (reusing `InteractiveTerminal`).
  - Command input + hotkey hint summary.
  - Session metadata: owner, model, idle timeout, last heartbeat, work-target, environment.

---

## Implementation Steps

### Phase 1 – Layout & Navigation

1. **Introduce Layout Shell**
   - Create `DevMonitorShell` (or equivalent) that:
     - Renders header + global status strip.
     - Hosts top-level feature `Tabs` (shadcn `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`).
   - Wire into `AppContent` to replace the single `DevBotsTab` route.

2. **DualPaneLayout Component**
   - New shared component (e.g. `DualPaneLayout.tsx`) that:
     - Uses a responsive grid (`lg:grid-cols-[minmax(0,_5fr)_minmax(0,_7fr)]` or similar).
     - Accepts `left` and `right` React nodes.
     - Handles stacking on small screens and keyboard focus states.
   - Implement once, reuse in all tabs.

3. **Feature Flag Strategy**
   - Introduce a single feature flag (e.g. `VITE_FEATURE_TABBED_LAYOUT`) that:
     - Defaults to `true` in new environments.
     - Falls back to existing `DevBotsLayout` for staged rollout.
   - Keep routing changes behind this flag until e2e coverage is green.

### Phase 2 – Tab Content Components

4. **Dev-Bots Tab Refactor**
   - Extract chain list and worker summary from `DevBotsLayout` / `DevBotsPanel` into:
     - `DevBotsOverviewPane` (left) and `DevBotsChainDetailPane` (right).
   - Align data access with `devBotsStore` (no direct API calls in presentational components).
   - Remove redundant metrics that do not drive interventions.

5. **PR Tracking Tab**
   - Implement `PrTrackingOverviewPane` and `PrChainDetailPane`.
   - Integrate with existing PR tracking APIs/services from `pr-self-healing-and-resilience.md`:
     - Reuse types from shared contracts where available.
     - Keep UI read-only except for defined manual overrides (escalate, pause auto-merge, re-run evaluations).

6. **Task Queue Tab**
   - Implement `TaskQueueOverviewPane` and `TaskDetailPane` using data from `TaskQueueService` and WebSocket events.
   - Surface quarantine and retry endpoints (per dev-bot foundational upgrades + staged task queue).
   - Ensure queue controls are guarded with confirmation modals (shadcn `Dialog`).

7. **Plans Tab**
   - Implement `PlansOverviewPane` and `PlanDetailPane` aligned with the integrated planning system design:
     - Drive status from computed plan progress (no manual status editing).
     - Provide deep links into Task Queue and PR Tracking tabs.

8. **Interactive Terminal Tab**
   - Reuse `InteractiveSessionTab` internals but:
     - Extract session list into `InteractiveSessionsOverviewPane`.
     - Place terminal + metadata into `InteractiveTerminalDetailPane`.
   - Ensure existing `VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB` flag still gates all interactive features.

### Phase 3 – Deprecated Components & Cleanup

9. **Component De-duplication**
   - Once the tabbed layout is stable:
     - Deprecate and remove the legacy `DevBotsPanel` path and related UI variants that are no longer reachable.
     - Consolidate logic so dev-bots metrics are sourced exclusively via `devBotsStore` and shared hooks.
   - Clean up any leftover layout components or tab shells that predate the minimalist redesign.

10. **Dead Code Removal**
    - Re-scan `frontend/src/components` and `frontend/src/hooks` for:
      - Legacy service/log components that survived the earlier cleanup.
      - Old navigation or tab components that can be safely removed.
    - Remove any unused exports from `frontend/src/components/index.ts` and tab index files.

### Phase 4 – Testing & Hardening

11. **Unit & Integration Tests (Vitest + RTL)**
    - New test files:
      - `frontend/src/components/dev-bots/DevMonitorShell.test.tsx`
      - `frontend/src/components/dev-bots/DevBotsOverviewPane.test.tsx`
      - `frontend/src/components/pr/PrTrackingPanel.test.tsx`
      - `frontend/src/components/queue/TaskQueuePanelV2.test.tsx`
      - `frontend/src/components/plans/PlansPanel.test.tsx`
      - `frontend/src/components/interactive/InteractiveTerminalTab.test.tsx`
    - Focused assertions:
      - Correct rendering of summary metrics and binary states.
      - Selection flows: clicking a row updates the detail pane.
      - Interventions invoke the correct API client methods with expected payloads.

12. **WebSocket & Event Tests**
    - Extend or add tests for `useEnhancedSocket` / `devBotsStore`:
      - Verify that chain/task status events update overviews without reloading.
      - Ensure terminal session events propagate correctly into the Interactive Terminal tab.

13. **E2E Tests (Playwright)**
    - Update `frontend/e2e/navigation.spec.ts` to:
      - Assert presence and basic switching behavior for all new tabs.
      - Verify that dual-pane layout appears and responds to selection.
    - Add new e2e specs for critical flows:
      - Escalating a blocked PR from PR Tracking.
      - Quarantining a chain from Task Queue.
      - Starting and stopping an interactive session.

14. **Design QA & Accessibility**
    - Check:
      - Keyboard navigation between overview list and detail pane.
      - `aria-selected`, `aria-controls`, and roles for shadcn `Tabs` and list items.
      - Color contrast within the dark theme meets WCAG AA for key text and controls.

---

## Design & shadcn/ui Best Practices

- Prefer shadcn components (`Tabs`, `Card`, `Badge`, `Button`, `ScrollArea`, `Dialog`, `Table`) over bespoke primitives.
- Keep layout components small and composable; avoid files > 600 lines.
- Use container/presentational split:
  - Containers handle API calls, stores, and sockets.
  - Presentational components receive props and render with shadcn components.
- Maintain minimalist content:
  - Show counts and binary status (healthy/blocked/escalated), not charts or time-series graphs.
  - Keep copy short and action-oriented.

---

## Risks & Mitigations

- **Risk:** Navigation changes confuse existing users.
  - **Mitigation:** Stage behind `VITE_FEATURE_TABBED_LAYOUT`, update docs, and align e2e tests before flipping default.
- **Risk:** Overlapping responsibilities between Dev-Bots and Task Queue tabs.
  - **Mitigation:** Clearly document responsibilities; Dev-Bots for overall automation health, Task Queue for per-task triage.
- **Risk:** Test gaps after component reshuffle.
  - **Mitigation:** Require new unit + integration + e2e tests in the same PR; do not delete old tests until replacements land.

---

## Completion Criteria

- All five tabs implemented with dual-pane layouts and wired to real data.
- No references remain to legacy multi-purpose layouts or log/service monitoring features.
- New tests cover:
  - Tab navigation and selection flows.
  - Core interventions (escalate, quarantine, retry, start/stop sessions).
- Docs updated:
  - `docs/guides/FRONTEND_DEVELOPMENT.md` references new layout patterns.
  - This plan can be deleted once implementation is fully shipped.

