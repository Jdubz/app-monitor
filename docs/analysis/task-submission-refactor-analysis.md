# Analysis: Task Submission Failure Modes

## Investigation
- Exercised `POST /api/dev-bots/tasks` end-to-end (Nov 18, 2025) and traced flow through `tasks.routes.ts`, `taskAutoDetectionService`, `taskCreationGuidelines.ts`, and `devBotsManager.addTask`.
- Compared task type unions across `shared/api-contracts`, `contextRecipeSelector`, and `TaskCreationGuidelinesManager` to find drift.
- Reviewed error handling to see how validation exceptions are surfaced to clients vs. swallowed and converted to 500s.

## Findings
1. **500s Mask Validation Errors** – `tasks.routes.ts` only checks required fields; downstream exceptions (e.g., guideline failures) bubble up and become generic 500 responses instead of structured 400s.
2. **Guidelines Missing For Valid Types** – `GUIDELINE_FIELD_DEFINITIONS` lacks `fix`, `pr-follow-up`, and `analysis`, causing “no guidelines found” errors and skipping the robust validator entirely.
3. **Task-Type Drift** – `TaskSubmissionPayload`, `ContextRecipeSelector.TASK_TYPE_RECIPES`, and guideline definitions diverge, so new task types silently fall back to minimal context and weak validation.
4. **Implicit Validation in Auto-Detection** – Risk inference and warning generation live inside `taskAutoDetectionService` without feeding back into the formal validation result, so critical warnings never block bad submissions.
5. **Hardcoded Metadata** – Risk patterns, valid agents, and allowed projects live in multiple files, making updates brittle and inviting drift.
6. **Context Selection Gaps** – Missing recipes for certain task/file patterns produce under-scoped prompts and force humans to override context manually.

## Action Items
- [ ] **Backend · P0:** Wrap the entire submission pipeline in a validator that converts known validation exceptions into `sendError(..., 400, details)` so clients see actionable messages.
- [ ] **Context Platform · P0:** Expand `GUIDELINE_FIELD_DEFINITIONS` and `ContextRecipeSelector.TASK_TYPE_RECIPES` to cover every union member in `TaskSubmissionPayload`, with shared constants to prevent drift.
- [ ] **Dev-Bot Runtime · P1:** Feed `taskAutoDetectionService` warnings into the validation object and allow “critical” warnings to block task creation.
- [ ] **Platform Tooling · P1:** Centralize task-type metadata (risk patterns, valid agents/projects, default outputs) in a single module shared by detection + guidelines to eliminate duplication.
- [ ] **Docs · P2:** Update `docs/guides/TASK_SUBMISSION_GUIDE.md` once the validation UX is fixed so users know which errors surface as 400s.

## Delete After
2025-12-18 (30 days after latest investigation updates)
