# PR Tracking System Resilience Plan
**Date:** 2025-11-12  
**Primary Owner:** SRE  
**Stakeholders:** Backend Platform, Release Engineering, Product Ops

## Vision
Build a PR tracking platform that survives deployments, recovers automatically from data loss, and provides real-time visibility into stuck PRs.

## Target Outcomes
1. Single authoritative SQLite (or Postgres) database for PR tracking + tasks, replicated to standby storage.
2. Automated backup + restore pipeline with <5 minute RPO and <15 minute RTO.
3. Deployment workflow that prevents accidental database wipes (blue/green aware, safety checks).
4. Monitoring/alerting that detects stalled PR processing within 5 minutes.

## Workstreams
### A. Data Layer Consolidation
- [ ] Decide on target storage (SQLite on shared volume vs managed Postgres).
- [ ] Update services to use shared connection helper + DSN env var.
- [ ] Migrate data from `dev-bots.db` + `app-monitor.db` into consolidated schema.
- [ ] Implement migration verification script comparing record counts + sample hashes.

### B. Backup & Recovery Automation
- [ ] Create `scripts/backup-pr-tracker.sh` (cron every 15 minutes) storing encrypted snapshots in `/opt/app-monitor/backups/` + cloud bucket.
- [ ] Add `scripts/restore-pr-tracker.sh` with automated smoke test (list PRs, diff counts).
- [ ] Document recovery runbook including RACI + contact list.

### C. Deployment Safety
- [ ] Extend deploy pipeline to block if backup age > 30 minutes.
- [ ] Add pre-deploy hook verifying both blue/green nodes stop old process before unlinking `current`.
- [ ] Enforce single source of truth for database path via environment validation.
- [ ] Add integration test that performs blue/green swap without data loss using staging env.

### D. Monitoring & Auto-Healing
- [ ] Emit heartbeat metric each time a PR webhook is processed.
- [ ] Alert if no heartbeat for >5 minutes or backlog >10 PRs.
- [ ] Add self-healing job that replays missed webhooks when alert fires.
- [ ] Dashboard showing PR states, active tasks, database health.

## Timeline (Phased)
| Phase | Window | Deliverables |
|-------|--------|--------------|
| P0 | Nov 12-13 | Storage decision, DSN env plumbing |
| P1 | Nov 14-16 | Migration tooling, initial data move |
| P2 | Nov 17-18 | Backup/restore automation |
| P3 | Nov 19-20 | Deployment safety gates |
| P4 | Nov 21 | Monitoring dashboard + alerts |

## Dependencies
- Access to production servers under `/opt/app-monitor`.
- Secrets management for backup bucket credentials.
- Observability stack capacity for new metrics.

## Risks & Mitigations
- **Migration downtime:** plan maintenance window + read-only mode; have rollback script ready.
- **Backup storage costs:** prune snapshots >14 days, compress dumps.
- **Alert fatigue:** implement warm-up period + auto-snooze when deploy in progress.

## Exit Criteria
- Consolidated database verified and referenced by all services.
- Automated backup job logs success across 3 cycles; restore test passes.
- Deployment pipeline enforces safety checks and rejects missing backups.
- Monitoring dashboard live with alert IDs documented in `docs/runbooks/pr-tracker.md`.
