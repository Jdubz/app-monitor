# App Monitor App Requirements

> Maintained in the standalone `app-monitor` repository after the 2025-10 split.
> **Status:** Phase 1 + Phase 2 delivery complete (see `PHASE3_*` and `PHASE4_*` completion summaries); ongoing enhancement issues tracked in `app-monitor/docs/issues/app-monitor-*`.
> **Technology:** Node.js/Express + React (updated from Flask to leverage existing infrastructure)

## Overview

The console monitor will:

**Backend: Node.js/Express app** with the primary responsibility of managing the dev processes.

- start / stop elegantly / kill / restart (elegantly)
  - the emulators MUST persist data on elegant stop
- stream console logs to client via Socket.IO
- get, parse, and send logs from prod and staging services (google cloud) to the client (phase 2)
- serve the app

**Front end: React app** with the UI.

- panel for each service
- buttons for start / stop elegantly / kill / restart
- logs view with filters
- tabs for environments (phase 2)
  - prod and staging do not need start / stop / restart buttons

## Technology Decision

**Node.js/Express chosen over Flask/Python because:**

- ✅ Consistency with existing project infrastructure (all scripts are Node.js)
- ✅ Better TypeScript integration - share types between frontend and backend
- ✅ Native process management with `child_process` module
- ✅ Can leverage existing `package.json`, tooling, and npm scripts
- ✅ One runtime environment (no Python venv setup needed)
- ✅ Team familiarity - Worker B already working in TypeScript/React ecosystem

## Implementation Tracks

### Completed Milestones (Phase 1 & 2)

- **APP-MONITOR-1 → APP-MONITOR-5** — Local development foundation (project setup, process management backend, log streaming, service panels, logs UI). All acceptance criteria met 2025-10-19; see `PHASE3_*` completion summaries for validation notes.
- **APP-MONITOR-6** — Cloud logs integration baseline (staging/prod log ingestion). Completed 2025-10-20 with follow-up captured in `STRUCTURED_LOGGING_MIGRATION.md` (now slated for shared architecture split).

### Active Enhancements & Maintenance

- **APP-MONITOR-CONSOLIDATE-1 — Centralize All Dev Scripting in App Monitor**: Refines the Scripts panel to replace duplicated Makefiles and shell helpers across repos. Specification currently stored in `app-monitor/docs/issues/app-monitor-consolidate-1-centralize-dev-scripts.md`.
- **APP-MONITOR-UI-1 — Multi-Panel Log Viewer**: Enhances the frontend with simultaneous multi-source visibility and layout persistence. Specification in `app-monitor/docs/issues/app-monitor-ui-1-multi-panel-logs.md`.
- **APP-MONITOR-FIX-1 — Backend ESLint Configuration**: Adds missing lint/type-check setup for the Node backend. See `app-monitor/docs/issues/app-monitor-fix-1-backend-eslint.md`.
- **Testing Follow-Ups (APP-MONITOR-TEST-1 → TEST-8)**: Optional validation suites for backend process manager, API contract coverage, and frontend component tests. These remain parked until scripting consolidation work completes.

### Next Planning Steps

- Reconcile outstanding enhancement issues with the new cross-repo documentation strategy (shared architecture repo).
- Decide whether optional quality issues (e.g., linting, extended tests) remain in scope for a purely local developer tool.
