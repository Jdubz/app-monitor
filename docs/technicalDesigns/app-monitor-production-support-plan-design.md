# APP_MONITOR_PRODUCTION_SUPPORT_PLAN Technical Design

**Source Plan:** docs/plans/APP_MONITOR_PRODUCTION_SUPPORT_PLAN.md
**Status:** Partial
**Outstanding Focus:** Define/enforce APP_MONITOR_ROOT/DEPLOY_ROOT/ARTIFACT_ROOT env contracts + zero-downtime deploy workflow.

## Objectives
- Define/enforce APP_MONITOR_ROOT/DEPLOY_ROOT/ARTIFACT_ROOT env contracts + zero-downtime deploy workflow.

## Plan Snapshot

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
