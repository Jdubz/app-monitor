# Error Detection & Recovery Design

Source Plans:
- docs/plans/ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md
- docs/plans/FAILURE_RECOVERY_GAP_ANALYSIS.md

Status: Partial. Failure guards and simple recovery exist, but structured review chains, follow-up enforcement, and alerting remain.

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

## Next Actions
- Review design with recovery/infra owners.
- Break into execution tickets aligned with implementation steps.
- Retire original plan docs after work begins under this consolidated design.
