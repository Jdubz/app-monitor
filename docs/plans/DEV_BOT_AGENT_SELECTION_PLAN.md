# Dev-Bot Agent & Model Selection Plan

**Status:** Draft for implementation  
**Last Updated:** November 9, 2025  
**Owner:** Platform Tooling

---

## Purpose

Unify how we choose between Codex (planning/review strength) and Claude (implementation/coding strength) for every task the dev-bot pipeline executes. Today, agent assignment only looks at task type and persona skills, so both planning-heavy and code-heavy work end up on the same Claude Workers infrastructure. This plan adds explicit model-routing so planning/review tasks go to Codex while implementation/testing/documentation changes continue through Claude.

---

## Current State Analysis

### Task Inventory
- CLI + docs enumerate 10+ task types (`implementation`, `api-development`, `ui-development`, `review`, `testing`, `documentation`, `deployment`, `security-analysis`, `performance-optimization`, `bug-fix`, etc.).  
- Analysis docs also reference specialized categories like `backend-implementation`, `frontend-implementation`, `refactoring`, `devops`, and `documentation`.  
- Plans such as the Event-Triggered Task Pack and Plan Ingestion introduce meta-work items (plan ingestion, release insight, failure diagnostic) that produce instructions instead of code changes.

### Current Assignment Flow
1. Task creator (CLI/UI) optionally picks an agent personality (Alex/Sam/Casey/etc.); otherwise auto-assignment maps coarse task types to personas (e.g., `review` → Casey, `testing` → Taylor).  
2. Regardless of persona, the TaskQueue spins up a Claude Docker worker to execute the prompt template defined in `docs/analysis/quick-reference.md` and related templates.  
3. Model selection is implicit: everything routes to Claude Workers. There is no metadata for “planning vs. coding” or for Codex.

### Pain Points
- Planning/review tasks (plan ingestion, gatekeeper review) still run through Claude, even though Codex is better suited for high-level reasoning and non-editing workflows.  
- No place to record the desired LLM or execution mode, so TaskQueue cannot make nuanced routing decisions.  
- Review tasks sometimes require access to repo diffs without making changes; Claude containers spin up unnecessarily.  
- Completion metrics cannot differentiate which provider handled the task, limiting tuning.

---

## Design Goals
1. **Explicit Model Routing:** Every task carries `workMode` metadata describing whether it needs planning/review (Codex) or implementation (Claude).  
2. **Persona Compatibility:** Existing personas remain, but behind the scenes the orchestrator decides whether the persona should be powered by Codex or Claude for that task.  
3. **Minimal Workflow Changes:** Task creators keep using the same CLI/UI; defaults are inferred from task type, but manual overrides remain possible.  
4. **Telemetry & Cost Controls:** Capture provider choice, outcome, and per-provider usage caps for governance.  
5. **Future Proofing:** Ability to add other providers later (e.g., Claude for coding, Codex for planning, future models for testing).

---

## Routing Matrix

| Task Type / Intent | Default Persona | Provider | Notes |
| --- | --- | --- | --- |
| `plan-ingestion`, `release-analysis`, `plan-audit`, `task-decomposition` | Morgan + specialist | **Codex** | High-level planning, doc parsing, backlog curation |
| `review`, `security-analysis`, `failure-diagnostic`, `scope-trim` (analysis portion) | Casey (Review) | **Codex** | Focus on reasoning/reporting; no code edits |
| `implementation`, `backend-implementation`, `api-development`, `bug-fix`, `refactoring` | Alex (Backend) | **Claude** | Hands-on coding + tests |
| `ui-development`, `frontend-implementation`, `performance-optimization` | Sam (Frontend) | **Claude** | UI coding, perf tweaks |
| `testing`, `test-automation`, `healing` (code rewrite) | Taylor (Testing) | **Claude** | Writing/adjusting tests requires code execution |
| `deployment`, `devops`, `infrastructure`, `release-hardening` | Jordan (DevOps) | **Claude** | Shell + IaC-heavy tasks |
| `documentation` (non-planning) | Morgan | **Codex** (default) | Start with Codex even when snippets are needed; split tasks only if complex code edits arise |
| `review`-spawned follow-ups | Alex/Sam/etc. | **Claude** | Codex reviews can enqueue new Claude implementation tasks conservatively aligned with plan goals |

Routing overrides: users can explicitly set `provider: codex|claude` when creating tasks; otherwise defaults apply.

---

## Implementation Plan

1. **Schema Extensions**
   - Update shared task contract (`shared/api-contracts`) with fields:  
     ```ts
     interface Task {
       ...
       executionProvider?: 'codex' | 'claude';
       workMode?: 'planning' | 'review' | 'implementation' | 'testing' | 'documentation';
     }
     ```  
   - CLI / API surfaces allow manual provider selection (default `auto`).

2. **Routing Heuristics**
   - Enhance TaskQueueManager to derive `workMode` from task type + metadata.  
   - Introduce a `ProviderSelector` module:  
     ```ts
     const provider = mapWorkModeToProvider(workMode, repoCapabilities, manualOverride);
     ```  
   - For composite tasks (e.g., Failure Autopsy Pack), split into sub-tasks with distinct providers (Codex for diagnostic, Claude for healing).

3. **Execution Paths & UI**
   - **Codex Path:**  
     - Run within Codex CLI harness (no Docker container).  
     - Provide read-only repo context, plan markdown, telemetry, but skip file editing attempts.  
     - Return structured planning outputs (task proposals, review notes, acceptance criteria).
   - **Claude Path:**  
     - Existing Docker workflow continues for code execution; just record `executionProvider = 'claude'`.  
   - **UI Exposure:**  
     - Add a simple `Provider` tag/column in the monitoring UI and filter hooks so operators can quickly tell whether Codex or Claude handled a task.

4. **Telemetry, Cost, & Learning**
   - Persist provider choice + success metrics in the learning store (`learning-patterns.json`, SQLite).  
   - Record provider-specific run time/cost so per-provider limits can be enforced.  
   - Dashboard filters for provider-specific performance (e.g., Codex plan success rate vs. Claude implementation success).  
   - Use data to refine routing heuristics (e.g., if Codex reviews catch more bugs, consider auto-escalating critical review tasks there).

5. **Plan/Task Updates**
   - Ensure new plans (Event-Triggered Pack, Plan Ingestion) set `workMode` in their front-matter so ingestion tasks route correctly.  
   - Update task templates to mention provider-capabilities (“This is a Codex planning task; do not modify files.”).  
   - Codex review templates must outline criteria for spawning follow-up Claude tasks and link them back to the originating plan action/chain.

6. **Rollout Steps**
   1. Add schema + UI/CLI support.  
   2. Implement `ProviderSelector` with default mapping table (above).  
   3. Update TaskQueueManager to branch execution based on provider.  
   4. Pilot with plan-ingestion + review tasks to validate Codex path and conservative follow-up spawning.  
   5. Expand to all task types once telemetry shows stability and per-provider cost tracking is verified.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Incorrect provider default causes task failure | Medium | Allow manual override + quick requeue with other provider |
| Codex tasks attempt file edits | Low | Enforce “no-write” guardrails in prompts + harness |
| Dual-provider telemetry drift | Medium | Standardize logging fields (`provider`, `workMode`, `persona`) |
| Human operators forget to tag new task types | Medium | Lint plan front-matter to require `workMode` |

---

## Open Questions

- None at this time; revisit once the pilot surfaces new routing scenarios.

---

Implementing this routing layer lets Codex specialize in planning/reviews while Claude continues leading implementation/testing, aligning model strengths with task intent and improving overall automation quality.
