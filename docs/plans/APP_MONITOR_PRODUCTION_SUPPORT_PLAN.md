# App Monitor Production Support Plan

**Version:** 0.1.0  
**Last Updated:** November 7, 2025  
**Owner:** Platform Tooling (Production Enablement)  
**Status:** Draft for implementation

---

## Purpose & Scope
App Monitor needs a production-grade deployment that keeps automation safe while aligning with the long-term architecture goals from the capability roadmap (Stabilize → POC → Autonomy). The current scripts in `../../app-monitor-deployment/` assume the code executes from the same directory as the work-target (`/home/.../Development/app-monitor`). Production, however, must live under `/opt/app-monitor` (or another hardened path), while the work-target for dev-bots and task planning stays rooted in this repository. This plan introduces a clear work-target abstraction, deployment workflow, and observability posture so the platform can support production traffic without regressing the roadmap priorities.

---

## Architectural Alignment
| Roadmap Lane | Contribution of this Plan |
| --- | --- |
| **Work-Target Intelligence (Stabilize → POC)** | Adds explicit `work_root`, `deploy_root`, and `artifact_root` fields to the registry/SQLite schema so automation and humans know where to run vs. where to deploy. Unlocks per-target smoke tests and performance tracking. |
| **Service Orchestration & Control** | Ensures ProcessManager/start-stop flows operate against systemd-managed services in production while dev-bot orchestration stays bound to the work-target workspace. |
| **Logging & Observability** | Defines journalctl/file collectors per root, wiring production logs into App Monitor without requiring the repo to live beside runtime artifacts. |
| **Task Context & Automation** | Keeps dev-bot containers mounting the work-target root (this repo) while deployment scripts promote vetted artifacts to production, preserving isolation and enabling future autonomous healing loops. |

---

## Current State Snapshot
- **Repositories & scripts**: `app-monitor` (work-target), `../../app-monitor-deployment` (setup/deploy/cleanup) plus systemd unit files.
- **Runtime expectation**: `deploy.sh` builds in-place under `/opt/app-monitor` after cloning `main`. `setup-production.sh` assumes relative paths from the script location and does not expose a work-target vs. production split.
- **Config**: `backend/config/work-targets/app-monitor.json` uses `defaultRoot="../../.."` and `projectRootEnv=APP_MONITOR_ROOT`, but the rest of the stack still references the old `job-finder-app-manager` layout (see `backend/scripts/verify-config.js`).
- **Gaps**:
  1. Volume mounts and scripts use relative paths tied to this repo’s location, so production cannot live elsewhere without manual edits.
  2. No registry field distinguishes “where the bots work” from “where production code runs,” blocking work-target intelligence goals.
  3. Deployment scripts lack smoke tests, artifact caching, and rollback hooks aligned with stabilization milestones.

---

## Strategy Overview
1. **Three-root model**
   - `work_root`: absolute path to this repository (bots + humans). Exported via `APP_MONITOR_ROOT` for now, promoted to SQLite once WT migrations land.
   - `deploy_root`: hardened runtime location (default `/opt/app-monitor`) managed by systemd. Stored as `APP_MONITOR_DEPLOY_ROOT` env + registry column.
   - `artifact_root`: build cache / release bundle directory (e.g., `/var/lib/app-monitor-artifacts`) used to hand off tarballs between the two roots.
2. **Deterministic handoff**: CI/bots build under `work_root`, archive artifacts, push to `artifact_root`, and let the deploy script rsync/extract into `deploy_root` before restarting services.
3. **Path-aware automation**: dev-bot bootstrap + volume mounts always reference `work_root`, while production observability hooks refer to `deploy_root`, preventing assumptions about relative paths.
4. **Progressive enablement**: Deliver Stabilize items first (path abstraction, deploy hygiene), then layer POC work (smoke tests, observability), and finally Autonomy (self-healing + queue awareness).

---

## Workstreams & Milestones
### 1. Work-Target Abstraction (Stabilize)
- Define env contract: `APP_MONITOR_ROOT` (work), `APP_MONITOR_DEPLOY_ROOT`, `APP_MONITOR_ARTIFACT_ROOT` with documented defaults.
- Update `backend/config/work-targets/app-monitor.json` + upcoming SQLite schema to include `paths.workRoot`, `paths.deployRoot`, `paths.artifactRoot`, and `paths.logs[]` entries.
- Patch `backend/scripts/verify-config.js` (and any ProcessManager callers) to resolve paths via the registry/env rather than hard-coded `app-monitor/...` segments.
- Document the new contract in `docs/dev-monitor/` and link from the capability roadmap.

### 2. Deployment Pipeline Hardening (Stabilize)
- Convert `../../app-monitor-deployment/setup-production*.sh` to accept `--deploy-root`, `--artifact-root`, and `--source-root` flags (defaults read from env/registry).
- Ensure the scripts no longer compute `SOURCE_DIR` via `../..`; instead, they should clone from Git or consume prepared artifacts.
- Add artifact packaging step: `npm ci && npm run build` under `work_root`, tar backend `dist/` + frontend `dist/` + version metadata, store in `artifact_root` with checksum.
- Update `deploy.sh` to:
  1. Fetch artifact (or perform shallow clone) into a temp dir under `artifact_root`.
  2. Rsync into `deploy_root`, preserving `node_modules` caches if desired.
  3. Run `npm ci` only when lockfiles change to keep downtime low.
- Incorporate pre/post deploy hooks (smoke test command configurable per work-target once registry migration finishes).

### 3. Runtime Observability & Recovery (POC)
- Extend systemd units to source a dedicated env file (e.g., `/etc/app-monitor/backend.env`) that references `deploy_root` and log directories explicitly.
- Configure journalctl scraping or filebeat/logtail so App Monitor ingests production logs by referencing `deploy_root/logs/*.log` without mounting the repo.
- Add health checks + `process-manager` definitions for production services, keyed by work-target ID, enabling remote restart commands without SSHing in.
- Document rollback: maintain `artifact_root/releases/<timestamp>` with symlinks so `cleanup-production.sh` can roll back to the previous build instead of deleting everything.

### 4. Automation & Registry Integration (POC → Autonomy)
- Once the SQLite work-target registry (WT-1..WT-4) ships, add columns for `work_root`, `deploy_root`, `artifact_root`, `smoke_test_cmd`, and `deploy_strategy`.
- Update Dev-Bot workspace orchestrator to consume `work_root` when creating mirrors and to mount only that directory (tar | docker cp already available per stabilization notes).
- Feed deploy + smoke-test status back into the task queue so automation can open stabilization tickets automatically when a deploy or post-deploy check fails.
- Define guardrails so autonomous deploys require: green smoke tests, artifact checksum match, and registry opt-in flag per work-target.

### 5. Governance, Docs, and Runbooks (Cross-cutting)
- Publish a runbook covering setup, deploy, rollback, log inspection, and incident response referencing the three-root model.
- Update `docs/plans/APP_MONITOR_STABILIZATION_PLAN.md` checklist items to reflect the production prerequisites (env vars, artifact cache, smoke tests).
- Ensure `PRODUCTION_SETUP_QUICKSTART.md` links to this plan and the work-target registry instructions so onboarding remains single-sourced.

---

## Deliverable Timeline (Target)
| Phase | Target Date | Exit Criteria |
| --- | --- | --- |
| **Stabilize (Weeks 1-2)** | Nov 21, 2025 | Env vars + registry fields defined, setup/deploy scripts honor new flags, systemd units point to `deploy_root`, documentation updated. |
| **POC (Weeks 3-4)** | Dec 5, 2025 | Artifact cache online, smoke tests per deploy, observability + rollback flow documented, initial registry integration complete. |
| **Autonomy Prep (Weeks 5-6)** | Dec 19, 2025 | Dev-bot pipeline consuming registry paths, deploy outcomes feeding the task queue, opt-in autonomous deploy guardrails in place. |

---

## Risks & Mitigations
1. **Path drift between env vars and registry** – add validation in `verify-config` and CI to fail if paths disagree; expose current roots in the UI for quick inspection.
2. **Incomplete cleanup of legacy relative paths** – schedule a code search ticket (post-Stabilize) to remove `app-monitor/` prefixed references, backed by lint rule or TypeScript helper.
3. **Deployment rollback complexity** – require `artifact_root` to keep at least two releases and add `deploy.sh --rollback <version>` before enabling autonomous deploys.
4. **Volume mounts missing credentials** – reuse the documented ephemeral container pattern (tar | docker cp, credentials mounted from `/tmp/host-claude-credentials.json`) so work-target separation does not break dev-bot safety mechanisms.

---

## Open Questions
- Should artifacts be built only on CI or can authorized humans run `scripts/production/build-artifact.ts` locally? Decide before POC.
- Do we need a separate secrets store per root (e.g., `APP_MONITOR_SECRETS_DIR`) to keep `.env` files out of the repo and out of `/opt` backups?
- What level of automation should trigger production deploys (manual approval, bot-initiated, or continuous) once the task queue is live?

---

This plan makes the work-target abstraction explicit, lets the existing deployment scripts mature into a safe production workflow, and keeps the strategy synchronized with the roadmap’s long-term architecture goals.
