# App Monitor Migration Status

**Last Reviewed:** November 3, 2025  
**Owner:** Platform Tooling

## Summary

App Monitor has completed its migration out of `job-finder-app-manager` and now runs as an independent workspace. The backend ships with a modular, per-project work-target abstraction that loads project-specific configuration from `backend/config/log-sources.json` and the companion files in `backend/config/work-targets/*.json`.

## Key Findings

- `backend/config/log-sources.json` defines a top-level `workTargets` array. Each entry references an individual JSON file that declares project metadata, environment overrides, and log source descriptors.
- The `verify-config.js` script resolves each work target, applies `*_ROOT` overrides when present (for example `APP_MONITOR_ROOT`, `JOB_FINDER_ROOT`, `DEV_BOTS_ROOT`), and validates every enabled log source path before startup.
- App Monitor’s own logs now live inside the repository under `logs/` by default. External projects (such as Job Finder) are opt-in through their work-target config and can point anywhere via environment overrides.
- Frontend and backend development flows run entirely inside the App Monitor repo (`make dev`, `make dev-backend`, `make dev-frontend`). Integrations with other projects are mediated through configuration rather than directory layout assumptions.

## Outstanding Risks

- Ensure downstream documentation and onboarding materials reference work targets instead of hard-coded relative paths into `job-finder-app-manager`.
- Capture examples for adding new projects so teams can reproduce the pattern quickly.

## Next Actions

1. Update README and development guides to highlight the work-target abstraction and remove stale `job-finder-app-manager` instructions.
2. Refresh architecture and migration guides to document the finalized configuration model.
3. Add an onboarding snippet that walks through adding a new project work target and rerunning `node backend/scripts/verify-config.js`.
