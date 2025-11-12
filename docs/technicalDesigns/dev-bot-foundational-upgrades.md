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
3. [Requirements](#requirements)
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

## Next Actions
- Review this consolidated design with architecture owners.
- Break down execution into tickets correlating with the steps above.
- Update/retire the original plan docs once this design is approved and implementation begins.
