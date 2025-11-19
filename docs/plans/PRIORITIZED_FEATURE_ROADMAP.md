# Prioritized Feature Roadmap & Task Creation Guide

**Version:** 1.1.0  
**Date:** 2025-11-12  
**Last Updated:** 2025-11-12 05:20 UTC  
**Purpose:** Consolidated prioritized features with Task V3 creation guidance

---

## 🎉 Recent Updates (2025-11-12)

**PR Tracking System - Operational ✅**
- Fixed 3 critical bugs in PR workflow
- Phase 1-2 complete (PR creation + quality gates)
- All 907 backend + 128 frontend tests passing
- Deployed to staging, ready for production

**Next Focus:**
- Webhook resilience (1-2 days)
- Artifact system (1 day)
- PR self-healing loop (3-5 days)

---

## Document Purpose

This document consolidates all active plans into a prioritized feature roadmap organized by:
1. **Priority Tiers**: P0 (Critical/Blocking) → P1 (High) → P2 (Medium) → P3 (Nice-to-Have)
2. **Implementation Phase**: Stabilize → POC → Autonomy
3. **Feature Dependencies**: What must complete before starting
4. **Task V3 Guidance**: Fields needed for proper task creation

---

## Priority 0: Critical Stabilization (BLOCKING)

These items **must complete** before enabling continuous task queue or POC features.

### P0.1: Frontend Health (FE-1, FE-2)
**Plan:** APP_MONITOR_STABILIZATION_PLAN.md
**Owner:** Frontend Team
**Duration:** 2-3 days
**Status:** In Progress

**Description:**
Fix all TypeScript compilation errors and ESLint warnings in frontend workspace.

**Acceptance Criteria:**
- `npm run build` succeeds without errors
- `npm run lint -w frontend` shows 0 errors, 0 warnings
- All components render without console errors
- TypeScript strict mode enabled

**Validation Steps:**
1. Run `npm run build` locally and verify success
2. Run `npm run lint -w frontend` and verify clean output
3. Load all routes in browser and check console for errors
4. Verify CI pipeline passes lint + build steps

**Constraints:**
- Must maintain backwards compatibility with existing API contracts
- Cannot break existing component interfaces
- Must preserve current feature functionality

**Prerequisites:**
- TypeScript 5.3.3 installed
- ESLint configuration up to date
- All dependencies installed

**Dependencies:** None (foundational work)

**Task V3 Template:**
```
investigation:
  required: true
  steps:
    - "READ frontend/package.json to understand current linting setup"
    - "RUN npm run lint -w frontend to identify all issues"
    - "GREP '*.tsx' files for common TypeScript errors"
    - "CHECK for any @ts-ignore comments that mask real issues"
  mustFind:
    - "Complete list of TypeScript errors (save to investigation notes)"
    - "Complete list of ESLint warnings (categorize by rule)"
  mustNotDuplicate:
    - "frontend/src/**/*.tsx (check for existing type definitions)"

acceptanceCriteria:
  - "EXACTLY 0 TypeScript compilation errors after fixes"
  - "EXACTLY 0 ESLint warnings after fixes"
  - "NO MORE console.error() in production builds"
  - "DO NOT disable strict mode or ESLint rules without justification"

constraints:
  - "MUST NOT break existing component interfaces"
  - "MUST NOT change public API contracts"
  - "MUST preserve current functionality (no behavioral changes)"

files: ["frontend/src/**/*.{ts,tsx}"]
modifyOnly: ["frontend/src/**/*.{ts,tsx}", "frontend/tsconfig.json"]
doNotModify: ["frontend/package.json (unless adding type definitions)"]
doNotCreate:
  - "frontend/src/types/legacy.ts (use existing type files)"
  - "frontend/.eslintrc.override.js (fix issues, don't bypass rules)"
```

---

### P0.2: Backend Test Passing (BE-1, BE-2)
**Plan:** APP_MONITOR_STABILIZATION_PLAN.md
**Owner:** Backend Team
**Duration:** 3-4 days
**Status:** In Progress

**Description:**
Ensure all 543 backend tests pass consistently and implement failure recovery system for stuck tasks.

**Acceptance Criteria:**
- All 543 tests pass locally and in CI
- Pre-push hook enforces lint + test without false positives
- Stuck task detection implemented (60-minute timeout with auto-recovery)
- Failure recovery system logs all recovery attempts

**Validation Steps:**
1. Run `npm run test -w backend` locally (should pass 543/543)
2. Test pre-push hook with intentional lint violation (should block)
3. Test stuck task detection by simulating hung container
4. Verify recovery system creates followup tasks for failures

**Constraints:**
- Must not introduce flaky tests (run 10x to verify consistency)
- Recovery system must not create infinite loops
- Timeout must be configurable per work-target

**Prerequisites:**
- All test dependencies installed
- SQLite database migrations up to date
- Docker daemon available for container tests

**Dependencies:** None (foundational work)

---

### P0.3: Work-Target Registry (WT-1 through WT-4)
**Plan:** APP_MONITOR_STABILIZATION_PLAN.md
**Owner:** Platform Tooling
**Duration:** 4-5 days
**Status:** Planning

**Description:**
Migrate work-target metadata from JSON config files to SQLite with backwards compatibility for JSON backup.

**Acceptance Criteria:**
- SQLite schema created with work_targets table (id, name, description, paths JSON, repos JSON, secrets JSON, logs JSON, created_at, updated_at)
- Migration script ingests existing JSON configs into SQLite
- API resolves work-target paths from SQLite (fallback to JSON if SQLite unavailable)
- Documentation updated with ownership and maintenance guidelines

**Validation Steps:**
1. Run migration script and verify all JSON configs imported
2. Query SQLite and verify data matches JSON configs
3. Test API with SQLite available (should use SQLite)
4. Test API with SQLite unavailable (should fall back to JSON)
5. Verify backwards compatibility by reading old JSON configs

**Constraints:**
- MUST NOT break existing JSON config readers
- MUST maintain backwards compatibility for 1 release cycle
- MUST validate paths exist before storing in database

**Prerequisites:**
- SQLite database initialized
- Migration framework in place
- JSON config schema documented

**Dependencies:** None (foundational work)

**Related Plans:**
- DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md (uses registry)
- APP_MONITOR_PRODUCTION_SUPPORT_PLAN.md (extends registry with deployment paths)

---

### P0.4: Prompt Engineering V3 Implementation (PE-1 through PE-6) ✅ **COMPLETE - SUPERSEDED BY MINIMAL API**
**Plan:** BOT_PROMPT_ENGINEERING_V3.md (ARCHIVED 2025-11-14)
**Owner:** Platform Tooling
**Duration:** N/A
**Status:** ✅ **COMPLETE** (Implemented as context-aware minimal API)

**Original Goal:** Manual v3 template validation  
**Actual Implementation:** Context-aware auto-generation (simpler and better)

**What Was Delivered (2025-11-14):**
- ✅ **Minimal Task API:** 3-field submission (title, taskType, intent)
- ✅ **Auto-Detection Service:** Automatically infers files, risk level, context profiles
- ✅ **New Endpoints:** 
  - POST `/api/dev-bots/tasks/minimal` - Create task with minimal payload
  - POST `/api/dev-bots/tasks/preview-detection` - Preview auto-detection
- ✅ **Backend Complete:** Full integration with existing task creation
- ⏳ **Frontend Pending:** UI form component not yet created

**Key Achievement:**
- Eliminated need for 15+ manual fields
- Automated investigation steps via context bundles
- Constraints auto-injected from recipes
- Task submission time reduced from ~10 min to <2 min (estimated)

**Migration Path:**
- Old POST `/api/dev-bots/tasks` endpoint marked deprecated
- Both endpoints functional (backward compatible)
- Frontend will use new minimal API when form component created
- Full migration target: 2 weeks

**Dependencies:** None (feature replaced by superior approach)

**Related Plans:**
- ✅ Context infrastructure complete (Phase 1)
- ⏳ Context integration pending (Phases 2-7)
- All task-based automation will use context-aware submission when ready

---

### P0.5: Task Context Foundations (TC-1 through TC-4)
**Plan:** APP_MONITOR_STABILIZATION_PLAN.md
**Owner:** Platform Tooling
**Duration:** 3-4 days
**Status:** Planning

**Description:**
Create SQLite schema and API scaffolding for task context capture (logs, network events, environment snapshots, artifacts).

**Acceptance Criteria:**
- Database tables created: task_context, task_logs, task_network_events, task_artifacts
- JSON Schema validation for context payloads
- API endpoints accept context bundles (optional fields for flexibility)
- Context persisted and queryable via task detail API
- Dashboard displays context with JSON toggle

**Validation Steps:**
1. Create task with context bundle via API; verify persistence
2. Query task detail and verify context returned
3. Validate schema against invalid payload; verify rejection
4. Test dashboard context display with real task data

**Constraints:**
- MUST NOT store sensitive data without redaction hooks
- MUST bound log/event storage (truncate or reference)
- MUST maintain context isolation per task

**Prerequisites:**
- SQLite schema migration framework
- JSON Schema validator library
- API middleware for validation

**Dependencies:** None (foundational work)

**Related Plans:**
- DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md (extends context with automation metadata)

---

## Priority 1: POC Features

These features enable proof-of-concept for autonomous workflows.

### P1.1: Production Deployment Model (Three-Root Architecture)
**Plan:** APP_MONITOR_PRODUCTION_SUPPORT_PLAN.md
**Owner:** DevOps + Platform Tooling
**Duration:** 2 weeks (Phases 1-4)
**Status:** Draft

**Description:**
Separate work-target development path from production deployment with artifact handoff mechanism.

**Acceptance Criteria:**
- Three environment variables documented: APP_MONITOR_ROOT, APP_MONITOR_DEPLOY_ROOT, APP_MONITOR_ARTIFACT_ROOT
- Registry schema extended with paths.workRoot, paths.deployRoot, paths.artifactRoot, paths.logs[]
- Artifact packaging step: npm ci && npm run build; tar backend/dist + frontend/dist + version metadata
- Deploy script accepts --deploy-root, --artifact-root, --source-root flags
- Systemd units source /etc/app-monitor/work-target.env
- Rollback flow maintains two releases with timestamp symlinks

**Dependencies:**
- WT-1 through WT-4 (Work-Target Registry) MUST complete first
- P1.2 (Work-Target Path Abstraction) parallel work

---

### P1.2: Context-Aware Task Submission ✅ **100% COMPLETE - PRODUCTION READY**
**Plan:** dev-bot-context-management.md
**Owner:** Platform Tooling
**Completion Date:** 2025-11-19 (Refactoring Complete)
**Status:** 🟢 **PRODUCTION READY** - Backend 100% Complete | Frontend Awaiting UI Component

**Description:**
**HIGHEST IMPACT FEATURE** - Transforms task submission from 15+ manual fields to just 3 (title, taskType, intent) with auto-generated prompts from context bundles.

**✅ Complete Implementation (2025-11-14 + Refactoring 2025-11-19):**
- ✅ **Minimal Task API Endpoints (PRODUCTION READY):**
  - POST `/api/dev-bots/tasks/minimal` - Create task with 3 fields
  - POST `/api/dev-bots/tasks/preview-detection` - Preview auto-detection
- ✅ **Auto-Detection Service (FULLY OPERATIONAL):**
  - File detection from git status (staged + modified + created)
  - Risk level inference from centralized utility (utils/riskAssessment.ts)
  - Context profile selection via ContextRecipeSelector
  - Default outputs per task type
  - Confidence scoring (0-1) for each detected field
  - Warning generation for low-confidence detections
- ✅ **Context Infrastructure (~2,400 lines, fully tested):**
  - ContextCache, ContextRecipeLoader, ContextRecipeValidator, ContextBundleGenerator
  - Full type system (contextRecipe.ts, contextBundle.ts)
  - Comprehensive test coverage (unit + integration)
- ✅ **8 YAML Recipes Operational:**
  - scope-control, dev-monitor, pr-workflow, failure-recovery
  - deployment, implementation-patterns, review-checklist, fix-debugging
- ✅ Database integration complete (migration 020)
- ✅ Container delivery via docker cp working
- ✅ Prompt auto-generation functional
- ✅ Cache hit rate >90%
- ✅ Legacy endpoint marked deprecated (backward compatible)
- ✅ **Error Handling Refactoring (2025-11-19):**
  - Custom error classes (ValidationError, ConflictError, BadRequestError)
  - Global error handling middleware
  - Proper HTTP status codes (400, 409) instead of 500
  - Structured error responses with errors/warnings/suggestions
- ✅ **Code Quality Improvements (2025-11-19):**
  - Removed dead code (545 lines - taskCreationTemplate.ts)
  - Eliminated validation duplication (single validation point)
  - Centralized risk assessment logic
  - Single source of truth for task types (TASK_TYPES constant)
  - All 1,794 tests passing

**Remaining Work (Non-Blocking):**
- Frontend minimal task form component (can use API directly until UI created)
- Auto-detection preview in UI (API provides this already)
- Migration of remaining endpoints to use custom error classes (low priority)

**Achievement:**
- ✅ Eliminates 80% of manual task authoring work
- ✅ Context always current (no stale docs)
- ✅ Dramatically improves bot success rates
- ✅ Foundation for full autonomy established

**API Usage (Available Now):**
```bash
curl -X POST http://localhost:5000/api/dev-bots/tasks/minimal \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix login timeout issue",
    "taskType": "fix",
    "intent": "Increase session timeout from 5min to 30min"
  }'
```

**Next Steps (Low Priority):**
1. Create React form component (UI convenience, not functionality blocker)
2. Remove legacy V3 template code (cleanup)
3. Update documentation to show only minimal API

---

### P1.3: Safety Mechanisms & Prompt Quality
**Plan:** DEV_BOT_SAFETY_AND_PROMPT_IMPROVEMENTS.md
**Owner:** Platform Tooling
**Duration:** 4 weeks (Phases 1-4)
**Status:** Planning

**Description:**
Prevent lost changes and task misinterpretation through auto-capture, commit verification, and prompt validation.

**Acceptance Criteria:**
- captureUncommittedChanges() creates patch files + git status backups
- verifyBotCommitted() checks for bot commits post-execution
- autoStashChanges() stashes uncommitted work if bot doesn't commit
- validatePromptQuality() scores prompts 0-100 with issues/suggestions
- Task schema accepts modifyOnly/doNotModify/expectedChanges fields
- Recovery endpoints expose saved patches

**Dependencies:**
- P0.4 (Prompt Engineering V3) MUST complete first
- TC-1 through TC-4 (Task Context) recommended

---

### P1.4: Task Pipeline Enhancement (Context Capture)
**Plan:** DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md
**Owner:** Platform Tooling
**Duration:** 3 weeks (Phases 1-3)
**Status:** Draft

**Description:**
Extend task system with diagnostic metadata persistence and dev-bot telemetry.

**Acceptance Criteria:**
- Persistence: task_context, task_logs, task_network_events, task_artifacts, task_automation_runs tables
- TaskAutomationManager with single-concurrency locking, retry guards
- Workspace preparation with git health validation
- Bootstrap enhancements with git identity setup, structured output capture
- Session logs stored under logs/dev-bots/<task_id>/<timestamp>/
- Dashboard shows automation success/failure, retries, duration, token usage

**Dependencies:**
- TC-1 through TC-4 (Task Context Foundations) MUST complete first
- WT-1 through WT-4 (Work-Target Registry) MUST complete first

---

## Priority 2: Autonomy Features

These features enable fully autonomous workflows with self-healing.

### P2.1: PR-Based Workflow
**Plan:** PR_WORKFLOW_IMPLEMENTATION.md, CONTINUOUS_PR_SELF_HEALING.md
**Owner:** Platform Tooling
**Duration:** 4 weeks (Phases 1-4)
**Status:** ✅ Phase 1-2 Complete (2025-11-12), Phase 3-4 In Progress

**Completed (Phase 1-2):**
- ✅ PR creation automation (fixed HOME env, gh config, GH_TOKEN)
- ✅ Quality gates implementation (8 conditions tracked)
- ✅ Webhook handlers (PR, push, check_suite, check_run, review)
- ✅ Condition evaluation engine
- ✅ Bug fixes: branch update detection, task cleanup on PR close

**In Progress (Phase 3):**
- ⏳ Self-healing loop (3-5 days)
  - Failure classification (lint, test, build, conflict)
  - Fix task generation with proper prompts
  - Retry logic (max 3 attempts)
  - Escalation to humans after failures

**Next (Phase 4):**
- ⏳ Auto-merge implementation (2-3 days)
  - Merge when all conditions met
  - Human intervention on repeated failures

**Description:**
Transform dev-bots from direct-push-to-staging to full PR-based workflow with CI monitoring, review integration, and auto-merge.

**Acceptance Criteria:**
- ✅ PRs created from feature branches to main
- ✅ CI checks monitored
- ✅ Review status tracked (approved, changes requested)
- ⏳ Auto-merge triggered when eligible
- ⏳ Followup tasks created for failed checks/review comments
- ✅ Stale branch detection with warnings

**Dependencies:**
- ✅ P0.4 (Prompt Engineering V3) COMPLETE
- ✅ Task schema extended with PR fields COMPLETE

---

### P2.2: Interactive Session Tab (Optional Enhancement)
**Plan:** DEV_BOT_INTERACTIVE_SESSION_TAB.md
**Owner:** Platform Tooling
**Duration:** 2 weeks (Backend + Frontend)
**Status:** Draft (Needs sign-off)

**Description:**
Browser-based interactive terminal for operators to "drop into" dev-bot shell when automation falls short.

**Acceptance Criteria:**
- Interactive tab visible when feature flag enabled
- Model selector with Claude Sonnet default
- PTY terminal streaming via WebSocket
- Hotkeys working (Esc, Ctrl+C, Ctrl+U, Ctrl+W, Ctrl+L)
- 5-minute idle timeout enforced
- Containers labeled with dev-bot.interactive=true
- Session metadata in SQLite (minimal fields)
- Single session limit enforced

**Dependencies:**
- Ephemeral containers (✅ COMPLETE)
- P1.2 (Work-Target Path Abstraction) recommended
- Feature flags: DEV_BOTS_ENABLE_INTERACTIVE + VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB

---

## Task V3 Creation Template

When creating tasks from these features, use this template:

```yaml
type: implementation|testing|documentation|refactor
title: "<Action Verb> <Specific Outcome>"
phase: stabilize|poc|autonomy
owner: <team-name>
duration: <hours-or-days-estimate>

investigation:
  required: true
  steps:
    - "READ <plan-document> (specific section)"
    - "GREP <codebase-pattern> to find existing implementations"
    - "CHECK <prerequisite-system> for dependencies"
    - "VERIFY <assumption> before implementation"
  mustFind:
    - "<concrete-artifact-or-file>"
    - "<existing-pattern-or-implementation>"
  mustNotDuplicate:
    - "<file-or-module> (describe existing functionality)"

acceptanceCriteria:
  - "EXACTLY <number> <items> <condition>"
  - "NO MORE <unwanted-outcome>"
  - "DO NOT <prohibited-action> without <justification>"
  - "MUST <required-behavior> in <specific-scenario>"

validationSteps:
  - "Test <scenario>; verify <expected-outcome>"
  - "Run <command>; check <output-pattern>"
  - "Simulate <failure-case>; verify <recovery-behavior>"

constraints:
  - "MUST NOT <prohibited-change>"
  - "MUST <required-behavior>"
  - "MUST maintain <compatibility-requirement>"

files:
  - "<path-pattern-1>"
  - "<path-pattern-2>"

modifyOnly:
  - "<specific-file-1>"
  - "<specific-file-2>"

doNotModify:
  - "<protected-file-1> (reason)"
  - "<protected-file-2> (reason)"

doNotCreate:
  - "<path-pattern> (use existing <alternative> instead)"
  - "<file-type> (prevents <undesired-outcome>)"

gitWorkflow:
  branch: "task-<type>-<description>"
  baseBranch: "staging"
  commitMessage: "<Action Verb>: <Summary>"

prerequisites:
  - "<dependency-task-id> must complete"
  - "<system-requirement> must be available"
  - "<configuration> must be set"

relatedDocs:
  - "<plan-document> (section <X>)"
  - "<architecture-doc> (for context)"
```

---

## Feature Dependency Graph

```
P0 (Stabilization - BLOCKING)
├── P0.1: Frontend Health (FE-1, FE-2)
├── P0.2: Backend Tests (BE-1, BE-2)
├── P0.3: Work-Target Registry (WT-1..WT-4) ──┐
├── P0.4: Prompt Engineering V3 (PE-1..PE-6) ──┤
└── P0.5: Task Context (TC-1..TC-4) ──────────┘
                                               │
                                               ▼
P1 (POC Features)                              │
├── P1.1: Production Deployment ◄──────────────┤
├── P1.2: Work-Target Paths ◄──────────────────┤
├── P1.3: Safety Mechanisms ◄──────────────────┤
└── P1.4: Pipeline Enhancement ◄───────────────┘
                                               │
                                               ▼
P2 (Autonomy Features)                         │
├── P2.1: PR-Based Workflow ◄──────────────────┤
└── P2.2: Interactive Session (Optional) ◄─────┘
```

---

## Implementation Sequence

### Week 1-2: Stabilization Gate (P0)
1. Start P0.1 (Frontend Health) and P0.2 (Backend Tests) in parallel
2. Start P0.3 (Work-Target Registry) after day 2
3. Start P0.4 (Prompt V3) and P0.5 (Task Context) in parallel after day 5
4. **Gate**: All P0 items must complete before P1

### Week 3-6: POC Phase (P1)
1. Start P1.1 (Production Deployment) and P1.2 (Work-Target Paths) in parallel (require P0.3)
2. Start P1.3 (Safety Mechanisms) after P0.4
3. Start P1.4 (Pipeline Enhancement) after P0.3 + P0.5
4. **Gate**: All P1 items complete before P2

### Week 7+: Autonomy Phase (P2)
1. Start P2.1 (PR-Based Workflow) after P0.4 + P1.3
2. Start P2.2 (Interactive Session) in parallel (optional)

---

## Success Metrics

### Stabilization (P0)
- Frontend: 0 TypeScript errors, 0 ESLint warnings
- Backend: 543/543 tests passing consistently
- Registry: 100% work-targets migrated to SQLite
- Prompt V3: 100% new tasks using V3 format
- Task Context: Context captured for 100% of tasks

### POC (P1)
- Production: 0 deployment failures, <5min deploy time
- Work-Target: 100% path resolution via registry
- Safety: 0 lost changes, <5% task misinterpretation
- Pipeline: 100% task metadata captured

### Autonomy (P2)
- PR Workflow: >90% auto-merge success rate
- Interactive: <30s session startup, 100% idle timeout compliance

---

## Related Documents

- **Master Roadmap:** APP_MONITOR_CAPABILITY_ROADMAP.md
- **Stabilization:** APP_MONITOR_STABILIZATION_PLAN.md
- **Prompt Engineering:** BOT_PROMPT_ENGINEERING_V3.md
- **Production Support:** APP_MONITOR_PRODUCTION_SUPPORT_PLAN.md
- **Work-Target Paths:** DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md
- **Safety:** DEV_BOT_SAFETY_AND_PROMPT_IMPROVEMENTS.md
- **Pipeline:** DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md
- **PR Workflow:** PR_BASED_WORKFLOW.md
- **Interactive Session:** DEV_BOT_INTERACTIVE_SESSION_TAB.md

---

**Maintenance:** Update this document when priorities shift or features complete. Archive superseded plans to `docs/plans/archive/` with dated filenames.
