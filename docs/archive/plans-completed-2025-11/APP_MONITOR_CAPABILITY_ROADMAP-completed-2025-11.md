# App Monitor Capability Roadmap (Archived)

> **Archived:** November 12, 2025  
> **Superseded by:** [PRIORITIZED_FEATURE_ROADMAP.md](../../plans/PRIORITIZED_FEATURE_ROADMAP.md) and [APP_MONITOR_STABILIZATION_PLAN.md](../../plans/APP_MONITOR_STABILIZATION_PLAN.md)

The capability roadmap captured the swimlanes that guided the push to stabilize
App Monitor before enabling autonomous task execution. The original artifact
was removed when those lanes were folded into the active planning docs, so this
summary preserves the intent for cross-reference.

## Snapshot of the November 2025 lanes

1. **Work-Target Intelligence (Stabilize)**  
   - Separate contributor workspaces from production deploy roots.  
   - Harden ProcessManager + DevBot orchestration so every task resolves paths
     via the declared work target.  
   - Exit criteria: Dev-bot jobs never mutate `/opt/app-monitor` without an
     explicit deploy gate.

2. **Service Orchestration & Control**  
   - Uniform start/stop controls for backend, frontend, workers, and Docker
     tasks exposed through Dev Monitor and the bot APIs.  
   - Health-checked restarts, log streaming, and script orchestration with
     structured logging across all services.

3. **Task Context & Automation**  
   - Continuous queue safety rails (depth limits, pause/abort hooks, context
     packs) plus Copilot/Codex reviewer integration.  
   - Data plane requirements: deterministic task manifests, reproducible
     worktrees, and regression coverage gates.

These swimlanes now live inside the prioritized roadmap so contributors do not
have to reconcile two plan formats.

## Where to look now

- **Current priorities:** `docs/plans/PRIORITIZED_FEATURE_ROADMAP.md`
- **Gatekeeping tasks:** `docs/plans/APP_MONITOR_STABILIZATION_PLAN.md`
- **Historical automation analysis:** `docs/analysis/PR_TRACKING_SYSTEM_RESILIENCE_PLAN.md`

Refer back here only if you need the exact lane names that external documents
still cite.
