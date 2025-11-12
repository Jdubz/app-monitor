# Error Detection & Recovery Design

## Document Metadata

| Field | Value |
|-------|-------|
| **Status** | 🟡 Partial Implementation |
| **Priority** | P1 |
| **Dependencies** | Staged Task Queue (P0), Dev-Bot Foundational Upgrades (P1) |
| **Last Updated** | November 12, 2025 |
| **Implementation Progress** | 30% (basic recovery exists, structured chains needed) |

## Quick Reference

**What**: Enforce REVIEW→FIX→COMPLETE chain with structured outputs, depth tracking (max 4 attempts), and human escalation for persistent failures.

**Why**: Ensures task failures are automatically diagnosed and fixed without manual intervention, improving system reliability and reducing operational burden.

**Current Status**: Basic failure guards and recovery exist. Need structured review templates, chain tracking, and alerting.

## Source Plans
- `docs/plans/ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md`
- `docs/plans/FAILURE_RECOVERY_GAP_ANALYSIS.md`

## Table of Contents

1. [Objectives](#objectives)
2. [Requirements](#requirements)
3. [Architecture Considerations](#architecture-considerations)
4. [Implementation Steps](#implementation-steps)
5. [Success Criteria](#success-criteria)
6. [Testing Strategy](#testing-strategy)
7. [Related Files](#related-files)

## Objectives
1. Enforce the REVIEW → FIX → COMPLETE chain with structured outputs, depth tracking (max 4 automated attempts), and human escalation on the 5th review.
2. Expand failure guards and hung-task detection to feed detailed context into the recovery pipeline.
3. Provide dev-monitor visibility (blocked chains, review history, escalation summaries) and integrate with the staged task queue.

## Requirements
- Structured REVIEW task template including prior-attempt summaries, recommended actions, and block reasons.
- Automated creation of FIX/COMPLETE tasks with context bundles + metadata linking back to original task/PR.
- Hung-task termination that immediately spawns REVIEW tasks and captures artifacts.
- Alerting when chains hit escalation limit or destructive patterns are detected.

## Architecture Considerations
1. **Review Engine:** Extend TaskCompletionService/PRConditionStateService to produce structured review documents stored alongside task_context.
2. **Chain Tracker:** Persist chain depth, status, and history so staged queue + dev-monitor can reason about blocked/unblocked states.
3. **Alerting:** Hook into logging/metrics to raise alerts (dev-monitor UI + external) for escalations or repeated guard hits.
4. **Integration:** Ensure failure guards, staged queue, and PR workflow all use the same chain metadata and context storage.

## Implementation Steps
1. Define REVIEW/FIX/COMPLETE templates and update services to populate them with structured data.
2. Implement chain tracking/persistence (depth counter, status, prior attempt IDs) tied to staged queue rules.
3. Enhance failure guard outputs (category, suggested fix, cleanup strategy) and feed them into REVIEW context.
4. Add dev-monitor views for chain status, review history, and escalation controls.
5. Instrument metrics/alerts for hung tasks, guard triggers, and escalations.

## Open Questions
- Do we need per-category escalation policies (e.g., OOM vs lint failure)?
- How should alerts integrate with existing incident tooling?
- What additional safeguards are needed before allowing auto-escalation to Copilot or human reviewers?

## Success Criteria

### Phase 1: Structured Review Templates (⏳ Pending)
- ⏳ REVIEW task template includes prior attempt summaries
- ⏳ Recommended actions provided per failure category
- ⏳ Block reasons clearly documented
- ⏳ Context bundles attached with artifact references

### Phase 2: Chain Tracking (⏳ Pending)
- ⏳ Chain depth persisted in database
- ⏳ Chain status tracked (active, blocked, escalated)
- ⏳ Prior attempt IDs linked correctly
- ⏳ Staged queue enforces chain concurrency limits

### Phase 3: Hung Task Detection (🟡 Partial)
- ✅ Basic timeout detection exists
- ⏳ Automatic REVIEW task spawning on timeout
- ⏳ Artifact capture (logs, exit codes, resource usage)
- ⏳ Context preservation for FIX tasks

### Phase 4: Alerting & Escalation (⏳ Pending)
- ⏳ Human escalation at 5th attempt
- ⏳ Dev-monitor alerts for escalations
- ⏳ External alerting integration (email, Slack)
- ⏳ Escalation summary includes full chain history

### Phase 5: Dev-Monitor Integration (⏳ Pending)
- ⏳ Chain status visualization
- ⏳ Review history display per task
- ⏳ Manual escalation controls
- ⏳ Unblock chain functionality

### Acceptance Criteria
1. **Automation**: 90%+ of recoverable failures fixed without human intervention
2. **Escalation**: 100% of 5th attempts escalate to human review
3. **Context**: All REVIEW tasks include complete failure context
4. **Performance**: REVIEW task spawned within 30 seconds of failure detection
5. **Visibility**: Chain status visible in dev-monitor within 10 seconds

## Testing Strategy

### Unit Tests
- **Review Engine**
  - Structured output generation
  - Prior attempt summary formatting
  - Recommendation logic per failure category
  - Context bundle assembly

- **Chain Tracker**
  - Depth counter increment/reset
  - Status transitions (active → blocked → escalated)
  - Prior attempt linkage
  - Escalation threshold enforcement

- **Failure Guards** (existing)
  - Category detection (OOM, lint, timeout, etc.)
  - Suggested fix generation
  - Cleanup strategy selection

### Integration Tests
- End-to-end recovery flow
  - Task fails → REVIEW spawned → FIX created → task completes
  - Chain depth tracking across multiple attempts
  - Escalation at 5th attempt

- Hung task scenarios
  - Timeout detection → REVIEW spawn → artifact capture
  - Resource exhaustion handling
  - Graceful container cleanup

### System Tests
- Production simulation
  - Multiple concurrent failing chains
  - Various failure categories
  - Escalation flow validation

- Performance benchmarks
  - REVIEW spawn latency
  - Context bundle generation time
  - Chain query performance

### Test Coverage Targets
- Review Engine: 90%+ coverage
- Chain Tracker: 95%+ coverage
- Failure Guards: 85%+ coverage (existing)
- Integration tests: All primary recovery paths

## Related Files

### Implementation Files (Existing)
- `backend/src/services/taskCompletionService.ts` - Task completion logic
- `backend/src/services/failureGuards.ts` - Failure detection and categorization
- `backend/src/services/database.ts` - Storage layer
- `backend/src/services/taskQueue.sqlite.ts` - Task queue

### Implementation Files (To Be Created)
- `backend/src/services/reviewEngine.service.ts` - Structured review generation
- `backend/src/services/chainTracker.service.ts` - Chain depth and status tracking
- `backend/src/services/recoveryAlerts.service.ts` - Alerting and escalation
- `backend/src/services/hungTaskDetector.service.ts` - Enhanced timeout detection

### Test Files
- `backend/src/services/failureGuards.test.ts` - Existing tests
- `backend/src/services/reviewEngine.test.ts` (to be created)
- `backend/src/services/chainTracker.test.ts` (to be created)
- `tests/integration/recovery-flow.test.ts` (to be created)

### Configuration Files
- `config/failure-categories.yaml` (to be created) - Failure classification rules
- `config/recovery-policies.yaml` (to be created) - Recovery action definitions
- `backend/.env` - Environment configuration

### Documentation Dependencies
- `docs/architecture/automatic-failure-recovery.md` - Recovery architecture
- `docs/architecture/failure-guards.md` - Failure guard system
- `docs/plans/ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md` - Enhancement plan
- `docs/plans/FAILURE_RECOVERY_GAP_ANALYSIS.md` - Gap analysis

### Related Designs
- `docs/technicalDesigns/staged-task-queue.md` - Chain concurrency control
- `docs/technicalDesigns/pr-self-healing-and-resilience.md` - PR-specific recovery
- `docs/technicalDesigns/dev-bot-context-management.md` - Context bundle integration
- `docs/technicalDesigns/dev-bot-foundational-upgrades.md` - Storage infrastructure

## Next Actions
- Review design with recovery/infra owners.
- Break into execution tickets aligned with implementation steps.
- Retire original plan docs after work begins under this consolidated design.

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2025-11-12 | Claude Code | Added metadata, success criteria, testing strategy, related files |
| 1.0 | 2025-11-12 | Original Author | Initial consolidated design |
