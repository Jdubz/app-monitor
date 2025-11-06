# Dev-Bot Pipeline Enhancement Plan

**Status:** Draft for implementation  
**Last Updated:** November 6, 2025  
**Owner:** Platform Tooling  

---

## Why This Exists
App Monitor already treats everything as a task. The gaps are that tasks lack rich diagnostic context, and automated remediation has no consistent container workflow. This plan adapts the proven ideas from Imagineer’s bug-report system to our task pipeline without introducing a parallel “bug report” concept.

---

## Objectives
1. **Context-Rich Tasks:** Let dev-bots and humans attach diagnostic breadcrumbs (logs, network traces, env snapshot, screenshots) to the same task objects App Monitor already manages.
2. **Better Dev-Bot Telemetry:** Persist that context and every dev-bot run (inputs, outputs, exit codes, artifacts) in SQLite so we can reason about automation quality and retries.
3. **Harder, Faster Runs:** Strengthen the existing dev-bot workspace orchestration (mirrors, bootstrap scripts, logging) using patterns proven in Imagineer without introducing new agent types.
4. **Isolation:** Keep each work-target’s repos, secrets, and automation configuration isolated while still coordinating through App Monitor’s registry.

---

## System Overview

### Capture Layer (Frontend / CLI)
- Extend task creation flows to accept optional context bundles:
  - Structured description (expected vs. actual behavior, reproduction steps)
  - Environment snapshot (app version, git SHA, build timestamp)
  - Recent logs / network events (bounded lists, truncated payloads)
  - Optional screenshot or artifact references
- Provide React utilities (similar to Imagineer’s `BugReportContext`) that instrument console logs and fetch requests when a dev initiates a “Create Task” from the UI.
- For CLI or API submissions, accept the same schema so automation and bots can supply machine-generated context.

### Backend / Persistence
- Add new columns / tables in SQLite:
  - `task_context` JSON column for environment + app state.
  - `task_logs` JSON (bounded array) and `task_network_events` JSON.
  - `task_artifacts` table storing references to screenshots, patches, session logs.
  - `task_automation_runs` table capturing container execution attempts (status, log_dir, summary, exit code, commit SHA, timestamps).
- Extend the existing task API (`POST /api/tasks`, `GET /api/tasks/:id`) to accept/serve context data, using JSON Schema validation to enforce structure.

### Dev-Bot Pipeline Upgrades
- **TaskAutomationManager (dev-bots aware)**
  - Builds on `DevBotsManager` by adding single-concurrency locking across processes, `_recent_failures` quarantine, and automation_attempt counters on tasks.
  - Picks eligible tasks (status `pending`, automation-enabled type, below retry threshold) and hands them to the appropriate dev-bot personality.
- **Workspace Preparation**
  - Reuse the existing workspace orchestrator but enforce Git mirror health, standardized bootstrap commands, and structured summaries for every run.
  - Configuration (image, branch, commands, credentials) stored per work-target in the registry so dev-bots respect project boundaries.
- **Bootstrap Enhancements**
  - Update dev-bot bootstrap scripts to:
    - Configure git identity/remote per target.
    - Reset workspace, run allowlisted lint/build/test commands.
    - Capture stdout/stderr into `session.log`.
    - Generate `session_summary.json` with exit code, failure reason, commit SHA (if any), and token usage.
  - When no changes are produced, surface that fact in the summary instead of failing silently.
- **Artifact Trail**
  - Store session logs, summaries, and patches under `logs/dev-bots/<task_id>/<timestamp>/`.
  - Link those artifacts back to the task detail so humans can inspect runs easily.

### Artifacts & Analytics
- Store logs under `logs/dev-bots/<task_id>/<run_timestamp>/session.log` and session summary JSON for traceability.
- Extend dashboards to show automation success/failure, number of retries, and last run metrics (duration, tokens, exit codes).
- Provide CLI helpers (`scripts/tasks_automation.ts`) to inspect automation runs, tail logs, and retry or disable automation for a task.

---

## Implementation Roadmap (High Level)

### Stage 1 – Data Foundations
1. Update task creation API schema to accept context payloads (JSON Schema + TypeScript types).
2. Migrate SQLite schema for new columns/tables (see stabilization tasks **TC-1 – TC-4** below).
3. Ensure existing tasks remain compatible (context fields optional).

### Stage 2 – Context Capture MVP
1. Add UI components for context-enabled task creation (modules for logs/network capture, screenshot optional).
2. Provide CLI flags or API parameters so bots can attach structured context when creating tasks.
3. Present context in the Task detail view with toggles to show raw JSON or prettified tables.

### Stage 3 – Dev-Bot Pipeline Hardening
1. Enhance `DevBotsManager` with queue locking, retry guards, and structured logging.
2. Harden workspace mirrors + bootstrap templates so every run emits summary/log artifacts and cleans up reliably.
3. Integrate run results into the task timeline/UI, including log links, exit code, summary, commit SHA, and follow-up actions.

### Stage 4 – Work-Target Rollout
1. Populate registry entries for automation config per target (branch, test commands, bootstrap path, credential passthrough).
2. Validate container images (reuse `dev-bots/docker/Dockerfile` or produce derivatives) and ensure no cross-repo secrets leak.
3. Enable automation for high-confidence task types (e.g., TypeScript build failures, lint fixes) before expanding to feature delivery.

### Stage 5 – Continuous Queue Integration
1. Feed improved dev-bot telemetry into the continuous task queue so successful runs auto-close tasks.
2. On failure, auto-generate follow-up tasks with captured artifacts and escalation metadata.
3. Surface analytics (automation success rate, MTTR, top failure categories) to guide backlog prioritization.

---

## Stabilization Add-ons
Add the following tasks to the stabilization backlog (before automation turns on):

- **TC-1**: Define task context submission schemas and validators.
- **TC-2**: Design SQLite migrations for context/automation tables.
- **TC-3**: Update task API + CLI scaffolding to accept optional context.
- **TC-4**: Document per-work-target automation configuration expectations in the registry.

These appear in `docs/plans/APP_MONITOR_STABILIZATION_PLAN.md`.

---

## Guardrails & Isolation
- No data from one work-target should leak into another. Registry-driven configuration ensures each automation run works off that target’s repo path, branch, and credential set.
- Workspace mirrors live under `dev-bots/mirror/<work_target>`; containers operate on throwaway clones and push using the target’s own remote.
- Claude credentials are mounted read-only (from `~/.claude`) and copied into an isolated per-run directory so dev-bots never mutate the host context; no API keys are passed via environment variables.
- Context payloads stored in App Monitor should omit sensitive information by default; if a work-target needs redaction, provide preprocessing hooks in the capture layer.

---

## Open Questions
- How to prioritize tasks for automation (confidence heuristics, manual opt-in/out)?
- How to manage secrets for hosted AI providers (per work-target env var mapping vs. root-level service accounts)?
- Should automation run nested tests per work-target (e.g., portfolio’s Gatsby build) or a subset defined in the registry?

---

This plan keeps the system task-first, introduces richer diagnostics, and layers an automation workflow that can grow towards the long-term autonomous goals without copying a bug-report subsystem verbatim.
