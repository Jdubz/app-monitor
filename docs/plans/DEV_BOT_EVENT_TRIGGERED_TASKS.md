# Dev-Bot Event-Triggered Task Pack

**Status:** Draft for implementation  
**Last Updated:** November 9, 2025  
**Owner:** Dev-Bot Platform

---

## Purpose

Codify four automation flows that plug into the existing dev-bot task orchestration without relying on cron-style timers. Each flow is triggered by concrete runtime signals (webhook, coordinator state change, worker telemetry) and results in one or more first-class tasks that the queue can schedule using the current agent personalities and Docker isolation.

---

## Architectural Fit

- **Task Ingestion:** All flows use the existing TaskQueueManager + TaskBridge, so downstream components (Dockerized agents, monitoring UI, logging) continue to work unchanged.  
- **Event Sources:** GitHub webhooks, coordinator status events, ContextIsolation telemetry, and task chain completions are already emitted inside dev-monitor; we simply subscribe and translate them into tasks.  
- **Learning Loop:** Outputs are persisted through the adaptive learning store and coordinator logs, reinforcing the current quality/learning architecture.

---

## Automation Concepts

### 1. PR Gatekeeper Chain
- **Trigger:** GitHub webhook (`pull_request` labeled `bot-qa`) where CI status == success. Webhook handler calls the dev-monitor API to enqueue automation requests.  
- **Task Graph:**  
  1. `review` task (Casey) with context: PR metadata, diff summary, acceptance criteria, prior learning hints.  
  2. On success, enqueue a `testing` task (Jules) that runs regression commands / validation scripts referenced in the work-target registry.  
- **Integration Notes:**  
  - Extend `TaskBridge` to accept “chained tasks” so the testing task is automatically inserted when the review task signals completion.  
  - Store each verdict in task artifacts for downstream merge checks; PR cannot merge until both tasks are `completed`.  
- **Expected Outcome:** Every labeled PR receives deterministic code review + regression coverage before merge without manual babysitting.

### 2. Failure Autopsy & Auto-Heal Pack
- **Trigger:** `claudeWorkersManager` transitions a task to `failed` **or** ScopeCreepDetector emits a HIGH violation event.  
- **Task Graph:**  
  1. `diagnostic` task routed to Casey or Alex based on task type; instructions include container logs, exit codes, and file diffs.  
  2. Follow-up `healing` task that reissues the original intent with refined scope/context assembled from diagnostic output and the learning dataset.  
- **Integration Notes:**  
  - Extend failure handling middleware to publish a `task.failure` event and attach artifacts to `learning-patterns.json`.  
  - Healing task references the same chainId so dashboards visualize the full recovery lifecycle.  
- **Expected Outcome:** Failures automatically produce actionable remediation tasks instead of ad-hoc retries, improving the adaptive learning data quality.

### 3. Context Drift Mitigation Task
- **Trigger:** `ContextIsolationManager` detects either `contextSize > maxContextSize` or `contextAge > maxContextAge` for an active session.  
- **Task Graph:** Single `scope-trim` task assigned to Morgan (documentation) plus the owning specialist (Alex/Sam/etc.) via multi-agent instructions.  
- **Integration Notes:**  
  - Emit a `context.threshold.exceeded` event containing offending files; TaskBridge converts it into a task with instructions to prune artifacts, tighten file allowlists, and refresh prompts.  
  - Task completion updates isolation config (or queue metadata) before the original task resumes.  
- **Expected Outcome:** Proactively enforces lightweight contexts and prevents runaway sessions without relying on periodic cleanup jobs.

### 4. Release-Readiness Insight Task
- **Trigger:** Coordinator detects that N tasks sharing the same `chainId` or feature label finished successfully (configurable threshold, default 3).  
- **Task Graph:** `release-analysis` task assigned to Jordan (DevOps) with Morgan as secondary reviewer. Inputs include task outputs, test summaries, learning metrics, and linked PRs.  
- **Integration Notes:**  
  - When TaskQueueManager marks the qualifying task complete, publish `feature.slice.completed`. Listener aggregates artifacts and queues the insight task with instructions to summarize readiness, blockers, and recommended follow-ups.  
- **Expected Outcome:** Produces human-friendly readiness briefs exactly when a feature slice finishes, powering the “periodic analysis engine” effect without timers.

---

## Implementation Checklist
1. Add event listeners (webhook handler, coordinator hooks, context isolation notifier, chain-completion observer) that normalize payloads into the task creation schema.  
2. Extend TaskBridge to support chained/conditional task insertion.  
3. Update shared contracts so new task types (`diagnostic`, `healing`, `scope-trim`, `release-analysis`) include required context fields.  
4. Teach the adaptive learning module to tag outputs from these flows for downstream analytics.  
5. Document operator runbooks (label conventions, artifact expectations) in `docs/dev-bots` once implementation lands.

---

## Open Questions
- Should diagnostic vs. healing task ownership be auto-determined purely by task type, or should humans be able to override via task metadata?  
- What’s the right value for `N` in the release-readiness trigger across different work-targets?  
- Do we need additional security gates before auto-enqueuing tasks that might touch production-facing configs?

---

These additions keep the automation pipeline event-driven, leverage the existing agent personalities, and enrich both quality and learning systems without introducing cron jobs or manual babysitting.
