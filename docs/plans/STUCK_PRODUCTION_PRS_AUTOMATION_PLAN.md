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
| Nov 12 | systemd updates + cleanup script merged |
| Nov 13 | Deploy pipeline invokes cleanup + verifies single process |
| Nov 14 | Monitoring + alerts live |
| Nov 15 | Training/runbooks published |

## Dependencies
- sudo access on production servers.
- Observability stack for metrics + alerting.
- Release coordination to schedule short maintenance window for service restart.

## Risks/Mitigations
- **Service restart failure** → keep rollback script to relink previous release.
- **Cleanup script killing wrong PID** → implement allowlist + confirmation prompt showing command + port before action.
- **Alert fatigue** → include damping (require 2 consecutive missed webhook intervals).

## Exit Criteria
- Deployment logs show cleanup script ran and only one PID remains per port.
- systemd status reports active service on blue & green with consistent environment variables.
- Monitoring dashboard displays webhook throughput + alerts tested via manual webhook pause.
- Investigation `docs/investigations/STUCK_PRS_RESOLUTION.md` updated to note closure.
