# PR Self-Healing & Resilience Design

Source Plans:
- docs/plans/CONTINUOUS_PR_IMPLEMENTATION_ROADMAP.md
- docs/plans/CONTINUOUS_PR_SELF_HEALING.md
- docs/plans/PR_WORKFLOW_IMPLEMENTATION.md
- docs/plans/PR_TRACKING_SYSTEM_RESILIENCE_PLAN.md
- docs/plans/STUCK_PRODUCTION_PRS_AUTOMATION_PLAN.md

Status: Phase 1-2 complete (quality gates, webhook ingestion). Self-healing, auto-merge, heartbeat/backup workstreams remain outstanding.

## Objectives
1. Implement the continuous REVIEW → FIX → COMPLETE flow for every PR, honoring the master design intent (review depth, Copilot involvement, blocked chains, human alerts).
2. Guarantee branch currency, Copilot review completion, and delegated PR merges before auto-merging to main.
3. Harden infrastructure: webhook heartbeat metrics, backup/restore automation, and blue/green zero-downtime deploys with websocket state handoff.

## Plan Snapshot
Outstanding items from the source plans:
- Build chain-aware PR reviewer that spawns REVIEW/FIX tasks per condition fingerprint (conflicts, failed checks, Copilot feedback, stale branch).
- Add auto-merge orchestration with gate enforcement (Copilot review done, all conditions true, delegated fixes merged).
- Consolidate PR tracking storage, add backups every 5 minutes, and implement restore scripts.
- Provide dashboard/alerts for stuck PRs and automation to requeue chains after human unblock.

## Requirements (Aligned with Master Design Intent)
- Chain Awareness: All PR tasks (implementation, reviews, fixes, delegated work) belong to a single chain enforced by the staged queue.
- Copilot Delegation: Delegate workflows must merge into the task branch before final auto-merge and should not consume bot concurrency.
- Human Intervention: Blocked chains drop from the active count and surface prominently in dev-monitor for manual action.

## Architecture Considerations
1. Self-Healing Engine: Extend PRMonitorService/PRConditionStateService to fingerprint issues, spawn REVIEW/FIX tasks, and cap depth at four automated attempts.
2. Auto-Merge Controller: Manage merges once all gates are satisfied, with retries/backoffs and post-merge cleanup of tasks/metrics.
3. Infrastructure Resilience: Add webhook heartbeat metrics, backup automation (scripts/cron), and zero-downtime deploy procedures for the PR worker plus websocket layer.
4. Observability: Dev-monitor should visualize PR chains (conditions, active fixes, delegated tasks, blocked states) and expose manual controls.

## Implementation Steps
1. Issue Fingerprinting & Task Spawning: Implement PR condition evaluations that create REVIEW/FIX tasks with structured context, respecting chain limits.
2. Auto-Merge Pipeline: Add controller that waits for Copilot review completion, ensures delegated PRs merged, and triggers final merge.
3. Webhook Reliability: Build heartbeat metrics, alerting, and replay queue. Integrate with staging/prod dashboards.
4. Backup & Restore: Implement storage consolidation plus backup scripts with verification (per resilience plan).
5. Zero-Downtime Deploy: Extend deployment scripts/systemd units to ensure blue/green handoff without dropped state (ties into websocket resilience).
6. UI Enhancements: Update dev-monitor to show PR chain state, delegated tasks, and blocked-chain controls.

## Open Questions
- What retention policy should apply to stored webhook payloads and PR snapshots?
- How aggressively should delegated tasks be throttled in parallel?
- What additional manual overrides are required in dev-monitor (force merge, cancel chain, escalate)?

## Next Actions
- Review this consolidated design with the architecture owner responsible for PR workflow.
- Create execution tickets for each step above, ensuring dependencies (staged queue, context bundles) are satisfied.
- Retire or archive redundant plan docs once implementation begins under this design.
