# Task Processing Stage Redesign

**Purpose:** Define the implementation plan for collapsing follow-up chains into a single multi-phase implementation task that progresses from planning through PR merge.

**Delete After:** Merge of the staged-processing feature into main and corresponding architecture doc updates.

---

## Goal

Replace the current IMPLEMENTATION → REVIEW → FIX child-task chain with a single task that advances through eight autonomous phases (Planning, Implementation, Review, Fixes, Test Coverage, Test Runs, Cleanup & Documentation, PR Shepherding) while honoring master design intent constraints and PR tracking requirements.

## Architecture Alignment

- **Event-driven:** All phase transitions are triggered by existing queue events; no cron or polling is introduced (ref. master design intent).
- **Single DB source of truth:** New phase metadata is stored in SQLite tables so blue-green deploys remain stateless.
- **Chain concurrency:** Chains remain limited to three concurrent implementations; completion now occurs at phase 8.
- **Retry caps:** Automated iterations (review/fix/test loops) still respect the four-attempt limit before escalation.
- **PR merge gates:** Phase 8 integrates with the existing eight-condition evaluator to ensure merges remain automated and safe.

## Phase Blueprint

| Phase | Agent(s) | Entry Criteria | Output/Artifacts | Notes |
|-------|----------|----------------|------------------|-------|
| 1. Planning | Codex/Gemini | Task pulled first time | `planning-summary`, relevance decision, dependency list | Can terminate task early if obsolete. |
| 2. Implementation | Claude/Gemini | Planning approved | Commits/PR draft, TODO list | Partial completions requeue same phase with updated context. |
| 3. Review | Codex/Claude | Implementation finished | Issue list with fingerprints | Replaces legacy REVIEW task. |
| 4. Fixes | Claude/Gemini | Review produced issues | Updated code, resolved fingerprints | Counts toward attempt limits. |
| 5. Test Coverage | Claude/Gemini | Fix phase completes | Coverage reports ≥80% | Fails if threshold unmet. |
| 6. Test Runs | Claude/Gemini (test image) | Coverage artifacts ready | E2E results, failure logs | Failures bounce back to Phase 4 with blocking issues. |
| 7. Cleanup & Docs | Codex | Tests green | Doc updates, artifact pruning | Must follow documentation guidelines. |
| 8. PR Shepherding | Codex | PR ready | All PR gates met, auto-merge | Interfaces with PR tracking service. |

## Data Model Changes

1. **`tasks` table**
   - Add `phase_index INTEGER`, `phase_name TEXT`, `phase_status TEXT`, `phase_attempts INTEGER`, `phase_payload TEXT`.
   - Backfill existing implementation tasks with `phase_index=2` and map legacy REVIEW/FIX rows to historical stage runs.
2. **`task_stage_runs` table** (new)
   ```sql
   CREATE TABLE task_stage_runs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id TEXT NOT NULL,
     phase_index INTEGER NOT NULL,
     phase_name TEXT NOT NULL,
     attempt INTEGER NOT NULL,
     status TEXT NOT NULL,
     artifacts_blob TEXT,
     created_at TEXT NOT NULL,
     completed_at TEXT,
     FOREIGN KEY (task_id) REFERENCES tasks(id)
   );
   ```
3. **Config**
   - Add a phase template constant defining allowed agents, max attempts, timeout, required artifacts, and failure routing per phase.

## Queue & Worker Updates

- `TaskQueueService.pullNextTask` filters by `phase_status=ready` instead of spawning discrete REVIEW/FIX tasks; `ChainTracker` closes the chain only when phase 8 completes.
- Worker pool advertises phase capabilities so heavy phases (test runs) acquire the correct container image without exceeding the three-worker limit.
- Partial implementations store structured TODO artifacts so requeued phases resume seamlessly.

## Service Logic

- **Planning service:** Detects duplicate/obsolete work, gathers missing requirements, and either enriches metadata or marks the task superseded.
- **Implementation service:** Applies code changes, handles partial self-stops, and emits TODO context.
- **Review/Fix module:** Generates fingerprinted issue lists, enforces attempt caps, and loops internally before escalation.
- **Coverage/Test services:** Embed coverage tooling and E2E harness; failures publish blocking issues that reroute to the Fix phase.
- **Cleanup/Docs service:** Updates or deletes docs per `docs/guides/DOCUMENTATION_SYSTEM.md`; blocks progression until compliance is verified.
- **PR Shepherding:** Registers PRs with `pr_metadata`, monitors webhook-driven conditions, resolves conflicts, and triggers auto-merge when all eight gates are satisfied.

## Artifact Handling

Each phase writes standardized artifacts (`planning-summary.md`, `implementation-todo.json`, `review-issues.json`, `coverage-report.lcov`, `e2e-results.json`, `doc-changelog.md`). Artifact references are stored in `task_stage_runs.artifacts_blob` and exposed via the existing context bundle service to satisfy isolation requirements.

## Telemetry & Health

- Extend queue metrics to include phase-level throughput, retries, and SLA breach detection using `task_stage_runs` data.
- Emit `phase:*` events (`phase:started`, `phase:completed`, `phase:failed`) for UI and alerting.

## Cleanup Tasks

1. Delete legacy REVIEW/FIX task creation logic (TaskCompletionService, DevBotsManager, chain tracker hooks) and migrate any open child tasks back into parent implementation records.
2. Update scripts (`monitor-tasks.js`, `analyze-tasks.js`, dashboards) to read `phase_index` instead of task `type`.
3. Refresh `docs/architecture/task-queue-architecture.md` and `docs/architecture/pr-tracking-architecture.md` to document the new phase-driven pipeline; remove references to separate REVIEW/FIX tasks once the feature ships.
4. Remove obsolete technical designs (e.g., `staged-task-queue.md`) after architecture docs are updated.

## Delivery Checklist

- [ ] Ship DB migration + phase config.
- [ ] Update queue/worker/services with phase orchestration and requeue logic.
- [ ] Integrate coverage/e2e tooling into worker images.
- [ ] Implement artifact serialization + context bundle hooks.
- [ ] Update PR tracking glue to treat phase 8 as the merge shepherd.
- [ ] Refresh architecture docs and delete this design doc once merged into main.
