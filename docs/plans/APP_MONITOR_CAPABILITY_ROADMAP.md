# App Monitor Capability Roadmap

**Version:** 0.1.0  
**Last Updated:** 2025-11-06  
**Owner:** Platform Tooling (personal experiment)

> Capability swimlanes ordered from **Stabilize → Proof of Concept → Autonomy**.  
> Stabilization work is the gate before shipping the continuous task queue.

---

## Platform Stability & Infrastructure
- **Stabilize**
  - Resolve frontend TypeScript build errors (`DevBotsPanel`, `EnhancedLogsViewer`, `EnhancedTaskCreationForm`, etc.).
  - Unblock backend safe runner by fixing the hanging `ProcessManager` integration specs.
  - Re-enable pre-push hooks (`lint` + `test:backend` / `test:frontend`) once suites are green.
- **POC**
  - Add smoke-test job per work-target (basic build/test) and expose status in dashboard.
  - Ensure nightly lint/test cron or manual runner keeps regressions visible.
- **Autonomy**
  - Bots open stabilization tasks automatically on failures (tests/builds), produce diffs, and gate on human review only when confidence < target threshold.

## Work-Target Intelligence (SQLite Registry)
- **Stabilize**
  - Migrate JSON work-target configs plus doc pointers into `dev-bots.db` (services, repos, env expectations, doc indices).
  - Provide migration scripts that back up prior JSON files for rollback.
- **POC**
  - Extend schema for documentation catalogs and service metadata (control commands, health hints, logging sources).
  - Surface registry data in UI for quick reference.
- **Autonomy**
  - Allow bots to append/update registry entries after successful modifications, with automated diff review and rollback history.

## Service Orchestration & Control
- **Stabilize**
  - Align ProcessManager definitions with existing start/stop scripts for app-monitor + job-finder services.
  - Document gaps for portfolio/imagineer to avoid duplicate orchestration logic.
- **POC**
  - Onboard remaining work-target services into registry, including dependency graphs and environment notes.
  - Add UI controls per target layout for start/stop/kill with serial/parallel execution awareness.
- **Autonomy**
  - Queue-aware bots schedule service restarts/fixes, validate health post-action, and only mark tasks complete after verification.

## Logging & Observability
- **Stabilize**
  - Validate existing file tails for app-monitor; confirm dev-bots can fetch log slices without touching SQLite.
  - Patch parsers for job-finder/portfolio/imagineer formats as needed.
- **POC**
  - Connect job-finder, portfolio, imagineer log sources (file + GCP) to unified API/UI; add saved queries per target.
  - Expose lightweight log context endpoints for agents.
- **Autonomy**
  - Bots capture “log recipes” when solving incidents and reuse them automatically in diagnostics.

## Task Context & Automation
- **Stabilize**
  - Document the desired architecture (see `docs/dev-monitor/DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md`), schema requirements, and dev-bot pipeline expectations.
  - Add JSON Schema scaffolding and TypeScript types for task context payloads (description, environment, logs, network events, optional artifacts).
- **POC**
  - Extend the task API/UI to accept context-rich submissions, persist them in SQLite, and expose admin tooling for review/retention.
  - Stand up the TaskAutomationManager and Docker runner with per-work-target configuration, plus initial bootstrap script.
- **Autonomy**
  - Containerized remediation agents (Claude/Codex/scripts) process eligible tasks, attach artifacts, log automation events, and feed results back into the continuous queue for future prioritization.

## Dev-Bot Experience & Tasking
- **Stabilize**
  - Verify Claude/Codex containers launch reliably; confirm task persistence backups and `task_executions` schema coverage.
- **POC**
  - Stand up continuous task queue: bots pull prioritized work, update status, and store metrics (accuracy, tokens, speed).
  - Provide UI summary of active/queued tasks and dependency chains.
- **Autonomy**
  - Dynamic personality routing based on success metrics; implement experimentation knob with guardrails for high-confidence auto-merges.

## Agent Console & UI
- **Stabilize**
  - Fix layout/type issues across dev-bot panels; ensure minimal UI remains functional.
- **POC**
  - Implement agent terminal tab with WebSocket-backed sessions (session logs stored as rotating flat files).
  - Support per-work-target layouts (service grid, log panes, task sidebar).
- **Autonomy**
  - Adaptive UI surfaces bot recommendations, auto-populates planning prompts, and highlights confidence per decision.

## Token & Budget Awareness
- **Stabilize**
  - Ensure token logging occurs for every completion; add manual budget fields in SQLite.
- **POC**
  - Build budget dashboard showing rolling totals vs. limits and soft alerts for projected overages.
  - Support manual import of provider usage exports when available.
- **Autonomy**
  - Task queue throttles itself based on budgets, schedules cost-heavy work intelligently, and proposes budget adjustments with supporting metrics.

## Deployment & Operations
- **Stabilize**
  - Run backend/frontend via systemd (or PM2) with graceful restart scripts; confirm CI pushes to `main` trigger restart and log outcome.
- **POC**
  - Provide optional Docker Compose profile for hosting; add Cloudflare tunnel placeholder config and Google OAuth stubs (local-only).
- **Autonomy**
  - Bots prepare release PRs, validate in staging, and approve production redeploy automatically when quality gates and confidence thresholds pass.

## Security & Access Control
- **Stabilize**
  - Inventory secrets (1Password vs. container mounts); tighten container volume permissions; document Cloudflare/Google OAuth requirements.
- **POC**
  - Integrate Google OAuth for UI gate; instrument audit logs for agent terminal sessions; standardize secret templates per target.
- **Autonomy**
  - Bots audit secret usage, rotate mounted credentials, and raise tasks when stale/unused secrets remain.

## Data & Analytics
- **Stabilize**
  - Finalize SQLite schema migrations (tasks, executions, reviews, work-target metadata); add nightly backup + restore playbook.
- **POC**
  - Build analytics primitives (per-target success score, token usage trends, velocity metrics) and expose query endpoints for bots.
- **Autonomy**
  - Schedule self-review tasks that compute trend regressions and feed prioritized improvements back into the queue.

## Continuous Task Queue (Core Loop)
- **Stabilize**
  - After core suites are green, implement queue backend with dependency tracking and status transitions.
- **POC**
  - Dedicate a bot (or mode) to backlog grooming: ingest tasks, order by priority/impact, schedule execution windows, record metrics automatically.
- **Autonomy**
  - Queue becomes self-feeding: bots generate improvement tasks post-review, adjust priorities via success metrics, and keep the system iterating without human intervention beyond strategic planning sessions.

---

**Execution Notes**
- Complete *Stabilize* items per swimlane before enabling the continuous task queue for that capability.
- Once the queue is live, let bots own incremental improvements in the *POC* and *Autonomy* stages, with manual interventions only when confidence scores fall below agreed thresholds.

---

## Research & Expansion Backlog (from Legacy Plans)
- **Agent Experimentation (Claude & Codex)**  
  - Maintain personality library with specialization metrics; schedule comparative experiments once autonomy lane is live.  
  - Track cost/quality trade-offs per model/provider to inform routing.
- **Copilot & External Review Integrations**  
  - Evaluate leveraging GitHub Copilot or third-party review tools (e.g., Code Climate) for asynchronous review hints; bots should treat external feedback as advisory.  
  - Define safe pathways for PR suggestions without granting merge rights to external services.
- **Script Consolidation & Developer Experience**  
  - Continue vision of centralizing repo-specific scripts through App Monitor UI once task queue is stable.  
  - Ensure legacy Makefile/CLI workflows remain accessible until parity is confirmed.
- **Evolutionary Autonomy Goals**  
  - Long-term objective remains a self-improving platform that tunes prompts, quality gates, and capacity planning automatically.  
  - Revisit phased autonomy roadmap (Foundation → Multi-Model → Full Autonomy) after stabilization deliverables prove reliable.
