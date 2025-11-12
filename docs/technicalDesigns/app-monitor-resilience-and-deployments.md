# App-Monitor Resilience & Deployment Design

## Document Metadata

| Field | Value |
|-------|-------|
| **Status** | 🟡 Partial Implementation |
| **Priority** | P1 |
| **Dependencies** | None (infrastructure foundation) |
| **Last Updated** | November 12, 2025 |
| **Implementation Progress** | 50% (systemd cleanup exists, migration safety added, zero-downtime & websocket state pending) |

## Quick Reference

**What**: Zero-downtime blue/green deployments with formal root contracts, webhook heartbeat metrics/alerts, and websocket state handoff for session continuity across restarts.

**Why**: Production stability requires deployments without service interruption, visibility into webhook health for stuck PR detection, and seamless user experience during updates.

**Current Status**: Systemd cleanup and client reconnection working. Need zero-downtime deploys, shared websocket state, and heartbeat telemetry.

## Source Plans
- `docs/plans/APP_MONITOR_PRODUCTION_SUPPORT_PLAN.md`
- `docs/plans/STUCK_PRODUCTION_PRS_AUTOMATION_PLAN.md`
- `docs/plans/WEBSOCKET_RESILIENCE_STRATEGY.md`

## Table of Contents

1. [Objectives](#objectives)
2. [Requirements (Aligned with Master Design Intent)](#requirements-aligned-with-master-design-intent)
3. [Architecture Considerations](#architecture-considerations)
4. [Implementation Steps](#implementation-steps)
5. [Success Criteria](#success-criteria)
6. [Testing Strategy](#testing-strategy)
7. [Related Files](#related-files)

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
4. Add webhook heartbeat monitoring service with metrics and alerting.
5. Surface deployment + heartbeat state in dev-monitor (admin tab).

## Open Questions
- Where should websocket session data live (shared SQLite vs lightweight service)?
- What latency tolerance exists for blue/green cutover (30s drain vs faster)?
- Do we need staged rollout for webhook heartbeat alerts to avoid noise?

## Success Criteria

### Phase 1: Deployment Contracts (⏳ Pending)
- ⏳ Environment variables defined (APP_MONITOR_ROOT, DEPLOY_ROOT, ARTIFACT_ROOT)
- ⏳ Validation scripts created and integrated in CI/CD
- ⏳ Documentation updated with contract requirements
- ⏳ All deployment scripts enforce contracts

### Phase 2: Blue/Green Deployment (⏳ Pending)
- ⏳ Deployment orchestration script implemented
- ⏳ Health check integration
- ⏳ Connection draining via ConnectionManager
- ⏳ Traffic cutover automation
- ⏳ Automatic rollback on health check failure
- ⏳ 30-second drain period enforced

### Phase 3: Websocket State Handoff (⏳ Pending)
- ⏳ Shared state store designed (SQLite table or KV store)
- ⏳ ConnectionManager updated to persist queued events
- ⏳ Session restoration on client reconnect
- ⏳ State cleanup for completed sessions

### Phase 4: Webhook Heartbeat Monitoring (⏳ Pending)
- ⏳ Heartbeat service implemented
- ⏳ Metrics collection (last webhook time, event counts)
- ⏳ Alert rules configured (> 15 min silence)
- ⏳ Dev-monitor dashboard integration
- ⏳ Stuck PR detection and alerts

### Phase 5: Observability (⏳ Pending)
- ⏳ Dev-monitor shows deployment state
- ⏳ Active roots displayed
- ⏳ Heartbeat health visible
- ⏳ Manual failover controls
- ⏳ Rollback functionality

### Acceptance Criteria
1. **Zero Downtime**: 0 dropped websocket connections during deployment
2. **Session Continuity**: 100% of active sessions resume post-deploy
3. **Deployment Speed**: Blue/green cutover completes in < 60 seconds
4. **Heartbeat Reliability**: Webhook heartbeat alerts fire within 5 minutes of silence
5. **Rollback Speed**: Automatic rollback on failure within 30 seconds
6. **Visibility**: Deployment state visible in dev-monitor with < 5 second lag

## Testing Strategy

### Unit Tests
- **Deployment Contract Validation**
  - Environment variable presence checks
  - Path validation
  - Contract violation detection

- **Connection Draining**
  - Active connection counting
  - Graceful disconnect signaling
  - Drain period enforcement

- **Websocket State Persistence**
  - State serialization/deserialization
  - Event queuing
  - Session restoration

- **Heartbeat Monitoring**
  - Last event time tracking
  - Alert rule evaluation
  - Stuck detection logic

### Integration Tests
- Blue/green deployment flow
  - Deploy new version → health check → drain → cutover → verify
  - Websocket clients maintain connections
  - State restored after cutover

- Heartbeat monitoring
  - Webhook event → heartbeat update
  - Silence period → alert fired
  - Recovery → alert cleared

- Rollback scenarios
  - Health check failure → automatic rollback
  - Manual rollback triggered
  - State consistency maintained

### System Tests
- Production simulation
  - Deploy under load (10+ active connections)
  - Verify 0 dropped connections
  - Session state preservation

- Failure scenarios
  - New version fails health check → rollback
  - Database unavailable during drain → safe handling
  - Webhook service down → alerts fired

- Performance validation
  - Deployment completes in < 60s
  - Drain period effective (no hanging connections)
  - Rollback completes in < 30s

### Test Coverage Targets
- Deployment orchestration: 90%+ coverage
- Connection draining: 95%+ coverage
- State handoff: 90%+ coverage
- Heartbeat monitoring: 85%+ coverage

### Performance Benchmarks
- Deployment cutover: < 60s
- Connection drain: 30s (configurable)
- State restoration: < 2s per session
- Heartbeat check: < 100ms
- Rollback: < 30s

## Related Files

### Implementation Files (Existing)
- `backend/src/services/processManager.ts` - Process lifecycle management
- `backend/src/services/connectionManager.ts` - Websocket connection handling
- `backend/src/services/database.ts` - Database layer
- `scripts/production/deploy.sh` - Deployment script (needs enhancement)

### Implementation Files (To Be Created)
- `scripts/production/blue-green-deploy.sh` - Blue/green orchestration
- `scripts/production/validate-deployment-contracts.sh` - Contract validation
- `backend/src/services/websocketStateStore.ts` - Shared state management
- `backend/src/services/webhookHeartbeat.service.ts` - Heartbeat monitoring
- `backend/src/services/deploymentOrchestrator.ts` - Deployment logic
- `backend/migrations/015_websocket_state.sql` - State store schema

### Test Files (To Be Created)
- `backend/src/services/__tests__/deploymentOrchestrator.test.ts`
- `backend/src/services/__tests__/websocketStateStore.test.ts`
- `backend/src/services/__tests__/webhookHeartbeat.test.ts`
- `tests/integration/blue-green-deployment.test.ts`
- `tests/integration/websocket-handoff.test.ts`

### Configuration Files
- `backend/.env` - Root paths and deployment settings
- `scripts/production/systemd/app-monitor-backend@.service` - Service template
- `config/deployment-health-checks.yaml` (to be created) - Health check definitions
- `config/heartbeat-rules.yaml` (to be created) - Alert thresholds

### Frontend Files
- `frontend/src/components/DeploymentStatus.tsx` (to be created) - Deployment dashboard
- `frontend/src/components/WebhookHealth.tsx` (to be created) - Heartbeat monitoring

### Documentation Dependencies
- `docs/plans/APP_MONITOR_PRODUCTION_SUPPORT_PLAN.md` - Production requirements
- `docs/guides/PRODUCTION_DEPLOYMENT.md` - Deployment procedures
- `docs/guides/PRODUCTION_SETUP_QUICKSTART.md` - Setup guide

### Related Designs
- `docs/technicalDesigns/pr-self-healing-and-resilience.md` - Webhook reliability
- `docs/architecture/dev-monitor-architecture.md` - Websocket architecture

## Next Actions
- Review design with platform/SRE owners.
- Create detailed tickets per implementation step.
- Update/retire original plan docs once these deliverables are in progress.

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2025-11-12 | Claude Code | Added metadata, success criteria, testing strategy, related files |
| 1.0 | 2025-11-12 | Original Author | Initial consolidated design |
