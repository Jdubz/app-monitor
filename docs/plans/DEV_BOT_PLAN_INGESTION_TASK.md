# Dev-Bot Plan Ingestion Automation

**Status:** Draft for implementation  
**Last Updated:** November 9, 2025  
**Owner:** Platform Tooling

---

## Problem Statement

Task backlog quality drops whenever the dev-bot queue runs dry. Our “plans” live as Markdown files under `docs/plans/`, so they are rich in context but hard to translate into actionable tasks. Completion state constantly drifts because plan sections never reconcile with the real TaskQueueManager. We need an autonomous ingestion task that:

1. Triggers when the queue is low (no cron).  
2. Reads plans, extracts prioritized work, and creates dev-bot-ready tasks.  
3. Keeps plans, queue state, and completion tracking in sync.

---

## Trigger & Flow Overview

| Stage | Description |
| --- | --- |
| 1. Low Queue Event | TaskQueueManager emits `queue.low` when pending+active < configurable threshold (default **3**) for ≥1 minute. |
| 2. Plan Ingestion Task | Coordinator automatically enqueues a `plan-ingestion` task assigned to Documentation Specialist (Morgan) paired with the relevant specialist (based on plan domain). |
| 3. Plan Parsing | Task receives a list of plan files, global priority rules, and current task telemetry. It parses structured metadata (see “Plan Schema” below). |
| 4. Task Proposal Generation | Task produces a batch of proposed work items with priority, acceptance criteria, and recommended owner persona. |
| 5. Auto-Creation + Review | Proposals are inserted directly (no human approval); humans only revisit plans during upstream planning. |
| 6. Completion Sync | When a generated task reaches `completed`, the coordinator writes back status markers to the source plan (front-matter + SQLite row), keeping plans current. |

---

## Plan Schema Modernization

Current Markdown lacks machine-friendly metadata. Adopt lightweight front-matter + inline anchors that tools can parse without breaking human readability.

```markdown
---
id: PLAN-PR-GATEKEEPER
priority: high
swimlane: quality
milestone: stabilization-v0.2
owner: platform-tooling
dependencies:
  - TASK-QUEUE-REFACTOR
---
```

Each actionable section gets subheadings with checklist items (each checkbox must include an `@swimlane:<name>` tag so the ingestion task can route work without enforcing one-plan-per-swimlane):

```markdown
### Action: Enforce Gatekeeper Chain
- [ ] Define webhook label schema @owner:platform-tooling @eta:2025-11-12
- [ ] Implement chained task insertion @owner:backend @eta:2025-11-14
```

Parsing strategy:
- Use `gray-matter` (Node) to parse front-matter.  
- Walk Markdown AST (via `remark`) to find `### Action` blocks and checkboxes.  
- Validate that each unchecked box declares `@swimlane`; default to the plan-level swimlane if explicit tag missing.  
- Emit normalized objects `{id, priority, swimlane, checklist[], dependencies}`.

---

## Priority & Task Creation Logic

1. **Global Priority Rules:**  
   - Map front-matter `priority` + `milestone` into queue priority (`urgent`, `high`, etc.).  
   - Use swimlane to select agent persona (e.g., `quality` → Casey + Jules, `devops` → Jordan).

2. **Heuristics:**  
   - Favor actions with unchecked boxes and past-due `@eta`.  
   - Skip actions already linked to active tasks (tracked through the completion registry).  
   - If multiple plans compete, weight by milestone proximity and dependency readiness.

3. **Output Payload:**  
   - Title, description, acceptance criteria (derived from checklist text), expected artifacts, blocking dependencies, suggested persona, and references to plan/line numbers for traceability.

---

## Completion Tracking Upgrade

1. **Structured Registry:**  
   - Create `plan_actions` table (or JSON file) keyed by `planId + actionId`.  
   - Columns: `status`, `taskId`, `lastSyncedAt`, `eta`, `owner`, `notes`.  
   - Update on task creation and completion via `claudeWorkersManager`.

2. **Bidirectional Sync:**  
   - On task completion, run a lightweight updater that toggles the corresponding Markdown checkbox and appends a completion note (with date + taskId).  
   - For manual edits to plans, a git hook or periodic lint script can verify the registry entries still exist.

---

## Library / Platform Options

| Option | Pros | Cons | Recommendation |
| --- | --- | --- | --- |
| **Custom Markdown + SQLite (baseline)** | Zero external deps, matches existing workflow, keeps data in repo | Requires building parser + UI, harder cross-repo visualization | ✅ Primary path: implement front-matter, PlanRepository, registry sync now |
| **Notion / Coda API** | Rich UI, drag-and-drop prioritization, built-in views and reminders | Vendor lock-in, API rate limits, secret management, harder offline work | Consider as future sync target if PM stakeholders demand their UI |
| **Linear / Height API** | Strong dev-centric planning, GraphQL API, first-class status tracking | Requires syncing repos↔SaaS, cost, limited offline | Revisit only if team already committed to one of these tools |
| **Plane / Planka (self-hosted)** | Open-source, kanban + timelines, API access | Additional infra to maintain, user auth overhead | Keep as contingency for self-hosted UI needs |

**Decision:** ship the custom Markdown + SQLite approach immediately, then encapsulate plan access behind a `PlanRepository` so we can bolt on Notion/Linear/etc. later without touching the ingestion task logic. If/when we adopt an external system, we will reassess whether Markdown mirroring is required.

---

## Implementation Phases

1. **Schema Upgrade**
   - Add front-matter + action checklists (with `@swimlane` tags) to top priority plans.
   - Build lint script (`npm run lint:plans`) to ensure required metadata exists and that every unchecked action declares `@swimlane`, `@eta`, and acceptance criteria.

2. **Registry & Parser**
   - Implement `PlanRepository` service that indexes Markdown -> structured objects and syncs with SQLite.
   - Expose `GET /api/plans` for dashboards to visualize ingestible work.

3. **Plan Ingestion Task**
   - Extend coordinator to emit `queue.low` (default threshold 3, configurable per environment).
   - Create `plan-ingestion` task template that runs parser, selects actions, and posts proposals to TaskBridge automatically (no manual approval stage).
   - Add learning hooks so the system remembers which generated tasks were accepted/rejected.

4. **Completion Sync**
   - On task completion, update `plan_actions` status + Markdown checkboxes automatically.
   - Provide UI indicators showing plan freshness (e.g., “Synced 2h ago”).

5. **Optional External Integrations**
   - Abstract `PlanRepository` so future connectors (Notion, Linear) can feed the same ingestion pipeline without reworking triggers.

---

## Open Items

- Decide on Markdown mirroring policy if an external planning tool is adopted later.

---

Delivering this ingestion task keeps dev-bots busy with high-priority work, modernizes plan metadata, and finally aligns planning docs with actual execution reality.
