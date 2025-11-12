# PR Creation Automation Restore Plan
**Date:** 2025-11-12  
**Primary Owner:** Dev-Bots Platform  
**Stakeholders:** Infrastructure, Security, Release Engineering

## Objectives
1. Unblock automated `gh pr create` calls for task workers.
2. Provide deterministic diagnostics + alerting when PR creation fails.
3. Remove dependency on host keyring so containerized workers remain stateless.

## Success Metrics
- 100% of successful task runs open PRs automatically (verified across 10 task executions).
- PR creation failures emit PagerDuty alert within 2 minutes with actionable context.
- Token rotation can be done via file update + ENV variable without rebuilding containers.

## Workstreams & Tasks
### 1. Credential Path Alignment (P0)
- [ ] Update `ephemeralWorker.service.ts` to pass `HOME=/home/node` (or container user env) when spawning the worker.
- [ ] Add runtime logging for `process.env.HOME`, mount targets, and `gh` binary path (info-level, redact secrets).
- [ ] Update docker compose/k8s spec to mount `~/.config/gh` read/write under the resolved HOME.

### 2. Token Distribution Hardening (P0)
- [ ] Switch host authentication to file-based storage (`hosts.yml` with `oauth_token`).
- [ ] Provision scoped automation PAT and store encrypted copy in `/opt/app-monitor/secrets/pr-bot.token`.
- [ ] Export `GITHUB_TOKEN` for worker containers via systemd drop-in + CI secrets.

### 3. Health Checks & Fallbacks (P1)
- [ ] After each task run, execute `gh pr status` to verify session validity; fail fast if unauthenticated.
- [ ] Emit structured log + metric (`pr_creation_failure`) with branch, task id, exit code.
- [ ] Add runbook + script (`scripts/manual-create-pr.sh`) to recreate PRs when automation fails.

### 4. Regression Testing (P1)
- [ ] Build disposable container that mirrors production mounts and run `gh pr create --dry-run` in CI.
- [ ] Add contract test ensuring `taskExecution.service.ts` surfaces PR URLs back to the orchestrator.
- [ ] Simulate token expiry to ensure alert path fires.

## Timeline
| Date | Milestone |
|------|-----------|
| Nov 12 (EOD) | HOME override + logging merged
| Nov 13 | Token storage migration + PAT distribution completed
| Nov 14 | Health checks & alerting live
| Nov 15 | Regression test suite green + incident closed

## Dependencies
- Security approval for new PAT scope.
- Access to `/opt/app-monitor` for systemd environment overrides.
- Observability pipeline (Grafana/Prometheus) for new metrics.

## Risks & Mitigations
- **Secret handling errors** → use SOPS/age to store PAT and automate decryption in deployment pipeline.
- **`gh` CLI updates** → pin CLI version in worker image and add automated update check monthly.
- **Alert fatigue** → include suppression logic (only alert after 2 consecutive failures).

## Exit Checklist
1. Dry-run container confirms `gh auth status` is logged in with mounted creds.
2. Automated test task completes with PR link stored in task metadata and comment posted to GitHub.
3. Alert runbook documented in `docs/runbooks/pr-creation.md`.
4. Investigation doc updated to mark closure and link to this plan.
