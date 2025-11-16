# Task Processing Stage Redesign - Implementation Roadmap

**Date:** 2025-11-16
**Status:** Ready to Execute
**Strategy:** Complete replacement - rip out old, build new, no legacy code

---

## Implementation Strategy

**COMPLETE REPLACEMENT - No feature flags, no backward compatibility, no legacy code**

### Approach
1. Build entire 7-phase system from scratch
2. Remove ALL legacy REVIEW/FIX task creation logic
3. Drop and rebuild database schema
4. Deploy atomically when complete
5. Zero tolerance for legacy code remnants

### Timeline
- No fixed deadline
- No production dependencies to coordinate
- Focus on correctness over speed

---

## Phase-by-Phase Implementation Plan

### Week 1: Foundation & Schema

#### Day 1: Database Schema Overhaul
**Goal:** New schema supporting phase system, remove legacy columns

**Tasks:**
- [ ] Create migration 026: Phase system schema
  - Add `phase_index`, `phase_name`, `phase_status`, `phase_attempts`, `phase_payload` to `tasks`
  - Create `task_stage_runs` table
  - Remove `queue_stage`, `original_task_id` columns
  - Remove any REVIEW/FIX-specific columns
- [ ] Drop development database and run migrations fresh
- [ ] Verify schema integrity

**Files:**
- `backend/migrations/026_phase_system.sql`

#### Day 2: Phase Orchestrator Service
**Goal:** Core phase state machine and transition logic

**Tasks:**
- [ ] Create `PhaseOrchestratorService`
  - `determineNextPhase(currentPhase, validationResult)` - state machine
  - `advancePhase(task)` - transition to next phase
  - `recordStageRun(task, result)` - historical tracking
  - `checkAttemptLimits(task)` - 4-attempt cap enforcement
- [ ] Unit tests for all phase transitions
- [ ] Unit tests for loop logic (3↔4, 5 internal)

**Files:**
- `backend/src/services/phaseOrchestrator.service.ts`
- `backend/src/services/__tests__/phaseOrchestrator.service.test.ts`

#### Day 3: Phase Validation Framework
**Goal:** Pluggable validation system for all phases

**Tasks:**
- [ ] Create `PhaseValidatorRegistry`
  - Interface: `PhaseValidator { validate(task, artifacts): ValidationResult }`
  - Registry pattern for phase-specific validators
  - Artifact extraction utilities (from container to filesystem + DB)
- [ ] Create base `ValidationResult` type with standard fields
- [ ] Artifact storage service (hybrid DB + filesystem)

**Files:**
- `backend/src/services/phaseValidation/PhaseValidatorRegistry.ts`
- `backend/src/services/phaseValidation/types.ts`
- `backend/src/services/artifactStorage.service.ts`

---

### Week 2: Phase Validators & Container Integration

#### Day 4: Phase 1-2 Validators
**Goal:** Planning and Implementation validation

**Tasks:**
- [ ] Implement `Phase1PlanningValidator`
  - Check for valid JSON structure
  - Handle `obsolete: true` case (cancel task)
  - Handle `task_realigned: true` case (update prompt)
- [ ] Implement `Phase2ImplementationValidator`
  - Verify PR created (query GitHub API)
  - Verify branch exists
  - Verify commits pushed
  - Extract PR metadata to artifacts_blob
- [ ] Integration tests for both validators

**Files:**
- `backend/src/services/phaseValidation/Phase1PlanningValidator.ts`
- `backend/src/services/phaseValidation/Phase2ImplementationValidator.ts`

#### Day 5: Phase 3-4 Validators
**Goal:** Review/Fix loop validation

**Tasks:**
- [ ] Implement `Phase3ReviewValidator`
  - Validate JSON schema (issues array with fingerprints)
  - Check fingerprint uniqueness
  - Determine if issues found (→ Phase 4) or clean (→ Phase 5)
- [ ] Implement `Phase4FixesValidator`
  - Validate fixes_applied matches Phase 3 issues
  - Check all_issues_addressed flag
  - Route: incomplete → Phase 4 again, complete → Phase 3 re-review
  - Verify commits pushed
- [ ] Integration tests for 3↔4 loop

**Files:**
- `backend/src/services/phaseValidation/Phase3ReviewValidator.ts`
- `backend/src/services/phaseValidation/Phase4FixesValidator.ts`

#### Day 6: Phase 5 Validator
**Goal:** Test coverage & validation (most complex)

**Tasks:**
- [ ] Implement `Phase5TestValidator`
  - Parse test results from artifacts
  - Calculate coverage delta on changed files
  - Validate all criteria: tests pass, lint, tsc, build, coverage ≥80%
  - Handle internal loop logic (stay in Phase 5 if failing)
- [ ] Create coverage delta calculator utility
  - Git diff to find changed files
  - Parse lcov coverage reports
  - Compare against baseline
- [ ] Integration tests for Phase 5 loop

**Files:**
- `backend/src/services/phaseValidation/Phase5TestValidator.ts`
- `backend/src/utils/coverageDelta.ts`

#### Day 7: Phase 6-7 Validators
**Goal:** Cleanup and PR Shepherding

**Tasks:**
- [ ] Implement `Phase6CleanupValidator`
  - Verify docs updated per DOCUMENTATION_SYSTEM.md
  - Verify phase artifacts pruned from PR
  - Check commits if docs changed
- [ ] Implement `Phase7PRShepherdingValidator`
  - Check all 8 merge gates (integrate with existing PR tracking)
  - Verify PR merged
  - Extract merge SHA
- [ ] Integration tests

**Files:**
- `backend/src/services/phaseValidation/Phase6CleanupValidator.ts`
- `backend/src/services/phaseValidation/Phase7PRShepherdingValidator.ts`

---

### Week 3: Container Lifecycle & Recovery

#### Day 8: Container Lifecycle Updates
**Goal:** Keep containers alive during validation + recovery

**Tasks:**
- [ ] Update `EphemeralWorkerService.completeTask()`
  - Run validation BEFORE destroying container
  - Keep container alive if validation fails
  - New flow: execute → validate → (recovery if needed) → destroy
- [ ] Update `TaskCompletionService`
  - Remove legacy REVIEW/FIX task creation logic (DELETE IT ALL)
  - Integrate with PhaseOrchestrator
  - Integrate with PhaseValidatorRegistry
- [ ] Add artifact extraction from container
  - Docker cp from `/workspace/.artifacts/` to host filesystem
  - Store structured data in `task_stage_runs.artifacts_blob`

**Files:**
- `backend/src/services/ephemeralWorker.service.ts` (MAJOR REFACTOR)
- `backend/src/services/taskCompletion.service.ts` (MAJOR REFACTOR)

#### Day 9: Recovery Agent Integration
**Goal:** Diagnose validation failures in same container

**Tasks:**
- [ ] Create `RecoveryAgentService`
  - Execute recovery agent in same container (multi-agent injection)
  - Parse structured recovery response
  - Route based on category (retry, context_update, blocked)
  - Handle recovery failure (4-attempt limit)
- [ ] Update `AgentSelector` to support recovery agent selection
  - New method: `selectRecoveryAgent(task, validationError)`
  - Consider context and error type
- [ ] Programmatic failure diagnosis (before recovery agent)
  - Detect critical errors vs. retriable failures
  - Auto-categorize common failure patterns

**Files:**
- `backend/src/services/recoveryAgent.service.ts`
- `backend/src/services/agentSelector.ts` (UPDATE)

#### Day 10: Multi-Agent Container Support
**Goal:** Single container image with all agent CLIs

**Tasks:**
- [ ] Update Docker image build
  - Install Claude Code CLI
  - Install Codex CLI
  - Install Gemini CLI
  - Verify all CLIs functional in container
- [ ] Test agent switching in same container
  - Start with Claude, switch to Codex for recovery
  - Verify credentials mounted correctly for all agents
- [ ] Update container execution to support agent parameter
  - `executeInContainer(containerId, agentType, prompt)`

**Files:**
- `Dockerfile` or equivalent (wherever dev-bot image is defined)
- `backend/src/services/ephemeralWorker.service.ts` (agent switching)

---

### Week 4: Phase 5 Test Infrastructure

#### Day 11: Test Entrypoint Script
**Goal:** Container entrypoint that runs tests before agent

**Tasks:**
- [ ] Create `/workspace/run-tests.sh` script
  - Run build (`npm run build`)
  - Run all test suites (unit, integration, e2e)
  - Run linters (`npm run lint`)
  - Run type checker (`tsc --noEmit`)
  - Generate coverage reports
  - Calculate coverage delta
  - Output results to `/workspace/.artifacts/test-results.json`
- [ ] Add script to Docker image
- [ ] Make entrypoint executable and test locally

**Files:**
- `docker/scripts/run-tests.sh` (or wherever scripts live)
- Update Dockerfile to copy script

#### Day 12: Coverage Delta Calculator
**Goal:** Determine which files changed and check coverage

**Tasks:**
- [ ] Create `coverage-delta.sh` script
  - Git diff to find changed files (vs. main branch)
  - Parse coverage reports (lcov format)
  - Calculate coverage % for changed files only
  - Output JSON: `{ changedFiles: [...], baseline: {...}, current: {...}, delta: -5.2 }`
- [ ] Create coverage baseline fetcher
  - Fetch main branch coverage from artifacts or CI
  - Handle first-time runs (no baseline)
- [ ] Add to Docker image

**Files:**
- `docker/scripts/coverage-delta.sh`
- `backend/src/utils/coverageBaseline.ts`

#### Day 13: Phase 5 Backend Orchestration
**Goal:** Backend controls Phase 5 test loop

**Tasks:**
- [ ] Update `EphemeralWorkerService` for Phase 5
  - Run entrypoint script first
  - Check results: pass → skip agent, fail → launch agent
  - After agent work, re-run tests via `docker exec`
  - Loop until pass or 4 attempts
- [ ] Handle Phase 5 internal loop counter
  - Track iterations in `phase_attempts`
  - Don't create new task_stage_runs for internal loops (just increment attempts)
- [ ] Implement partial progress tracking
  - Store test results in `phase_payload` between iterations
  - Enrich agent prompt with previous coverage/failures
- [ ] Test Phase 5 loop end-to-end

**Files:**
- `backend/src/services/ephemeralWorker.service.ts` (Phase 5 logic)
- `backend/src/services/phaseContextEnricher.ts` (NEW - context resumption)

---

### Week 5: Integration & Cleanup

#### Day 14: Queue & Chain Integration
**Goal:** Update queue pulling and chain tracking

**Tasks:**
- [ ] Update `TaskQueueService.pullNextTask()`
  - Remove `queue_stage` filtering (DELETE)
  - Use `phase_status` and `phase_index` instead
  - Implement phase-based priority (favor later phases to complete chains)
  - Priority order: Phase 7 > 6 > 5 > 4 > 3 > 2 > 1
- [ ] Update `ChainTrackerService`
  - Chain completes when task reaches Phase 7 complete (not when child tasks done)
  - Remove references to REVIEW/FIX child tasks
  - Update chain status based on phase_status
  - Track phase distribution in active chains
- [ ] Implement `WorkerPoolManager` (if needed)
  - Track active workers per phase
  - Metrics: worker phase distribution, queued phase distribution
  - No specialized pools (multi-agent image handles all phases)
- [ ] Remove ALL legacy child task creation logic
  - Search codebase for "REVIEW", "FIX", "COMPLETE" task types
  - Delete every instance of child task spawning
  - **BE RUTHLESS - DELETE IT ALL**

**Files:**
- `backend/src/services/taskQueue.sqlite.ts` (MAJOR CLEANUP)
- `backend/src/services/chainTracker.service.ts` (UPDATE)
- `backend/src/services/workerPoolManager.service.ts` (NEW - if implementing metrics)
- MANY files with legacy code (DELETE)

#### Day 15: Frontend Integration
**Goal:** UI shows phase progress

**Tasks:**
- [ ] Update task display to show phase info
  - Current phase name and number
  - Progress bar (phase 3 of 7)
  - Attempt count per phase
- [ ] Update task detail view
  - Show `task_stage_runs` history
  - Display artifacts for each phase
  - Show recovery diagnoses if any
- [ ] Update real-time updates
  - WebSocket events for phase transitions
  - Show when phase validating/recovering

**Files:**
- `frontend/src/components/tasks/TaskListItem.tsx`
- `frontend/src/components/tasks/TaskDetail.tsx`
- `frontend/src/services/api.ts` (add phase endpoints)

#### Day 16: Documentation Cleanup
**Goal:** Remove all incorrect/legacy documentation

**Tasks:**
- [ ] Update `docs/architecture/task-queue-architecture.md`
  - Remove REVIEW/FIX task sections
  - Document 7-phase system
  - Document loop logic
- [ ] Update `docs/architecture/master-design-intent.md`
  - Update "Task Chain Lifecycle" section
  - Remove references to child tasks
- [ ] Update `docs/architecture/pr-tracking-architecture.md`
  - Document Phase 7 integration
- [ ] Search ALL docs for agent assignment claims
  - Remove "Claude for implementation" claims
  - Remove "Codex for review" claims
  - Emphasize AgentSelector is authoritative
- [ ] Delete obsolete technical designs
  - `docs/technicalDesigns/staged-task-queue.md` (DELETE)
  - `docs/technicalDesigns/staged-task-queue-implementation-plan.md` (DELETE if exists)

**Files:**
- `docs/architecture/*.md` (UPDATE)
- `docs/technicalDesigns/*.md` (DELETE obsolete)

#### Day 17: Telemetry & Observability
**Goal:** Phase metrics and event system

**Tasks:**
- [ ] Create `PhaseMetricsService`
  - Query `task_stage_runs` for phase timing/success rates
  - Calculate loop iteration metrics
  - Track recovery invocation/success rates
  - Cache metrics in-memory (5-minute TTL)
- [ ] Add phase lifecycle events
  - Emit from PhaseOrchestrator: phase:started, phase:completed, phase:failed
  - Emit from RecoveryAgent: recovery:started, recovery:diagnosed
  - Emit loop events: phase:loop_iteration, phase:loop_max_attempts
- [ ] Create metrics API endpoint
  - `GET /api/metrics/phases` - aggregate phase metrics
  - `GET /api/metrics/phases/:phaseIndex` - specific phase details
- [ ] Add SLA breach detection
  - Define phase timeout thresholds
  - Alert when phases exceed SLA
- [ ] Create alerting rules service
  - Monitor phase success rates, recovery escalation rates
  - Emit alerts on critical thresholds
  - Actions: notify, escalate, pause task queue
- [ ] Update scripts
  - `monitor-tasks.js` - Read `phase_index`, show phase progress
  - `analyze-tasks.js` - Phase analytics, loop metrics, recovery rates

**Files:**
- `backend/src/services/phaseMetrics.service.ts` (NEW)
- `backend/src/routes/metrics.routes.ts` (NEW or UPDATE)
- `backend/src/services/phaseOrchestrator.service.ts` (add events)
- `backend/src/services/recoveryAgent.service.ts` (add events)
- `monitor-tasks.js`
- `analyze-tasks.js`

---

### Week 6: Testing & Deployment

#### Day 18-19: Integration Testing
**Goal:** End-to-end tests for all phase flows

**Tasks:**
- [ ] Test complete task lifecycle (1→2→3→4→3→5→6→7)
- [ ] Test Phase 3↔4 loop with max attempts
- [ ] Test Phase 5 internal loop with max attempts
- [ ] Test Recovery Agent interventions
  - Retry category
  - Context update category
  - Chain blocked category
  - System blocked category
- [ ] Test recovery failure scenarios
- [ ] Test artifact storage and retrieval
- [ ] Test validation failure edge cases
- [ ] Performance testing (container reuse efficiency)

**Files:**
- `backend/src/services/__tests__/phase-integration.test.ts` (NEW)

#### Day 20: Deployment Preparation
**Goal:** Ready for production deployment

**Tasks:**
- [ ] Drop production database (coordinate with team)
- [ ] Run migrations fresh on production
- [ ] Deploy new Docker image with multi-agent support
- [ ] Deploy backend with phase system
- [ ] Deploy frontend with phase UI
- [ ] Verify no legacy code remains (git grep for REVIEW/FIX/queue_stage)
- [ ] Smoke test: Create task, watch it progress through phases

#### Day 21: Monitoring & Iteration
**Goal:** Observe production behavior and fix issues

**Tasks:**
- [ ] Monitor first few tasks through phase pipeline
- [ ] Watch for validation failures
- [ ] Watch for recovery agent performance
- [ ] Tune attempt limits if needed
- [ ] Tune validation thresholds if needed
- [ ] Fix any bugs discovered

---

## Critical Success Criteria

### Must-Haves Before Deployment
- ✅ All 7 phase validators implemented and tested
- ✅ Phase 3↔4 loop works (max 4 iterations)
- ✅ Phase 5 internal loop works (max 4 iterations)
- ✅ Recovery Agent executes in same container
- ✅ Artifact storage (DB + filesystem) working
- ✅ ALL legacy REVIEW/FIX code deleted
- ✅ `queue_stage`, `original_task_id` columns removed
- ✅ Documentation updated and accurate
- ✅ No references to hardcoded agent assignments
- ✅ Integration tests passing

### Zero Tolerance Items (MUST BE DELETED)
- ❌ Any code creating REVIEW tasks
- ❌ Any code creating FIX tasks
- ❌ Any code creating COMPLETE tasks as separate entities
- ❌ Any references to `queue_stage` column
- ❌ Any references to `original_task_id` column
- ❌ Any hardcoded agent preferences per phase
- ❌ Any feature flags for old vs. new system
- ❌ Any migration logic for in-flight chains
- ❌ Any documentation mentioning child tasks

---

## Risk Mitigation

### Low Risk (No Production Dependencies)
- Can iterate freely without coordination
- Can redeploy multiple times if needed
- Database reset is acceptable

### Potential Issues
1. **Container image size** - Multi-agent image may be large
   - Mitigation: Acceptable per design decisions
2. **Phase 5 test execution time** - Full suite may be slow
   - Mitigation: Optimize later, correctness first
3. **Recovery Agent accuracy** - May not categorize correctly
   - Mitigation: Programmatic fallbacks, human escalation

---

## Post-Deployment Optimization (Future)

**NOT part of initial implementation:**
- Phase skip logic (e.g., docs-only tasks skip tests)
- Dynamic phase configuration (database-driven state machine)
- Advanced recovery strategies (multi-agent consensus)
- Phase-level timeout tuning per task type
- Artifact retention policies
- Historical analytics dashboard

**Focus now:** Get 7-phase system working reliably with uniform logic across all phases.

---

## Implementation Complete When

- ✅ Single task progresses 1→2→3→4→3→5→6→7→merged
- ✅ Phase loops iterate correctly with attempt limits
- ✅ Recovery Agent diagnoses failures and routes correctly
- ✅ All artifacts stored and retrievable
- ✅ Zero legacy code in codebase (verified via grep)
- ✅ Documentation reflects new architecture
- ✅ Tests pass for all phase transitions
- ✅ Production deployment successful

**Then delete:**
- `docs/technicalDesigns/task-processing-stage-redesign.md`
- `docs/technicalDesigns/task-processing-stage-implementation-clarifications.md`
- This roadmap document

**And update:**
- `docs/architecture/task-queue-architecture.md` to be canonical reference

---

**Ready to begin implementation.**
