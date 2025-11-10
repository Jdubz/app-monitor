# App Monitor Capability Roadmap

**Version:** 0.2.0
**Last Updated:** 2025-11-06
**Owner:** Platform Tooling (personal experiment)

> Capability swimlanes ordered from **Stabilize → Proof of Concept → Autonomy**.
> Stabilization work is the gate before shipping the continuous task queue.
>
> **v0.2.0 Changes:** Integrated prompt engineering v3, healing system, scope control, periodic maintenance, and enhanced learning systems from dev-bots documentation analysis.

---

## Platform Stability & Infrastructure
- **Stabilize**
  - Resolve frontend TypeScript build errors (`DevBotsPanel`, `EnhancedLogsViewer`, `EnhancedTaskCreationForm`, etc.).
  - Unblock backend safe runner by fixing the hanging `ProcessManager` integration specs.
  - ✅ (2025-11-08) Re-enabled pre-push hooks (`lint` + `test:backend` / `test:frontend`) after suites returned to green; `.husky/pre-push` now enforces both.
- **POC**
  - Add smoke-test job per work-target (basic build/test) and expose status in dashboard.
  - Ensure nightly lint/test cron or manual runner keeps regressions visible.
- **Autonomy**
  - Bots open stabilization tasks automatically on failures (tests/builds), produce diffs, and gate on human review only when confidence < target threshold.

## Work-Target Intelligence (SQLite Registry)
- **Stabilize**
  - Migrate JSON work-target configs plus doc pointers into `app-monitor.db` (services, repos, env expectations, doc indices).
  - Provide migration scripts that back up prior JSON files for rollback.
- **POC**
  - Extend schema for documentation catalogs and service metadata (control commands, health hints, logging sources).
  - Surface registry data in UI for quick reference.
  - Implement automated task discovery from issue patterns and log analysis.
  - Add per-work-target success metrics and bot performance tracking.
  - Create documentation catalog with semantic search capabilities.
- **Autonomy**
  - Allow bots to append/update registry entries after successful modifications, with automated diff review and rollback history.
  - Auto-generate tasks from detected issues across all work targets.
  - Dynamic work-target configuration based on success patterns and performance metrics.

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
  - ✅ **COMPLETE:** Ephemeral container implementation with tar | docker cp pattern (see DEV_BOT_EPHEMERAL_CONTAINER_MIGRATION.md).
  - ✅ **COMPLETE:** Safety mechanisms (uncommitted changes detection, patch files, git status capture).
  - Document the desired architecture (see `docs/dev-monitor/DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md`), schema requirements, and dev-bot pipeline expectations.
  - Add JSON Schema scaffolding and TypeScript types for task context payloads (description, environment, logs, network events, optional artifacts).
  - Implement v3 prompt template system with validation (see BOT_PROMPT_ENGINEERING_V3.md).
  - Create task template library for common patterns (migrations, extensions, bugfixes, refactors).
  - Add scope validation rules to task creation with `doNotCreate` and `mustNotDuplicate` fields.
- **POC**
  - Extend the task API/UI to accept context-rich submissions, persist them in SQLite, and expose admin tooling for review/retention.
  - Stand up the TaskAutomationManager and Docker runner with per-work-target configuration, plus initial bootstrap script.
  - Implement healing system for auto-recovery from failed tasks (pattern recognition, task refinement, auto-retry).
  - Add real-time scope monitoring with boundary validation during task execution.
  - Build auto-recovery system for scope violations (tighten boundaries, regenerate tasks).
  - Create template-based task creation UI with validation enforcement.
- **Autonomy**
  - Containerized remediation agents (Claude/Codex/scripts) process eligible tasks, attach artifacts, log automation events, and feed results back into the continuous queue for future prioritization.
  - Predictive task refinement based on learned failure patterns.
  - Self-adjusting scope boundaries based on success patterns.
  - Automatic healing and retry with escalation to human only when confidence < threshold.

## Dev-Bot Experience & Tasking
- **Stabilize**
  - Verify Claude/Codex containers launch reliably; confirm task persistence backups and `task_executions` schema coverage.
  - Enforce mandatory investigation phase in all task templates (read existing code before implementing).
  - Add pre-implementation checklists to task workflow.
- **POC**
  - Stand up continuous task queue: bots pull prioritized work, update status, and store metrics (accuracy, tokens, speed).
  - Provide UI summary of active/queued tasks and dependency chains.
  - Track scope compliance, duplication rate, and git workflow success metrics per bot.
  - Implement learning database for task pattern success/failure tracking.
  - Create scope metrics dashboard with violation alerts.
- **Autonomy**
  - Dynamic personality routing based on success metrics (historical success rates, specialization, token efficiency, time-to-completion).
  - Implement experimentation knob with guardrails for high-confidence auto-merges.
  - Predictive failure prevention based on learned patterns.
  - Self-optimizing agent selection using A/B testing and performance data.

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
  - Define success metrics: scope compliance (100% target), duplication rate (0% target), git workflow success (100% target), feature creep (0% target).
- **POC**
  - Build analytics primitives (per-target success score, token usage trends, velocity metrics) and expose query endpoints for bots.
  - Implement cross-system learning data integration (connect adaptive learning with coordinator).
  - Add learning effectiveness validation with A/B testing framework.
  - Track healing system effectiveness (auto-recovery success rate, pattern recognition accuracy).
- **Autonomy**
  - Schedule self-review tasks that compute trend regressions and feed prioritized improvements back into the queue.
  - Predictive analytics for failure prevention and capacity planning.
  - Self-tuning quality thresholds based on historical performance data.

## Periodic Maintenance & Quality
- **Stabilize**
  - Define cleanup task types and scheduling strategy (linting: 6h, deduplication: 12h, documentation: 24h, testing: 48h, deep cleanup: weekly).
  - Create deduplication detection algorithms with similarity thresholds.
  - Define quality metrics: code duplication rate, linting pass rate, test coverage, documentation freshness.
- **POC**
  - Implement periodic scheduler for automated maintenance tasks.
  - Add code deduplication engine with pattern detection and consolidation recommendations.
  - Create linting engine with auto-fix capabilities (style, bugs, performance, security).
  - Build testing engine for coverage analysis and gap detection (80% minimum target).
  - Implement documentation cleanup engine (outdated, inconsistent, missing, redundant detection).
  - Set up codebase health monitoring with alert thresholds (yellow: 20% duplication, red: 30% duplication).
- **Autonomy**
  - Self-scheduling cleanup based on codebase health metrics and quality degradation detection.
  - Predictive maintenance scheduling to prevent quality issues before they occur.
  - Automated cleanup with human approval only for high-risk changes.
  - Continuous quality improvement loop with self-tuning thresholds.

## Continuous Task Queue (Core Loop)
- **Stabilize**
  - After core suites are green, implement queue backend with dependency tracking and status transitions.
- **POC**
  - Dedicate a bot (or mode) to backlog grooming: ingest tasks, order by priority/impact, schedule execution windows, record metrics automatically.
  - Integrate periodic maintenance tasks into queue scheduling.
- **Autonomy**
  - Queue becomes self-feeding: bots generate improvement tasks post-review, adjust priorities via success metrics, and keep the system iterating without human intervention beyond strategic planning sessions.
  - Auto-generation of maintenance and quality improvement tasks based on monitoring data.

---

**Execution Notes**
- Complete *Stabilize* items per swimlane before enabling the continuous task queue for that capability.
- Once the queue is live, let bots own incremental improvements in the *POC* and *Autonomy* stages, with manual interventions only when confidence scores fall below agreed thresholds.

---

## Research & Expansion Backlog (from Legacy Plans)
- **Agent Experimentation (Claude & Codex)**
  - Maintain personality library with specialization metrics; schedule comparative experiments once autonomy lane is live.
  - Track cost/quality trade-offs per model/provider to inform routing.
  - Implement A/B testing framework for agent personality effectiveness.
- **Copilot & External Review Integrations**
  - Evaluate leveraging GitHub Copilot or third-party review tools (e.g., Code Climate) for asynchronous review hints; bots should treat external feedback as advisory.
  - Define safe pathways for PR suggestions without granting merge rights to external services.
- **Script Consolidation & Developer Experience**
  - Continue vision of centralizing repo-specific scripts through App Monitor UI once task queue is stable.
  - Ensure legacy Makefile/CLI workflows remain accessible until parity is confirmed.
- **Evolutionary Autonomy Goals**
  - Long-term objective remains a self-improving platform that tunes prompts, quality gates, and capacity planning automatically.
  - Revisit phased autonomy roadmap (Foundation → Multi-Model → Full Autonomy) after stabilization deliverables prove reliable.
- **Advanced Healing & Recovery**
  - Context provision improvements (automatically include relevant code snippets in task prompts).
  - Task decomposition engine for breaking down complex tasks into manageable steps.
  - Code snippet injection for precise, minimal-scope changes.
- **Predictive Quality Systems**
  - Failure prediction before task assignment based on historical patterns.
  - Scope violation prediction with proactive boundary adjustment.
  - Quality degradation prediction with preventive maintenance scheduling.
- **Knowledge Graph & Semantic Understanding**
  - Build knowledge graph of codebase relationships and dependencies.
  - Semantic search for documentation and code patterns.
  - Intelligent task routing based on code ownership and expertise areas.

---

## Key Systems Integrated in v0.2.0

### 1. Prompt Engineering v3 (BOT_PROMPT_ENGINEERING_V3.md)
**Purpose:** Prevent scope creep, feature invention, and code duplication through strict prompt templates.

**Key Features:**
- Mandatory investigation phase before implementation
- Explicit scope constraints with "EXACTLY N items" format
- `doNotCreate` and `mustNotDuplicate` fields
- Pre-implementation checklists
- Strict file scope control (files, modifyOnly, doNotModify, doNotCreate)

**Success Metrics:**
- Scope compliance: 100% (zero tolerance for extras)
- Duplication rate: 0% (must extend, not duplicate)
- Investigation completion: 100% (required for all tasks)
- Feature creep rate: 0% (strictly forbidden)

### 2. Healing & Recovery System (HEALING_SYSTEM_DESIGN.md)
**Purpose:** Automatically recover from task failures through pattern recognition and task refinement.

**Key Features:**
- Pattern recognition for common failures (file path issues, unclear instructions, question completion)
- Auto-healing mechanisms (context provision, task decomposition, code injection)
- Learning database tracking successful vs failed task patterns
- Automatic retry with refined task prompts

**Success Metrics:**
- Auto-recovery success rate: 95%+ target
- Pattern recognition accuracy: 95%+
- Task completion improvement: from 70% to 95%+

### 3. Scope Control System (SCOPE_CONTROL_SYSTEM.md)
**Purpose:** Prevent feature creep and over-engineering through real-time monitoring and boundaries.

**Key Features:**
- Task scope definition with explicit boundaries (maxChanges, forbiddenActions, maxNewLines)
- Real-time scope monitoring during execution
- Auto-recovery from scope violations (tighten boundaries, regenerate tasks)
- Scope metrics and alert thresholds

**Success Metrics:**
- Scope violation rate: <10% target
- Over-engineering index: minimize lines added vs required
- Recovery success rate: 90%+

### 4. Periodic Maintenance System (PERIODIC_CLEANUP_SYSTEM.md)
**Purpose:** Maintain codebase health through automated cleanup, deduplication, linting, and testing.

**Key Features:**
- Scheduled maintenance tasks (linting: 6h, deduplication: 12h, documentation: 24h, testing: 48h, deep: weekly)
- Code deduplication engine with similarity detection
- Linting engine with auto-fix (style, bugs, performance, security)
- Testing engine with coverage analysis (80% minimum)
- Documentation cleanup (outdated, inconsistent, missing, redundant)

**Success Metrics:**
- Code duplication: <10% target
- Linting pass rate: 95%+
- Test coverage: 85%+ minimum
- Documentation freshness: 100% within 30 days

### 5. Enhanced Learning System (LEARNING_SYSTEM_ANALYSIS.md)
**Purpose:** Cross-system learning integration with validation and predictive capabilities.

**Key Features:**
- Integration between adaptive learning and coordinator systems
- Learning effectiveness validation with A/B testing
- Predictive failure prevention
- Knowledge sharing between workers and work targets

**Success Metrics:**
- Learning accuracy: 95%+
- Failure prediction accuracy: 85%+
- Performance improvement over time: measurable trend

### 6. Ephemeral Container Architecture (DEV_BOT_EPHEMERAL_CONTAINER_MIGRATION.md)
**Status:** ✅ Complete (2025-11-06)

**Achievements:**
- Zero filesystem artifacts (no mirrors, automatic cleanup)
- Simplified git workflow (work directly on staging)
- Efficient workspace copying (tar | docker cp pattern)
- Fixed credentials mounting (/tmp/host-claude-credentials.json)
- Container AutoRemove for automatic cleanup

### 7. Safety Mechanisms
**Status:** ✅ Complete

**Achievements:**
- Uncommitted changes detection
- Automatic patch file creation
- Git status capture
- Prevents losing bot work even on failures

---

## Implementation Priority Guide

### Critical for Stabilization (Before Queue Launch):
1. ✅ Ephemeral containers (COMPLETE)
2. ✅ Safety mechanisms (COMPLETE)
3. V3 prompt template system
4. Task template library
5. Scope validation rules
6. Mandatory investigation phase

### High Priority for POC:
1. Healing system with pattern recognition
2. Real-time scope monitoring
3. Periodic maintenance scheduler
4. Learning database integration
5. Task discovery automation

## Q4 Cleanup & Documentation Focus
- **Docs refresh cadence:** Every Q4 milestone includes a TL;DR update for the PR workflow, pipeline plan, and roadmap; `/delegate` is the default tool for these bite-sized edits to keep engineers on higher-leverage work.
- **Style sweep:** Run quarterly Markdown lint/format checks and convert legacy sections to the new task/PR vocabulary. Delegated PRs must carry the `documentation` label so prMonitor can treat them like other low-risk contributions.
- **Glossary & links sync:** Ensure shared terms (PR monitor, delegation, webhook, TaskAutomationManager) match across `docs/plans/*`, adding anchors for cross-linking so Copilot and dev-bots can deep-link follow-up tasks.
- **Telemetry hook:** Track how many documentation cleanups close via `/delegate` vs. human PRs to prove the workflow’s ROI before expanding delegation to other categories.

### Important for Autonomy:
1. Predictive failure prevention
2. Self-adjusting scope boundaries
3. Cross-system learning
4. Automated cleanup scheduling
5. Self-optimizing agent selection

---

## Q4 Goals

### Cleanup & Documentation
- Comprehensive documentation refresh to ensure all guides are current and accurate
- Codebase style sweep to maintain consistency across all modules
- Glossary synchronization across all documentation files

---

## Reference Documentation

- **BOT_PROMPT_ENGINEERING_V3.md** - Strict prompt templates and scope enforcement
- **BOT_EXECUTION_FINDINGS_2025-11-06.md** - Real-world bot execution analysis
- **HEALING_SYSTEM_DESIGN.md** - Auto-recovery architecture
- **SCOPE_CONTROL_SYSTEM.md** - Scope creep prevention
- **PERIODIC_CLEANUP_SYSTEM.md** - Automated maintenance
- **LEARNING_SYSTEM_ANALYSIS.md** - Learning architecture analysis
- **DEV_BOT_EPHEMERAL_CONTAINER_MIGRATION.md** - Container implementation details
- **DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md** - Overall pipeline architecture
- **TASK_QUEUE_SQLITE_MIGRATION.md** - Database schema design
