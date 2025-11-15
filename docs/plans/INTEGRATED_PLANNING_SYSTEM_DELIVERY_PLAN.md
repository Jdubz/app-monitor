# Integrated Planning System Delivery Plan

**Version:** 0.1.0  
**Date:** 2025-11-15  
**Status:** Planning  
**Owner:** Platform Tooling  
**Upstream Design:**  
- `docs/technicalDesigns/integrated-planning-system.md`  
- `docs/technicalDesigns/integrated-planning-system-implementation-plan.md`  

---

## 1. Objective & Scope

**Objective:** Ship the database-backed **Integrated Planning System** so that plans are first-class entities, their status is **derived from real task/PR/chain state**, and the planning UI in App Monitor becomes the primary control surface for autonomous work.

**Scope:**
- Backend:
  - `plans` table and `plan_id` on tasks.
  - Plan-focused services (create/read/update + progress calculation).
  - Planning API endpoints exposed at `https://app-monitor.joshwentworth.com/api/dev-bots/plans`.
- Frontend:
  - Plans tab in the intervention console (dual-pane layout).
  - Surface computed plan status, progress, and blockers.
- Docs & lifecycle:
  - Plans in `docs/plans/` become **lightweight seeds**; source of truth lives in SQLite.

Out of scope: Historical analytics, archived plan history beyond what’s needed for intervention.

---

## 2. Feature Analysis (Plans System)

From the technical designs:

- Plans are **DB records** (`plans` table) with:
  - Identity and metadata (title, description, owner, plan_type, priority).
  - Links to docs via `markdown_ref`.
  - Derived lifecycle fields (`status`, `started_at`, `completed_at`, etc.).
- Tasks link to plans via `plan_id` (renamed from `parent_initiative`), with:
  - Existing fields used: `chain_id`, `pr_number`, blockers/risks.
  - Plan progress computed by aggregating tasks by status.
- Plan status is **computed**, never manually edited:
  - `planning`, `in_progress`, `blocked`, `completed`, `cancelled`.
  - Blocked if any linked chain is blocked.
  - Completed only when all tasks are done/cancelled.
- Planning API:
  - `POST /api/dev-bots/plans` – create plan from UI or markdown.
  - `GET /api/dev-bots/plans/:id` – full plan with computed progress and linked entities.
  - `GET /api/dev-bots/plans` – filterable list for overview.
  - `PATCH /api/dev-bots/plans/:id` – metadata updates only (status stays computed).
- UI:
  - Plans tab shows active plans, their progress, and blockers.
  - Detail pane shows progress breakdown, blockers, and links to PR/Task Queue/Dev-Bots views.

This plan turns that design into concrete delivery steps.

---

## 3. Implementation Phases

### Phase 1 – Schema & Persistence

**Goal:** Introduce DB schema for plans and link tasks to plans, without breaking existing behavior.

- **Tasks:**
  - Add migration `backend/migrations/020_plans_system.sql`:
    - Create `plans` table per design, with indexes on `status`, `priority`, and `plan_type`.
  - Extend task schema (via TaskQueueService / SQLite migrations):
    - Add nullable `plan_id TEXT` column on `tasks`.
    - Add partial index `idx_tasks_plan_id` on `plan_id IS NOT NULL`.
  - Wire migrations into `DevBotsDatabase.runMigrations`.
  - Update TypeScript types to replace `parent_initiative` with `plan_id` everywhere (keep backward compatibility reading existing field if present).
  - Write schema-level integration tests to verify migrations and foreign-key behavior.

### Phase 2 – Core Services

**Goal:** Implement small, focused services around plans, reusing existing metrics and queue logic.

- **Tasks:**
  - Implement `PlansService` (CRUD + validation; no business logic).
  - Implement `PlanTaskLinker` (link/unlink/query tasks by plan via `TaskQueueService`).
  - Implement `PlanProgressCalculator`:
    - Delegate to `TaskQueueMetricsService` and `ChainTrackerService`.
    - Compute `PlanProgress` and derived `PlanStatus`.
  - Implement `PlanStatusUpdater`:
    - Subscribe to existing task/chain events.
    - Trigger recomputation when relevant events fire.
  - Integrate all with `DevBotsManager` using existing service factory pattern.
  - Add unit tests for each new service (in-memory DB where applicable).

### Phase 3 – Planning API & Endpoint

**Goal:** Expose a stable planning endpoint on the production host.

- **Tasks:**
  - Add `backend/src/routes/dev-bots/plans.routes.ts` with:
    - `POST /api/dev-bots/plans`
    - `GET /api/dev-bots/plans`
    - `GET /api/dev-bots/plans/:id`
    - `PATCH /api/dev-bots/plans/:id`
    - Using existing `respondSuccess` / `respondError`, auth, and logging patterns.
  - Register routes in `backend/src/routes/dev-bots/index.ts`.
  - Update `shared/api-contracts` with plan DTO types.
  - Integration tests:
    - Route tests (Supertest) for the four endpoints.
    - Verify computed status is returned, not stored.
  - Verify endpoint is reachable in environments:
    - Staging: `https://app-monitor.joshwentworth.com/api/dev-bots/plans` (behind staging tunnel).
    - Production: same path, respecting existing auth.

### Phase 4 – Frontend Plans Tab

**Goal:** Add the Plans tab to the intervention console using shadcn components and the dual-pane layout.

- **Tasks:**
  - Implement `usePlans` hook that calls the new plans API.
  - Implement `PlansOverviewPane` (left):
    - List plans with status, progress %, and blocker counts.
    - Filters for status and priority.
  - Implement `PlanDetailPane` (right):
    - Show progress breakdown, blockers, goals/scope boundaries.
    - Deep links to PR Tracking and Task Queue tabs (using plan id).
  - Wire the Plans tab into the global tab shell:
    - Ensure dual-pane layout matches other feature tabs.
  - Add unit tests for the hook and both panes (loading, error, and happy-path states).

### Phase 5 – Docs, Lifecycle & Cleanup

**Goal:** Align documentation and deprecate markdown-only plan tracking.

- **Tasks:**
  - Update `docs/guides/FRONTEND_DEVELOPMENT.md` and relevant backend docs:
    - Document the plans API and UI usage.
    - Clarify that DB-backed plans are the source of truth; markdown plans are seeds.
  - For existing markdown plans in `docs/plans/`:
    - Create corresponding DB-backed plans via `POST /api/dev-bots/plans`.
    - Mark docs-level plans as “seeded” and plan to delete them once work is complete, per master design intent.
  - Remove any obsolete plan-related helper scripts or ad-hoc tracking once the integrated system is live.

---

## 4. Acceptance Criteria

Backend:
- `plans` table exists with indexes, and `tasks.plan_id` is populated for new plan-linked tasks.
- `PlansService`, `PlanProgressCalculator`, `PlanTaskLinker`, and `PlanStatusUpdater` are covered by unit tests.
- Planning endpoint:
  - `https://app-monitor.joshwentworth.com/api/dev-bots/plans` responds with authenticated `GET` in staging and production.
  - `POST /api/dev-bots/plans` creates records; `GET` returns computed status + progress.

Frontend:
- Plans tab appears alongside Dev-Bots, PR Tracking, Task Queue, and Interactive Terminal.
- Selecting a plan in the left pane updates the right pane detail view without a full-page reload.
- From a plan detail, operators can jump to the relevant PR and queue views for interventions.

Process & Docs:
- At least one existing markdown plan is represented as a DB-backed plan and visible in the UI.
- Documentation clearly states that DB is the source of truth for plan status.

---

## 5. Risks & Mitigations

- **Risk:** Divergence between markdown docs and DB-backed plans.
  - **Mitigation:** Treat markdown as optional metadata; enforce status as DB-only and plan a one-time seeding step.
- **Risk:** Additional load on existing task/chain services.
  - **Mitigation:** Use indexed queries and reuse existing metrics services; keep calculations simple and memoized where needed.
- **Risk:** UI complexity in the Plans tab.
  - **Mitigation:** Reuse patterns from `TaskQueuePanel` and `ChainStatusPanel`; keep layout minimal, no charts or historical graphs.

---

## 6. Next Actions

1. Implement Phase 1 schema migrations and tests.  
2. Implement Phase 2 services and wire into `DevBotsManager`.  
3. Stand up the planning endpoint at `/api/dev-bots/plans` and validate in staging.  
4. Build and test the Plans tab UI.  
5. Seed one or more existing markdown plans into the new system and validate end-to-end.  

