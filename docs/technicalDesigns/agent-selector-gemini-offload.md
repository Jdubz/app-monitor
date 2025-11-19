# Agent Selector – Gemini Offload Design

**Date:** 2025-11-13  
**Author:** Codex Agent  
**Status:** Draft (ready for implementation grooming)  
**Related Docs:** `master-design-intent.md`, `dev-bot-context-management.md`, `DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md`, `GEMINI_CLI_CODE_ASSIST_INTEGRATION.md`

---

## 1. Problem Statement
Claude is the primary implementation agent and currently the throughput bottleneck for App Monitor’s dev-bot system. While Claude delivers the best code quality, queue latency is rising whenever implementation tasks pile up. We need a safe path to route appropriate work to Gemini CLI without compromising the Master Design Intent (code quality, strict scope enforcement, REVIEW→FIX→COMPLETE pipeline).

## 2. Goals & Non-Goals
- **Goals**
  - Introduce a Gemini agent persona that can absorb well-scoped tasks while preserving quality guardrails.
  - Extend `AgentSelector` so routing decisions consider task characteristics, context readiness, historical success, and live quota signals.
  - Provide deterministic fallbacks so Claude remains the safety net for risky work.
- **Non-Goals**
  - Replacing Claude entirely.
  - Allowing Gemini to execute without preloaded context or REVIEW coverage.

## 3. Current State (Baseline)
- `AgentSelector` supports `claude`, `codex`, and `copilot` only (`backend/src/services/agentSelector.ts:1-206`).
- Selection is rule-based (task category, file patterns, previous failures). All implementation tasks eventually fall back to Claude.
- No notion of agent quotas, context eligibility, or per-task risk scoring.

## 4. Proposed Architecture
### 4.1 New Agent Type
```ts
export type AgentType = 'claude' | 'codex' | 'copilot' | 'gemini';
```
Add `gemini` everywhere agent types are enumerated (selector, tests, TaskExecutionService Docker image map, queue metadata).

### 4.2 Capability Capsules
Introduce a small static capability table consumed by the selector:
| Agent | Strengths | Guardrails |
|-------|-----------|------------|
| Claude | high-accuracy code edits, deep refactors | use when task risk ≥ medium or scope touches backend | 
| Gemini | high-context frontend & scripting tasks, log analysis | require `contextProfiles` marked “gemini-ready”, forbids touching `backend/src/services/*` unless low risk |
| Codex | analysis/review/docs | unchanged |
| Copilot | GitHub delegation | unchanged |

### 4.3 Eligibility Checks
Add `AgentEligibilityService` invoked before final selection. Inputs:
1. **Task Risk Score** (derived from task metadata + classifier).
2. **Context Readiness** (ensures `TaskSubmissionPayload` + context bundles exist). If the task lacks the new context BOM or references missing bundles, Gemini is disallowed.
3. **Quota Health** (per-agent rpm/day counters stored in Redis/sqlite). Gemini allowed only if ≥10% quota remains.
4. **Policy Overrides** (ops can block Gemini per project/branch).

### 4.4 Selection Flow
1. Run existing rules to get a provisional agent (likely Claude for implementations).
2. If provisional is Claude and task matches a Gemini-friendly profile (frontend, data analysis, well-scoped) → run eligibility checks.
3. If all checks pass → choose Gemini; store reasoning “Claude bottleneck + Gemini eligible”.
4. Otherwise stay with Claude.
5. Always set `fallbackAgent` to Claude when Gemini is selected.

Pseudo-code:
```ts
const provisional = applySelectionRules(criteria);
if (provisional.agent === 'claude' && this.canGeminiHandle(criteria)) {
  return this.createSelection('gemini', 'Eligible implementation rerouted to Gemini', 0.82, 'claude');
}
return provisional;
```

### 4.5 Task Categories Eligible for Gemini
| Category | Conditions |
|----------|------------|
| frontend-implementation | target files under `frontend/`, estimated effort ≤ 1.5h, no database/network migrations |
| logs/telemetry polish | touches `frontend/src/components/*Logs*` or `docs/analysis/*`, log-level updates only |
| analysis/reporting | tasks requiring data crunching or artifact summarization |
| low-risk fix | bug labeled `fix type: cosmetic`, no backend file patterns, verification steps automated |

### 4.6 Chain Handling
- Store agent choice per attempt in `task_automation_runs`.
- If Gemini fails twice on a chain, auto-block further Gemini attempts for that task and escalate to Claude.

## 5. TaskExecutionService Updates
1. **Docker Image Map:** `AgentSelector.getDockerImage('gemini') → dev-bot-gemini:latest`.
2. **Runner:** Add `GeminiRunner` (see CLI design doc) that handles auth, CLI invocation, log streaming.
3. **Context Wiring:** Before launching Gemini, ensure context bundles + `GEMINI.md` are mounted (`dev-bot-context-management.md` requirement #8).

## 6. Telemetry & Observability
- Emit `agent_selection` events including `candidate_agents`, `eligibility_checks`, `quota_remaining`.
- Track success/failure per agent + task category for future ML-driven selection.
- Dev-monitor UI needs a badge on task rows showing “Gemini (fallback: Claude)” plus reasoning text.

## 7. Safety Mechanisms
1. **Risk gating:** Hard block Gemini for tasks flagged `risk=high`, touching backend services, database migrations, or PR pipeline logic.
2. **Command sandbox:** Use policy engine to inspect planned CLI actions; reject destructive commands before execution.
3. **Quota breaker:** If Gemini returns >3 failures in an hour, pause new assignments and alert operators.
4. **REVIEW depth:** Force REVIEW tasks to run on Claude/Codex even if implementation was Gemini, ensuring final verification by trusted agents.

## 8. Implementation Plan
1. **Schema & Type Updates (0.5d)** – Add `gemini` enum value, migration for storing new agent stats.
2. **Eligibility Service (1d)** – Build helper that checks risk score, context, quota.
3. **AgentSelector Enhancements (1d)** – Extend logic, add tests covering: (a) eligible frontend task, (b) missing context, (c) quota exhausted, (d) forced fallback after failures.
4. **TaskExecutionService Runner (2d)** – Add Gemini Docker image, CLI invocation, auth bootstrap, artifact capture.
5. **Telemetry & UI (1d)** – Emit events, display in dev-monitor.
6. **Operational Playbook (0.5d)** – Document how to rotate tokens, monitor quotas, and disable Gemini quickly if needed.

## 9. Open Questions
1. What metric determines “Claude bottleneck”? (e.g., queue wait time >10 minutes, or >N concurrent Claude tasks).  
2. Should we allow Gemini for backend test-only tasks once confidence improves?  
3. How do we reconcile Gemini CLI updates with our Docker image release cadence? Nightly smoke tests?  
4. Can we auto-learn better routing thresholds from success metrics (phase 2)?

---

**Conclusion:** By layering eligibility checks, telemetry, and strict fallbacks over the existing `AgentSelector`, we can safely offload a subset of well-understood tasks to Gemini, reducing Claude bottlenecks without compromising the REVIEW-first design intent.
