# Dev-Bot Context Management Design

## Document Metadata

| Field | Value |
|-------|-------|
| **Author** | Codex Agent (per architecture owner direction) |
| **Date** | November 12, 2025 |
| **Status** | 🟡 Draft |
| **Priority** | P2 |
| **Dependencies** | Staged Task Queue (P0), Dev-Bot Foundational Upgrades (P1) |
| **Last Updated** | November 12, 2025 |

## Quick Reference

**What**: Provide dev-bots with accurate, up-to-date context bundles (documentation, operations guides, PR workflows) dynamically generated from repo state and injected into containers at task launch.

**Why**: Eliminates stale context, manual sync work, and improves dev-bot accuracy by ensuring agents always have current system knowledge.

**Implementation Status**: Not started (pending P0/P1 dependencies)

## Table of Contents

1. [Vision](#vision)
2. [Requirements](#requirements)
3. [Context Domains](#context-domains)
4. [Architecture](#architecture)
5. [Task Flow](#task-flow)
6. [Success Criteria](#success-criteria)
7. [Testing Strategy](#testing-strategy)
8. [Related Files](#related-files)

## Vision
Provide every dev-bot task with accurate, up-to-date context (documentation, operational guides, deployment details, PR workflows, failure recovery, self-healing patterns, learning data, dev-monitor UI behavior, etc.) inside the container at task launch—without relying on stale, manually curated snippets.

## Requirements
1. **Per-Container Context Bundles:** On task launch, copy a curated context bundle into the dev-bot container so the agent can reference system knowledge locally.
2. **Programmatic Generation (Preferred):** Whenever possible, generate context on demand from the current repo state (e.g., render markdown summaries, extract code snippets, compile API references). This keeps context evergreen and avoids manual sync work.
3. **Fallback Capture:** When dynamic generation isn’t feasible, capture context snapshots (markdown/JSON) that update automatically when source files change.
4. **Task-Type Awareness:** Context bundles must reflect task intent (documentation, deployment, PR tracker, failure recovery, dev-monitor frontend, etc.). Work-target awareness is a future requirement but not needed for v1.
5. **Chain Integration:** REVIEW/FIX tasks should inherit or augment context with outputs from previous attempts (diffs, verification results, review notes) to avoid repeating work.
6. **Schema Alignment:** Implement the storage plan from `DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md`/`PRIORITIZED_FEATURE_ROADMAP.md` by adding a `task_context` JSON column plus supporting tables (`task_artifacts`, `task_logs`, `task_network_events`, `task_automation_runs`) so context bundles and artifacts can be persisted and audited.
7. **API Support:** Extend task creation/update APIs to accept optional context payloads, matching the task-context submission schema defined in `APP_MONITOR_STABILIZATION_PLAN.md` (environment snapshots, logs, network events, artifact references).

## Context Domains
| Domain | Source Examples | Notes |
|--------|-----------------|-------|
| Documentation & Architecture | `docs/architecture/*`, `docs/technicalDesigns/*` | Convert key sections to structured snippets (e.g., JSON or markdown segments).|
| Deployment & Operations | `docs/plans/APP_MONITOR_PRODUCTION_SUPPORT_PLAN.md`, scripts under `scripts/` | Include commands, environment variables, runbooks.|
| PR Tracking & Workflow | `docs/plans/PR_*`, `backend/src/services/pr*` | Summaries of condition gates, Copilot delegation rules, chain tracking.|
| Failure Recovery & Self-Healing | `docs/architecture/automatic-failure-recovery.md`, `failure-guards.md`, healing plans | Provide cleanup/follow-up rules, forbidden ops, chain depth limits.|
| Learning & Process Improvements | `docs/plans/DEV_BOT_PIPELINE_*`, `ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md` | Outline review/fix chain, REVIEW payload requirements.|
| Dev-Monitor Frontend | `docs/architecture/dev-monitor-architecture.md`, `frontend/src` docs | Describe UI expectations, Socket.IO events, admin workflows.|
| Deployment Targets & Work Targets | `docs/plans/DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md` | Future versions must tailor context per work-target.|

## Alignment with Existing Plans
- **DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md:** Defines persistence requirements (`task_context`, `task_artifacts`, `task_automation_runs`) and artifact summaries—this design adopts those schema changes and extends them to dynamic generation.
- **PRIORITIZED_FEATURE_ROADMAP.md:** Calls for task-context capture APIs, validation, and dashboard display; the context builder + SQLite persistence fulfills those acceptance criteria.
- **APP_MONITOR_STABILIZATION_PLAN.md:** Introduces task-context submission schemas (environment snapshot, logs, artifacts); API support and recipes must honor that schema.
- **ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md:** Needs REVIEW chain history; chain-context persistence ensures each follow-up task sees prior attempts.
- **DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md:** Specifies work-target metadata; v2 of this system will plug context recipes into those abstractions to scope content per target.

## Architecture
1. **Context Recipes:** YAML/JSON definitions describing how to compile context for each domain (source paths, transforms, filters).
2. **Context Builder CLI:** Node/TS script (`scripts/build-context.ts`) that reads recipes, pulls content from the repo, transforms it (e.g., markdown → plain text, code snippets, structured JSON), and outputs bundles (e.g., `artifacts/context/<taskType>.json`).
3. **Container Injection:** `TaskExecutionService` copies the relevant context bundle(s) into the container (e.g., `/workspace/context/<domain>.json`) before running the agent.
4. **Dynamic Regeneration:** Context builder runs automatically when tasks start or via preflight step so bundles represent the latest code/documentation.
5. **Snapshot Cache (optional):** If generation is expensive, cache results keyed by git commit hash and invalidate when source files change.
6. **SQLite Persistence:** When bundles are generated, persist metadata into `task_context`, `task_artifacts`, and `task_network_events` so the REVIEW chain and dev-monitor can retrieve historical context.

## Task Flow
1. Task assigned → determine `task_type` / metadata.
2. Load recipe(s) matching `task_type` and generic domains.
3. Build context bundle(s) programmatically.
4. Copy context into container (read-only volume).
5. Include metadata references in the agent prompt (e.g., “Relevant context files: `/workspace/context/pr-workflow.md`).
6. Persist context metadata and artifact paths into SQLite per the schema additions so follow-up tasks and UI surfaces can pull the same context set.

## Follow-Up & Chain Context
- Store outputs from each REVIEW/FIX/COMPLETE attempt (diff summaries, verification results, review notes) as part of the chain context.
- When a new follow-up task starts, merge static context (docs, code references) with dynamic chain context (attempt history).
- Provide APIs for dev-monitor to display chain context for debugging.

## Automation Opportunities
- Integrate with existing plans (e.g., `DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md`, `APP_MONITOR_STABILIZATION_PLAN.md`) by referencing their sections inside recipes.
- Use markdown parsing + heading anchors to extract only the relevant sections for each domain, reducing noise.
- Optionally run code analyzers (e.g., `tsdoc`/`typedoc`) to generate API summaries for inclusion in context bundles.
- Reuse the artifact registration + cleanup pipeline from the completion plan so every generated context file is tracked (size, hash, retention).
- Emit analytics events (bundle generated, consumed, invalidated) to populate the metrics envisioned in `PRIORITIZED_FEATURE_ROADMAP.md`.

## Open Questions
1. How granular should recipes be (per task type vs per domain)?
2. What retention policy should govern persisted bundles (reuse artifact cleanup job vs context-specific TTL)?
3. How to handle context size limits (agent token budgets) while ensuring necessary depth?
4. How will work-target awareness integrate in v2 (different repos, envs)?
5. Should dev-monitor expose raw stored context via the task detail view or only summarized snippets?

## Next Steps
1. Define initial recipes covering critical domains (deployment, PR workflow, failure recovery, dev-monitor).
2. Implement context builder CLI + caching.
3. Update TaskExecutionService to invoke builder and mount context bundles.
4. Extend REVIEW pipeline to record chain context artifacts.
5. Instrument dev-monitor to display context sources per task/chain.
