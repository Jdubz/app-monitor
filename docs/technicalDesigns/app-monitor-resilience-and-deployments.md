# App-Monitor Resilience & Deployment Design

Source Plans:
- docs/plans/APP_MONITOR_PRODUCTION_SUPPORT_PLAN.md
- docs/plans/STUCK_PRODUCTION_PRS_AUTOMATION_PLAN.md
- docs/plans/WEBSOCKET_RESILIENCE_STRATEGY.md

Status: Partial. Systemd cleanup and client reconnection exist, but zero-downtime deploys, shared websocket state, and telemetry gaps remain.

## Objectives
1. Deliver zero-downtime blue/green deployments with formal APP_MONITOR_ROOT / DEPLOY_ROOT / ARTIFACT_ROOT contracts and automated cutover.
2. Provide webhook heartbeat metrics + alerts so stuck PR automations are visible and recoverable.
3. Implement websocket state sharing/handoff so dev-monitor users keep session state across restarts.

## Requirements (Aligned with Master Design Intent)
- Event-driven: no cron-based polling; rely on deployment hooks and webhook processors emitting events to dev-monitor.
- Human visibility: dev-monitor must show deployment state, active roots, heartbeat health, and queued failovers.
- Safety: ensure process cleanup, port ownership, and connection draining obey ProcessManager/ConnectionManager rules.

## Architecture Considerations
1. **Deployment Contracts:** Define environment variables (APP_MONITOR_ROOT, DEPLOY_ROOT, ARTIFACT_ROOT) plus validation scripts to prevent misconfigured deploys.
2. **Blue/Green Automation:** Extend systemd/service scripts to spin up new nodes, drain existing sockets (ConnectionManager), and switch traffic without downtime.
3. **Websocket State Handoff:** Use shared store (SQLite or lightweight KV) for pending socket events / user state so reconnecting clients resume seamlessly after failover.

## Implementation Steps
1. Document + enforce root contracts across deploy scripts; update CI/CD to validate before publish.
2. Build deployment orchestration script (blue/green) with health checks, drain period, and rollback.
3. Implement shared websocket session store (SQLite table or Redis-equivalent) and update ConnectionManager to persist queued events across restarts.
5. Surface deployment + heartbeat state in dev-monitor (admin tab).

## Open Questions
- Where should websocket session data live (shared SQLite vs lightweight service)?
- What latency tolerance exists for blue/green cutover (30s drain vs faster)?
- Do we need staged rollout for webhook heartbeat alerts to avoid noise?

## Next Actions
- Review design with platform/SRE owners.
- Create detailed tickets per implementation step.
- Update/retire original plan docs once these deliverables are in progress.
