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

## Plan

### Phase 0 – Contract Definition (Week of Nov 10, 2025)
1. **Work-target path spec**  
   - Extend `backend/config/work-targets/app-monitor.json` with `paths.workRoot`, `paths.deployRoot`, `paths.artifactsRoot`, `paths.logs[]`.  
   - Mirror these fields in the upcoming SQLite schema (WT-1..WT-4).  
   - Document env fallbacks: `APP_MONITOR_ROOT`, `APP_MONITOR_DEPLOY_ROOT`, `APP_MONITOR_ARTIFACT_ROOT`.
2. **Resolver module**  
   - Add `WorkTargetPathResolver` (backend/service) that loads the JSON/SQLite row, validates env overrides, and exposes accessors.  
   - Wire into `config.ts` like other platform services so dependency injection stays consistent.

### Phase 1 – Dev-Bot Runtime Abstraction (Week of Nov 17, 2025)
1. **Backend updates**
   - `devBotsManager.ts`  
     - Replace `path.resolve(process.cwd(), '..')` with `WorkTargetPathResolver.getWorkRoot('app-monitor')`.  
     - Parameterize artifact directory (`paths.artifactsRoot/dev-bots`).  
     - Ensure `copyWorkspaceToContainer`, `captureUncommittedChanges`, and git ops all reference the resolved work-root (see callsites at `devBotsManager.ts:1327-2077`).
   - `workspaceOrchestrator.ts`  
     - Accept `workRoot` + `devBotsRoot` from resolver; default to env when not provided.  
     - Move temp mirror root under `${workRoot}/.dev-bot-mirror` or `/var/tmp/app-monitor-worktargets/<id>` to avoid assuming sibling folders.
   - `processManager.ts` service definition  
     - Pass resolver-provided paths into any scripts/commands that reference `../dev-bots`.
2. **Docker + scripts**
   - Introduce `.env.dev-bots` (or reuse registry) to declare `APP_MONITOR_WORK_ROOT`.  
   - Update `dev-bots/docker-compose*.yml` to mount `${APP_MONITOR_WORK_ROOT}` via bind mount instead of `./volumes`. Provide templated override for artifact/log volumes.  
   - Rewrite `setup-bot-volumes.sh` (or replace with `scripts/dev-bots/create-workspace.ts`) to accept `--work-root` flag; stop copying unrelated repos and instead sync from resolver target.

### Phase 2 – Production Bridge (Week of Nov 24, 2025)
1. **Process lifecycle**
   - Update `scripts/process-manager.sh` (and any systemd units) so the dev-bots service can start even when backend lives in `/opt/app-monitor/backend`, by exporting `APP_MONITOR_WORK_ROOT=/home/.../Development/app-monitor`.  
   - Ensure `sudo systemctl restart app-monitor-backend-prod` doesn’t clobber env; store overrides in `/etc/app-monitor/work-target.env`.
2. **Log + artifact routing**
   - Modify log tailers (LogSourceManager) to read path lists from work-target paths. Production logs keep pointing at `/opt/...`, dev-bot artifacts at the work root.  
   - Update observability docs so teams know where to fetch artifacts after a production bot run.

### Phase 3 – Validation & Automation Prep (Week of Dec 1, 2025)
1. **Regression tests**
   - Add integration test that launches `DevBotsManager` with a fake resolver path and asserts `docker run` uses the provided mount (capture args via dependency injection).  
   - Add CLI smoke test verifying `WorkTargetPathResolver` honors env overrides + SQLite values.
2. **Documentation**
   - Update `dev-bots/BOT_VOLUMES_SETUP.md` and `VOLUMES_PATH_MIGRATION_SUMMARY.md` to describe the new abstraction.  
   - Cross-link from `docs/plans/APP_MONITOR_STABILIZATION_PLAN.md` so the stabilization checklist references this plan instead of the deprecated worktree instructions.

---

## Deliverables & Exit Criteria
| Deliverable | Acceptance Criteria |
| --- | --- |
| Work-target path resolver | JSON + SQLite entries load into a single service; env overrides validated; surfaced via `/api/work-targets/app-monitor`. |
| Dev-bot runtime decoupling | `docker inspect` shows `/workspace` mounted from the declared work-root even when backend runs under `/opt`. |
| Updated scripts | `setup-bot-volumes.sh --work-root /home/jdubz/Development/app-monitor` works from any directory; docker-compose uses env vars, not relative `./volumes`. |
| Docs | `dev-bots` docs + `PRODUCTION_SETUP_QUICKSTART.md` explain how to set work-root in production, with links to this plan. |

---

## Risks & Mitigations
1. **Env/registry drift** – Add `backend/scripts/verify-config.js` check comparing declared roots vs. filesystem existence; fail CI if mismatched.
2. **Docker permission issues** – Document `chown` expectations for bind mounts so production service accounts can access `/home/.../Development/app-monitor`. If necessary, mount via read-only + rsync step.
3. **Artifact sprawl** – Moving artifacts outside the deploy directory requires new retention policy; add cron cleanup job scoped to `paths.artifactsRoot`.

---

## Open Questions
1. Should the resolver support multiple simultaneous work-targets for App Monitor (e.g., staging vs. prod) or is a single pointer enough for now?
2. Do we keep the old volume-copy workflow for bots when the work-root is remote (e.g., on another host), or should we introduce a lightweight rsync fallback?
3. How do we keep secrets synchronized between `/home/.../Development/app-monitor/.env` and the production env files without reintroducing coupling?

---

Once these steps land, dev-bots will consistently work from the contributor-owned repository, making production deployments to `/opt/app-monitor` safe without forfeiting the automation roadmap.
