# App Monitor Migration Status — 2025-11-03

## High-Level Summary
- `app-monitor` now operates as a standalone npm workspace with backend, frontend, and dev-bot packages managed from the root `package.json`, replacing the historical job-finder monorepo coupling.【app-monitor/package.json:1】
- All job-finder application repos continue to build independently; code references to App Monitor were removed with only legacy comments remaining (e.g. CloudLogger notes for local logging).【job-finder/job-finder-FE/src/services/logging/CloudLogger.ts:336】
- Cross-repo coordination persists through sibling-directory assumptions: shared shell helpers derive job-finder paths from the parent directory and log sources read directly from those locations.【app-monitor/scripts/common/repo-paths.sh:4】【app-monitor/backend/config/log-sources.json:22】
- The requirements brief in `docs/dev-monitor` confirms the split completed in October 2025 and that Phase 1–2 deliverables are live, with later enhancement issues tracked separately.【app-monitor/docs/dev-monitor/DEV_MONITOR_REQUIREMENTS.md:1】
- The working tree contains extensive staged and untracked documentation/automation updates (CI workflow, safety guides, issue backlogs) that have not yet been reconciled with `staging`. Coordinate ownership before publishing further changes.

```
$ git status -sb (abridged)
## staging...origin/staging
 M .github/workflows/ci.yml
 M CLEANUP_SCHEDULER_ANALYSIS.md
 ...
?? docs/dev-monitor/APP_MONITOR_TESTING_QUICKSTART.md
?? docs/issues/
```

## Current Architecture Snapshot
- **Workspace layout** – Root npm config enumerates `backend`, `frontend`, and `dev-bots` packages; lint-staged hooks run per workspace to maintain consistency across the split repositories.【app-monitor/package.json:1】
- **Process orchestration** – Shared helper `repo-paths.sh` computes job-finder directories relative to the parent folder so App Monitor scripts keep working when repos live side-by-side rather than nested.【app-monitor/scripts/common/repo-paths.sh:4】
- **Log ingestion** – `backend/config/log-sources.json` tails logs from sibling job-finder services via relative paths and exposes env overrides for future decoupling (e.g., `JOB_FINDER_BE_LOG_PATH`).【app-monitor/backend/config/log-sources.json:22】
- **Automation** – Dedicated CI pipeline (`.github/workflows/ci.yml`) now runs lint/tests for both frontend and backend against Node 18.x/20.x matrices, reflecting the repo’s new independence.【app-monitor/.github/workflows/ci.yml:1】

## Integration Touchpoints with Job Finder
- Job Finder repositories are now discrete git projects (`job-finder-BE`, `job-finder-FE`, `job-finder-worker`, `job-finder-shared-types`) with no embedded App Monitor source directories.
- Remaining references inside job-finder are informational only—e.g., the CloudLogger comment explaining that runtime logs are collected by the external App Monitor tool.【job-finder/job-finder-FE/src/services/logging/CloudLogger.ts:336】
- App Monitor scripts still assume the sibling repo layout; relocating any repo will require updating `repo-paths.sh` and log source config together.【app-monitor/scripts/common/repo-paths.sh:4】【app-monitor/backend/config/log-sources.json:22】

## Outstanding Gaps Observed
- **Uncommitted backlog** – Numerous docs, safety guides, and new planning issues remain untracked under `docs/`. Decide which should live in this repo versus a shared documentation hub before committing (see `git status` excerpt above).
- **CI/task alignment** – `APP_MONITOR-FIX-2` still tracks “Add CI/CD Workflow (Optional)” even though a workflow file exists; update or close the issue to reflect the new automation state.【app-monitor/docs/issues/app-monitor-fix-2-ci-cd-workflow.md:1】【app-monitor/.github/workflows/ci.yml:1】
- **Cross-repo docs** – Several job-finder documentation pages still reference the old embedded layout (e.g., structured logging guides). Refresh them to point at `app-monitor` as an external dependency.
- **Path fragility** – Hardcoded `../../../job-finder-*` log paths work only when repos are siblings. Consider environment-based configuration or a bootstrap script to detect relocations.

## Suggested Next Steps
1. Reconcile and commit (or archive) the outstanding documentation/issue files so the `staging` branch reflects the new repo state.
2. Audit job-finder documentation for residual “in-repo” assumptions and update links to the standalone App Monitor guides.
3. Convert log-source paths to prefer environment variables (already supported via `envPathVar`) and document the expectation in the setup instructions for developers moving repositories.

