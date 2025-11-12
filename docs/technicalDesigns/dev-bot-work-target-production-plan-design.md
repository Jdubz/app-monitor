# DEV_BOT_WORK_TARGET_PRODUCTION_PLAN Technical Design

**Source Plan:** docs/plans/DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md
**Status:** Partial
**Outstanding Focus:** Add deploy/artifact root handling + documentation sync.

## Objectives
- Add deploy/artifact root handling + documentation sync.

## Plan Snapshot

# Dev-Bot Work-Target Production Plan

**Version:** 0.1.0  
**Last Updated:** November 7, 2025  
**Owner:** Platform Tooling (Dev-Bot Enablement)  
**Status:** Draft for implementation

---

## Purpose
Ensure the dev-bot system treats `/home/jdubz/Development/app-monitor` as the canonical **work-target** while the production deployable lives elsewhere (e.g., `/opt/app-monitor`). Today the whole stack assumes repo + runtime share a filesystem (relative `../..` paths, inline volume copies, etc.), which blocks deploying production code to a separate directory. This plan narrows scope to the dev-bot + work-target abstraction work required to make production support viable without rewriting the deployment scripts.

---

## Architectural Alignment
| Capability Roadmap Lane | How this plan contributes |
| --- | --- |
| **Work-Target Intelligence (Stabilize)** | Codifies `work_root` vs. `deploy_root` in the registry/env so bots know where to operate irrespective of production paths. |
| **Service Orchestration & Control** | Lets ProcessManager start/stop dev-bots while pointing Docker volumes at the real work-target, not wherever the backend binary is running. |
| **Task Context & Automation** | Keeps the automation loop grounded in the repo copy humans use, satisfying the stabilization plan’s guarantees before turning on the continuous queue. |

References: `docs/plans/APP_MONITOR_CAPABILITY_ROADMAP.md`, `docs/plans/APP_MONITOR_STABILIZATION_PLAN.md`.

---

## Current Coupling (Evidence)
1. **Backend hard-codes repoRoot** – `devBotsManager` resolves `repoRoot = path.resolve(process.cwd(), '..')` and then mounts it into Docker (`-v ${repoRoot}:/workspace`) plus saves artifacts under `process.cwd()/dev-bots/artifacts` (see `backend/src/services/devBotsManager.ts:1327-1400,1469`), so whichever directory runs the backend becomes the bot workspace.
2. **Workspace orchestration assumes sibling folders** – `WorkspaceOrchestrator` defaults `devBotsRoot = path.resolve(process.cwd(), '../dev-bots')` and mirrors into `/tmp/app-monitor-dev-bots/...` (see `backend/src/services/workspaceOrchestrator.ts:43-65`). If the backend binary runs from `/opt/app-monitor/backend`, the orchestrator looks for `/opt/app-monitor/dev-bots`, not the real work-target.
3. **Docker/volume scripts are relative** – `dev-bots/docker-compose.yml` mounts `./volumes/bot-a:/workspace` and builds with context `../../`, meaning it expects to be invoked from inside the repo tree. `dev-bots/setup-bot-volumes.sh` derives `WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"` and refuses to run unless Job Finder repos exist there.
4. **Process + docs still mention legacy topology** – `backend/scripts/verify-config.js` and `dev-bots/REPO_STRUCTURE.md` reference `job-finder-app-manager` siblings, proving no abstraction exists for diverging work/deploy roots.

---

## Goals
1. Bots always work from the contributor-managed tree (`/home/jdubz/Development/app-monitor`) regardless of where backend/frontend executables live.
2. Production deploy scripts can install to `/opt/app-monitor` without breaking dev-bot automation, log ingestion, or ProcessManager controls.
3. Work-target metadata (env + future SQLite tables) capture the work/deploy/volume/artifact roots so other capabilities (smoke tests, task context) reuse the same abstraction.

---



## Requirements
- Refer to the source plan for full requirement breakdown; key deliverables must satisfy the outstanding focus above.

## Architecture Considerations
- Define system boundaries, data flows, and integrations described in the plan.
- Ensure compatibility with the updated master design intent.

## Implementation Steps
1. Review the source plan sections relevant to this feature.
2. Break work into milestones (schema, services, UI, telemetry, etc.).
3. Update dev-monitor visibility and automation hooks as needed.
4. Add automated tests per subsystem.

## Open Questions
- Identify unresolved decisions noted in the plan.
- Capture new questions discovered during implementation.

## Next Actions
- Schedule design review with architecture owners.
- Flesh out detailed sub-designs (schema, API, UI) as required.
- Create execution tickets once this design is ratified.
