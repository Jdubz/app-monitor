# STUCK_PRODUCTION_PRS_AUTOMATION_PLAN Technical Design

**Source Plan:** docs/plans/STUCK_PRODUCTION_PRS_AUTOMATION_PLAN.md
**Status:** Partial
**Outstanding Focus:** Add webhook heartbeat metrics/alerts + zero-downtime blue/green deploys.

## Objectives
- Add webhook heartbeat metrics/alerts + zero-downtime blue/green deploys.

## Plan Snapshot

# Stuck Production PRs Automation Plan
**Date:** 2025-11-12  
**Primary Owner:** Production Engineering  
**Stakeholders:** Release Engineering, SRE, QA

## Goals
- Guarantee only one backend process per environment (blue/green) via systemd ownership.
- Automate detection/remediation of duplicate Node processes before they impact webhooks.
- Add proactive monitoring for webhook silence and PR backlog growth.

## Outcomes
1. Systemd service lifecycle controls backend start/stop; manual `npm start` is disabled in production.
2. `cleanup-processes.sh` runs during deploy and via nightly cron.
3. Webhook health check alerts if no events processed for >1 hour.
4. Deployment checklist updated with verification steps for active port and process count.

## Workstreams
### 1. Service Management Hardening (P0)
- [ ] Update `deployment/app-monitor.service` to enforce `Restart=always`, `User=appmonitor`, `Environment=PORT=<blue|green>`.
- [ ] Add `systemd` drop-in that fails start if another instance already binds the target port.
- [ ] Remove/lock down manual `npm start` scripts on production boxes.

### 2. Cleanup Automation (P0)
- [ ] Finalize `scripts/cleanup-processes.sh` with safeguards (dry-run + confirm flag).
- [ ] Integrate cleanup script into deploy pipeline (pre-swap step) and daily cron at 02:00 local.
- [ ] Emit log + metric summarizing killed PIDs and surviving process per port.

### 3. Webhook Health Monitoring (P1)
- [ ] Instrument backend to increment `webhook_events_processed` metric.
- [ ] Alert if metric flatlines for >60 minutes or if backlog >25 items.
- [ ] Add dashboard tile showing active port, PID, webhook throughput.

### 4. Runbooks & Training (P1)
- [ ] Update `docs/runbooks/deployments.md` with blue/green + cleanup steps.
- [ ] Record short loom/video or doc for on-call engineers describing recovery process.
- [ ] Add checklist to PR template verifying cleanup + monitoring steps complete post-merge.

## Timeline
| Date | Deliverable |
|------|-------------|


## Requirements
- Refer to the source plan for full requirement breakdown; key deliverables must satisfy the outstanding focus above.

## Architecture Considerations
- Define system boundaries, data flows, and integrations described in the plan.
- Ensure compatibility with the updated master design intent.

## Implementation Steps
1. Review the source plan sections relevant to this feature.
2. Break work into milestones (schema, services, UI, telemetry, etc.).
3. Update dev-monitor visibility and automation hooks as needed.
4. Add automated tests per subsystem.

## Open Questions
- Identify unresolved decisions noted in the plan.
- Capture new questions discovered during implementation.

## Next Actions
- Schedule design review with architecture owners.
- Flesh out detailed sub-designs (schema, API, UI) as required.
- Create execution tickets once this design is ratified.
