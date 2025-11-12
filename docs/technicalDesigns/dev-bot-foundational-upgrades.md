# Dev-Bot Foundational Upgrades Design

## Document Metadata

| Field | Value |
|-------|-------|
| **Status** | 🟡 Partially Implemented |
| **Priority** | P1 |
| **Dependencies** | Staged Task Queue (P0) |
| **Last Updated** | November 12, 2025 |
| **Implementation Progress** | 85% (pipeline core complete, analytics/diagnostics remain) |

## Quick Reference

**What**: Data/analytics backbone delivering session summaries, artifact management, diagnostic capture, safety gates, and work-target abstractions to support review chains and context bundles.

**Why**: Review chains and context management require structured task metadata, artifact tracking, and diagnostic data. Work targets enable multi-environment deployment support.

**Current Status**: Core pipeline 85% complete. Outstanding: session summaries, artifact DB, diagnostics, safety gates, work-target APIs.

## Source Plans
- `docs/plans/DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md`
- `docs/plans/DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md`
- `docs/plans/DEV_BOT_SAFETY_AND_PROMPT_IMPROVEMENTS.md`
- `docs/plans/DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md`

## Table of Contents

1. [Objectives](#objectives)
2. [Plan Snapshot](#plan-snapshot)
3. [Requirements (Aligned with Master Design Intent)](#requirements-aligned-with-master-design-intent)
4. [Architecture Considerations](#architecture-considerations)
5. [Implementation Steps](#implementation-steps)
6. [Success Criteria](#success-criteria)
7. [Testing Strategy](#testing-strategy)
8. [Related Files](#related-files)

## Objectives
1. Finish the data/analytics foundations (session summaries, artifact DB, automation-run history) required for review chains and context bundles.
2. Implement diagnostic/context capture tasks (token tracking, environment snapshots, log/trace piping) that feed directly into the context-management system.
3. Ship safety/prompt hardening (linting, gate templates, forbidden-op detection) consistent with the multi-stage review pipeline.
4. Add work-target abstractions (deploy roots, artifact roots, doc syncing) so context and automation can scope themselves to each environment.

## Plan Snapshot
Highlighted outstanding items:
- Add schema components: task_context, task_artifacts, task_logs, task_network_events, task_automation_runs.
- Generate session_summary.json for every run and register artifacts with metadata (size, hash, retention policy).
- Extend TaskAutomationManager with quarantine logic after repeated failures.
- Implement diagnostic capture (git status, env vars, token usage) before/after each run.
- Bake prompt linting plus safety guards into task templates.
- Define work-target metadata (deploy root, artifact root, doc root) and keep dev-monitor/docs in sync.

## Requirements (Aligned with Master Design Intent)
- Chain Support: All artifacts/context captured here must plug into the REVIEW → FIX → COMPLETE pipeline (e.g., follow-up tasks load summaries and diffs).
- Container Safety: Diagnostics run inside the isolated container filesystem; no host workspace writes.
- Task Metadata: Every automation attempt must update chain-aware fields (chain_id, chain_stage, context pointers) so the staged queue and verification services can reason about them.
- Human Visibility: Dev-monitor should expose session summaries, quarantined tasks, and work-target mappings for intervention.

## Architecture Considerations
1. Storage Layer: Extend SQLite schema (per pipeline completion plan) and add migrations/tests. Consider background cleanup for artifacts and context bundles.
2. Artifact Builder: Integrate with the context-builder CLI so diagnostics, summaries, and reusable patches live in one artifact pipeline.
3. Safety Gates: Hook prompt linting plus forbidden-operation scans into TaskExecutionService before container launch, emitting structured review hints.
4. Work Targets: Represent each deploy target with a record (id, repo paths, env settings). Task creation must reference a work target; context builder uses it to scope recipes.

## Implementation Steps
1. Schema & Migrations: Add missing tables/columns, update DAO layer, and cover with integration tests.
2. Session Summaries & Artifacts: Generate session_summary.json, register artifacts in DB, and surface in dev-monitor.
3. Diagnostics & Context Capture: Implement pre/post hooks that gather env/log/git/token data and feed the context management system.
4. Safety & Prompt Linting: Enforce prompt templates plus lint checks from the safety plan, tying violations into REVIEW tasks.
5. Work-Target Abstraction: Build APIs/UI for selecting work targets and ensure dev-bot containers mount the correct roots.
6. Quarantine Flow: Extend TaskAutomationManager to quarantine recurring failures and expose controls in dev-monitor.

## Open Questions
- What retention policy should apply to session summaries vs raw artifacts?
- How will diagnostics be throttled to avoid bloating context bundles?
- Do work targets require per-target context overrides (recipes) in v1, or is a shared recipe sufficient until v2?

## Success Criteria

### Phase 1: Schema & Storage (🟡 In Progress - 85% Complete)
- ✅ Core task pipeline tables exist
- ⏳ `task_context` JSON column added
- ⏳ `task_artifacts` table created
- ⏳ `task_logs` table created
- ⏳ `task_network_events` table created
- ⏳ `task_automation_runs` table created
- ⏳ Migration scripts complete with rollback support

### Phase 2: Session Summaries & Artifacts (⏳ Pending)
- ⏳ `session_summary.json` generated for every task run
- ⏳ Artifacts registered in DB with metadata (size, hash, timestamps)
- ⏳ Retention policies configured and enforced
- ⏳ Background cleanup job for expired artifacts
- ⏳ Dev-monitor displays session summaries per task

### Phase 3: Diagnostics & Context Capture (⏳ Pending)
- ⏳ Pre-run hooks: git status, env vars, token limits
- ⏳ Post-run hooks: logs, traces, resource usage
- ⏳ Diagnostic data fed to context builder
- ⏳ Container-safe capture (no host writes)
- ⏳ Throttling to prevent context bloat

### Phase 4: Safety & Prompt Hardening (⏳ Pending)
- ⏳ Prompt template linting implemented
- ⏳ Forbidden operation detection active
- ⏳ Safety violations trigger REVIEW tasks
- ⏳ Gate templates enforced at task creation
- ⏳ Structured review hints for safety issues

### Phase 5: Work-Target Abstractions (⏳ Pending)
- ⏳ Work-target data model defined
- ⏳ API for creating/managing work targets
- ⏳ Task creation references work target
- ⏳ Context recipes scoped per work target
- ⏳ Dev-monitor work-target selector UI

### Phase 6: Quarantine & Advanced Features (⏳ Pending)
- ⏳ Quarantine logic after N repeated failures
- ⏳ Dev-monitor quarantine controls
- ⏳ Automated unquarantine after fixes
- ⏳ Work-target doc syncing

### Acceptance Criteria
1. **Data Completeness**: 100% of task runs produce session summaries
2. **Artifact Management**: All artifacts tracked with hash/size/retention
3. **Diagnostics**: Token usage, env snapshots captured for all tasks
4. **Safety**: 0 forbidden operations execute in production
5. **Work Targets**: Multi-environment support functional
6. **Performance**: Session summary generation < 500ms
7. **Retention**: Automated cleanup keeps artifact storage < 10GB

## Testing Strategy

### Unit Tests
- **Session Summary Generation**
  - Summary structure validation
  - Metadata completeness
  - Timestamp accuracy
  - Error handling for missing data

- **Artifact Management**
  - Registration/deregistration
  - Hash calculation
  - Size tracking
  - Retention policy enforcement

- **Diagnostic Capture**
  - Git status parsing
  - Env var extraction (secrets masked)
  - Token usage calculation
  - Log aggregation

- **Safety Gates**
  - Prompt linting rules
  - Forbidden operation detection
  - Template validation
  - Safety violation formatting

- **Work-Target Management**
  - CRUD operations
  - Path validation
  - Context recipe scoping

### Integration Tests
- End-to-end task flow with diagnostics
  - Task start → pre-run diagnostics → execution → post-run diagnostics → summary generation
  - Artifact registration and retrieval
  - Context builder integration

- Safety gate enforcement
  - Prompt with forbidden ops → rejection → REVIEW task
  - Template validation at task creation

- Work-target scoping
  - Task created for work-target A → correct paths mounted
  - Context recipes loaded per work target

- Retention and cleanup
  - Artifact created → retention period → cleanup job → artifact removed

### System Tests
- Production simulation
  - 50+ tasks with full diagnostic capture
  - Artifact storage growth monitoring
  - Cleanup job performance

- Performance benchmarks
  - Session summary generation time
  - Diagnostic capture overhead
  - Context builder with diagnostics

- Safety validation
  - Attempt forbidden operations → all blocked
  - Safety review tasks created correctly

### Test Coverage Targets
- Session summary: 90%+ coverage
- Artifact management: 95%+ coverage
- Diagnostic capture: 85%+ coverage
- Safety gates: 95%+ coverage
- Work-target management: 85%+ coverage

### Performance Benchmarks
- Session summary generation: < 500ms
- Diagnostic pre-run: < 2s
- Diagnostic post-run: < 3s
- Artifact registration: < 100ms
- Safety gate validation: < 200ms

## Related Files

### Implementation Files (Existing)
- `backend/src/services/taskExecution.service.ts` - Task execution orchestration
- `backend/src/services/devBotsManager.ts` - Dev-bot management
- `backend/src/services/database.ts` - Database layer
- `backend/src/services/taskQueue.sqlite.ts` - Task queue

### Implementation Files (To Be Created)
- `backend/src/services/sessionSummary.service.ts` - Session summary generation
- `backend/src/services/artifactManager.service.ts` - Artifact lifecycle management
- `backend/src/services/diagnosticCapture.service.ts` - Pre/post-run diagnostics
- `backend/src/services/safetyGates.service.ts` - Prompt linting and safety checks
- `backend/src/services/workTarget.service.ts` - Work-target management
- `backend/src/services/artifactCleanup.service.ts` - Retention and cleanup
- `backend/migrations/013_task_analytics.sql` - Analytics schema
- `backend/migrations/014_work_targets.sql` - Work-target schema

### Test Files (To Be Created)
- `backend/src/services/__tests__/sessionSummary.test.ts`
- `backend/src/services/__tests__/artifactManager.test.ts`
- `backend/src/services/__tests__/diagnosticCapture.test.ts`
- `backend/src/services/__tests__/safetyGates.test.ts`
- `backend/src/services/__tests__/workTarget.test.ts`
- `tests/integration/task-analytics-flow.test.ts`
- `tests/integration/safety-gates.test.ts`
- `tests/integration/work-targets.test.ts`

### Configuration Files
- `config/retention-policies.yaml` (to be created) - Artifact retention rules
- `config/safety-rules.yaml` (to be created) - Forbidden operation definitions
- `config/diagnostic-thresholds.yaml` (to be created) - Diagnostic capture limits
- `backend/.env` - Storage paths and limits

### Frontend Files (To Be Created)
- `frontend/src/components/SessionSummary.tsx` - Session summary display
- `frontend/src/components/ArtifactBrowser.tsx` - Artifact viewer
- `frontend/src/components/WorkTargetSelector.tsx` - Work-target picker
- `frontend/src/components/QuarantineManager.tsx` - Quarantine controls

### Documentation Dependencies
- `docs/plans/DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md` - Schema requirements
- `docs/plans/DEV_BOT_SAFETY_AND_PROMPT_IMPROVEMENTS.md` - Safety specifications
- `docs/plans/DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md` - Work-target requirements

### Related Designs
- `docs/technicalDesigns/dev-bot-context-management.md` - Context bundle integration
- `docs/technicalDesigns/error-detection-and-recovery-design.md` - REVIEW task integration
- `docs/technicalDesigns/staged-task-queue.md` - Chain metadata requirements

## Next Actions
- Review this consolidated design with architecture owners.
- Break down execution into tickets correlating with the steps above.
- Update/retire the original plan docs once this design is approved and implementation begins.

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2025-11-12 | Claude Code | Added metadata, success criteria, testing strategy, related files |
| 1.0 | 2025-11-12 | Original Author | Initial consolidated design |
