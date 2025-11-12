# PR Self-Healing & Resilience Design

## Document Metadata

| Field | Value |
|-------|-------|
| **Status** | 🟢 Core Complete, 🟡 Auto-Merge & Infrastructure Pending |
| **Priority** | P1 |
| **Dependencies** | ✅ Staged Task Queue (COMPLETE) |
| **Last Updated** | November 12, 2025 |
| **Implementation Progress** | 65% (phases 1-3 complete, auto-merge & infrastructure hardening pending) |
| **Implemented Services** | prConditionState.service.ts (modularized with 15 evaluators), prMonitor.service.ts, prWorkflowOrchestrator.service.ts, prArtifactRecovery.service.ts, prTracker.service.ts |

## Quick Reference

**What**: Continuous REVIEW→FIX→COMPLETE flow for every PR with auto-merge, Copilot gating, and infrastructure resilience (webhook heartbeat, backups, zero-downtime deploys).

**Why**: Ensures PRs automatically heal themselves by detecting issues (conflicts, failed checks, Copilot feedback, stale branches) and spawning fix tasks, enabling autonomous development workflow.

**Current Status**: Quality gates and webhook ingestion working. Self-healing engine, auto-merge, and infrastructure hardening in progress.

## Source Plans
- `docs/plans/CONTINUOUS_PR_IMPLEMENTATION_ROADMAP.md`
- `docs/plans/CONTINUOUS_PR_SELF_HEALING.md`
- `docs/plans/PR_WORKFLOW_IMPLEMENTATION.md`
- `docs/plans/PR_TRACKING_SYSTEM_RESILIENCE_PLAN.md`
- `docs/plans/STUCK_PRODUCTION_PRS_AUTOMATION_PLAN.md`

## Table of Contents

1. [Objectives](#objectives)
2. [Requirements (Aligned with Master Design Intent)](#requirements-aligned-with-master-design-intent)
3. [Architecture Considerations](#architecture-considerations)
4. [Implementation Steps](#implementation-steps)
5. [Success Criteria](#success-criteria)
6. [Testing Strategy](#testing-strategy)
7. [Related Files](#related-files)

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

## Success Criteria

### Phase 1: Quality Gates (✅ Complete)
- ✅ PR condition state tracking (conflicts, CI checks, reviews, branch currency)
- ✅ Webhook ingestion for PR events
- ✅ Database schema for PR tracking

### Phase 2: Self-Healing Engine (🟡 In Progress)
- ⏳ Issue fingerprinting detects PR problems automatically
- ⏳ REVIEW tasks spawned with structured context per issue type
- ⏳ FIX tasks created with chain depth tracking
- ⏳ Maximum 4 automated fix attempts before escalation

### Phase 3: Auto-Merge Orchestration (⏳ Pending)
- ⏳ Gate enforcement (all conditions pass, Copilot approved, delegated PRs merged)
- ⏳ Automatic merge to main when gates satisfied
- ⏳ Post-merge cleanup (close tasks, archive metrics)
- ⏳ Retry logic with exponential backoff

### Phase 4: Infrastructure Resilience (⏳ Pending)
- ⏳ Webhook heartbeat metrics tracked
- ⏳ Backup automation running every 5 minutes
- ⏳ Restore scripts tested and verified
- ⏳ Zero-downtime deployment working in production

### Phase 5: Observability & Controls (⏳ Pending)
- ⏳ Dev-monitor visualizes PR chains
- ⏳ Manual controls for stuck PRs
- ⏳ Alerting for blocked chains
- ⏳ Delegated task monitoring

### Acceptance Criteria
1. **Autonomy**: 80%+ of PRs auto-merge without human intervention
2. **Reliability**: < 1% of PRs stuck in broken state for > 1 hour
3. **Visibility**: All PR issues surfaced in dev-monitor within 5 minutes
4. **Resilience**: 0 webhook data loss, RPO < 5 minutes
5. **Performance**: Auto-merge latency < 10 minutes after final condition passes

## Testing Strategy

### Unit Tests
- **PRConditionStateService**
  - Condition evaluation logic (conflicts, CI checks, reviews)
  - State transitions (pending → passing → failing)
  - Issue fingerprinting accuracy

- **PRSelfHealingEngine** (to be created)
  - Issue detection algorithms
  - Task spawning logic
  - Chain depth tracking

- **AutoMergeController** (to be created)
  - Gate validation logic
  - Merge execution with retries
  - Cleanup procedures

### Integration Tests
- End-to-end PR flow
  - Create PR → detect issue → spawn fix → verify → auto-merge
  - Copilot review integration
  - Delegated PR workflow

- Webhook reliability
  - Webhook ingestion with retries
  - Heartbeat monitoring
  - Backup/restore cycle

### System Tests
- Production simulation
  - Multiple concurrent PRs
  - Various failure modes (conflicts, CI failures, stale branches)
  - Resource limits (max concurrent chains)

- Resilience testing
  - Webhook service downtime
  - Database recovery from backup
  - Zero-downtime deployment validation

### Test Coverage Targets
- PRConditionStateService: 85%+ (current)
- PRSelfHealingEngine: 90%+ (target)
- AutoMergeController: 90%+ (target)
- Webhook reliability: 95%+ (target)

## Related Files

### Implementation Files (Existing)
- `backend/src/services/prConditionState.service.ts` - PR condition tracking
- `backend/src/services/prMonitor.service.ts` - PR monitoring
- `backend/src/services/github.service.ts` - GitHub API integration
- `backend/src/routes/github-webhooks.routes.ts` - Webhook ingestion
- `backend/src/services/database.ts` - PR storage schema

### Implementation Files (To Be Created)
- `backend/src/services/prSelfHealing.service.ts` - Self-healing engine
- `backend/src/services/autoMerge.service.ts` - Auto-merge orchestration
- `backend/src/services/webhookHeartbeat.service.ts` - Heartbeat monitoring
- `scripts/production/backup-pr-state.sh` - Backup automation
- `scripts/production/restore-pr-state.sh` - Restore procedures

### Test Files
- `backend/src/services/prConditionState.service.test.ts` - Existing tests
- `backend/src/services/prSelfHealing.service.test.ts` (to be created)
- `backend/src/services/autoMerge.service.test.ts` (to be created)
- `tests/integration/pr-workflow.test.ts` (to be created)

### Configuration Files
- `backend/.env` - Environment configuration
- `scripts/production/systemd/app-monitor-pr-worker.service` - PR worker service
- `config/pr-healing-rules.yaml` (to be created) - Self-healing rule definitions

### Documentation Dependencies
- `docs/architecture/automatic-failure-recovery.md` - Recovery architecture
- `docs/plans/CONTINUOUS_PR_IMPLEMENTATION_ROADMAP.md` - Implementation roadmap
- `docs/guides/GITHUB_WEBHOOKS.md` - Webhook setup guide
- `docs/guides/PRODUCTION_DEPLOYMENT.md` - Deployment procedures

### Related Designs
- `docs/technicalDesigns/staged-task-queue.md` - Task scheduling dependency
- `docs/technicalDesigns/error-detection-and-recovery-design.md` - REVIEW chain patterns
- `docs/technicalDesigns/app-monitor-resilience-and-deployments.md` - Zero-downtime deploys

## Next Actions
- Review this consolidated design with the architecture owner responsible for PR workflow.
- Create execution tickets for each step above, ensuring dependencies (staged queue, context bundles) are satisfied.
- Retire or archive redundant plan docs once implementation begins under this design.

## Implementation Status Summary

### ✅ Completed (Phases 1-2)

**Core Infrastructure:**
- ✅ PRConditionStateService (1,922 lines) - PR condition tracking and evaluation
- ✅ PRMonitorService (1,180 lines) - PR monitoring and state management
- ✅ PRWorkflowOrchestrator (465 lines) - Workflow coordination and auto-merge scheduling
- ✅ PRArtifactRecoveryService (273 lines) - Artifact recovery on PR events
- ✅ Database schema for PR tracking (migrations complete)
- ✅ Webhook ingestion integrated via GitHubWebhookHandler
- ✅ Quality gates (conflicts, CI checks, reviews, branch currency)

**Integration:**
- ✅ Integrated with TaskQueueService
- ✅ Integrated with ChainTrackerService
- ✅ DevBotsManager exposes getPRWorkflowOrchestrator()
- ✅ Task completion triggers PR workflow handling

### ⏳ Outstanding (Phases 3-5)

**Phase 3: Auto-Merge Orchestration**
- ⏳ Implement gate enforcement logic (all conditions pass before merge)
- ⏳ Copilot review completion verification
- ⏳ Delegated PR merge verification
- ⏳ Automatic merge execution when gates satisfied
- ⏳ Post-merge cleanup (close tasks, update metrics)
- ⏳ Retry logic with exponential backoff
- ⏳ Error handling and rollback procedures

**Phase 4: Infrastructure Resilience**
- ⏳ Webhook heartbeat metrics tracking
- ⏳ Backup automation (every 5 minutes)
- ⏳ Backup verification scripts
- ⏳ Restore procedures and testing
- ⏳ Zero-downtime deployment scripts
- ⏳ Websocket state handoff during deploys
- ⏳ Production monitoring and alerting

**Phase 5: Observability & Controls**
- ⏳ Dev-monitor PR chain visualization
- ⏳ Manual controls for stuck PRs (force merge, cancel chain, escalate)
- ⏳ Alerting for blocked chains
- ⏳ Delegated task monitoring dashboard
- ⏳ PR health metrics dashboard
- ⏳ Historical PR analytics

### Next Steps (Priority Order)

1. **Phase 3a: Complete Auto-Merge Gate Enforcement** (P0)
   - Implement final gate checks before merge
   - Add Copilot review verification
   - Add delegated PR merge verification
   - Test with production PRs

2. **Phase 3b: Auto-Merge Execution** (P0)
   - Implement merge execution with retry logic
   - Add post-merge cleanup workflows
   - Test error handling and rollbacks

3. **Phase 4a: Backup & Restore** (P1)
   - Consolidate PR tracking storage
   - Implement 5-minute backup automation
   - Create and test restore scripts
   - Document recovery procedures

4. **Phase 4b: Infrastructure Hardening** (P1)
   - Add webhook heartbeat metrics
   - Implement zero-downtime deploy procedures
   - Test websocket state handoff

5. **Phase 5: UI & Observability** (P2)
   - Build PR chain visualization in dev-monitor
   - Add manual override controls
   - Implement alerting for stuck PRs

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.2 | 2025-11-12 | Claude Code | Updated status, added implementation summary, captured Phase 3-5 tasks |
| 1.1 | 2025-11-12 | Claude Code | Added metadata, success criteria, testing strategy, related files |
| 1.0 | 2025-11-12 | Original Author | Initial consolidated design |
