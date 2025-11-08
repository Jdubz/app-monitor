# App Monitor: Next Steps and Roadmap

**Version:** 0.2.0
**Last Updated:** November 7, 2025
**Current Phase:** Pre-POC Stabilization

---

## Table of Contents

1. [Current Status](#current-status)
2. [Immediate Priorities](#immediate-priorities)
3. [Stabilization Tasks](#stabilization-tasks)
4. [POC Phase](#poc-phase)
5. [Autonomy Phase](#autonomy-phase)
6. [Long-Term Vision](#long-term-vision)

---

## Current Status

### Project Phase: Pre-POC Stabilization (v0.2.0)
**Goal**: Restore green builds/tests and establish foundations for autonomous continuous task queue

### Completion Overview
- **Overall Progress**: 85% production-ready
- **Backend**: 543/543 tests passing ✅
- **Frontend**: Build passing, tests passing ✅
- **Infrastructure**: Ephemeral containers, safety mechanisms ✅
- **Remaining**: Build errors (non-critical), prompt engineering v3, token tracking

### Recent Accomplishments (Nov 6, 2025)
- ✅ Fixed all critical TypeScript errors in backend
- ✅ Implemented failure recovery system with dry-run mode
- ✅ Added real-time stuck task detection (60-minute timeout)
- ✅ Implemented ephemeral containers (72% smaller, 80% faster)
- ✅ Added safety mechanisms (patch files, uncommitted changes detection)
- ✅ Frontend build and linting fully operational
- ✅ Git hooks (pre-commit, pre-push) working

### Active Issues
1. **Build Errors**: Some TypeScript errors remain in `routes/` and `server.ts` (non-critical, runtime works)
2. **Prompt Engineering v3**: System designed but not yet implemented
3. **Token Tracking**: Not yet integrated across providers
4. **Quality Metrics Dashboard**: Not yet implemented

---

## Immediate Priorities

### Critical Path (Next 2 Weeks)

#### 1. Fix Remaining Build Errors
**Why**: Enable clean builds for confidence in deployments
**Complexity**: Medium
**Impact**: High

Tasks:
- Resolve TypeScript errors in `backend/src/routes/`
- Fix type issues in `backend/src/server.ts`
- Verify all workspaces build cleanly
- Re-enable strict TypeScript checks

#### 2. Implement V3 Prompt Engineering
**Why**: Prevent scope creep and duplication in autonomous tasks
**Complexity**: High
**Impact**: Critical for autonomy

Tasks:
- Create `validateTaskTemplate()` function with v3 compliance checks
- Build task template library (migrations, extensions, bugfixes, refactors)
- Add scope validation to task creation API (doNotCreate, mustNotDuplicate fields)
- Enforce mandatory investigation phase in all templates
- Add pre-implementation checklist validation
- Update specification documents to use "EXACTLY N items" format

#### 3. Token Tracking Integration
**Why**: Essential for budget management and cost optimization
**Complexity**: High
**Impact**: Critical for autonomy

Tasks:
- Research token APIs for Claude, OpenAI, Cursor, Copilot
- Implement TokenTrackingService with provider-specific tracking
- Build dashboard token monitoring UI
- Calculate daily budgets from weekly/monthly limits
- Implement hard stop when budget reached
- Add historical usage tracking and analytics

#### 4. Quality Metrics Baseline
**Why**: Establish measurable success criteria for bot execution
**Complexity**: Medium
**Impact**: High

Tasks:
- Define success metrics (scope compliance 100%, duplication 0%, workflow success 100%)
- Implement metrics collection in task execution
- Create quality metrics dashboard UI
- Set up alert thresholds (10% yellow, 20% red, 30% emergency)
- Track scope violations, code duplication, git commit success
- Record investigation completion rates

---

## Stabilization Tasks

### Frontend Health (FE)
- [x] **FE-1**: Fix TypeScript compilation errors - ✅ COMPLETE
- [x] **FE-2**: Resolve ESLint warnings - ✅ COMPLETE
- [ ] **FE-3**: Audit dev-bot UI layouts for runtime errors

**Deliverable**: Frontend builds and runs without errors

### Backend Health (BE)
- [x] **BE-1**: Fix TypeScript compilation errors - ✅ COMPLETE (543/543 tests passing)
- [x] **BE-2**: Implement automatic failure recovery system - ✅ COMPLETE
- [x] **BE-3**: Re-enable pre-push hooks (lint + backend/frontend tests) now that builds are green — ✅ VERIFIED 2025-11-08 (`.husky/pre-push` runs lint + `npm run test:backend`/`npm run test:frontend` with memory guards)

**Deliverable**: Backend builds cleanly with all tests passing

### Work-Target Registry Migration (WT)
**Complexity**: High | **Impact**: High | **Estimated**: 2 weeks

- [ ] **WT-1**: Design SQLite schema extensions for JSON config fields
  - Store services, log sources, repo paths, env vars
  - Migration script + TypeScript access layer

- [ ] **WT-2**: Write migration utility for JSON → SQLite
  - Ingest `backend/config/work-targets/*.json`
  - Keep JSON backups for rollback
  - CLI script with dry-run mode

- [ ] **WT-3**: Update backend services to read from SQLite
  - ProcessManager, LogSourceManager, UI queries
  - Fallback to JSON during migration window

- [ ] **WT-4**: Document registry ownership and editing workflow
  - Manual override steps
  - Update procedures
  - Rollback instructions

**Deliverable**: SQLite as authoritative work-target registry

### Build & CI Hygiene (CI)
**Complexity**: Low | **Impact**: Medium | **Estimated**: 3 days

- [ ] **CI-1**: Confirm GitHub Actions workflow matches updated scripts
  - Verify references to `npm run test:backend`, `npm run test:frontend`
  - Check `npm run lint --workspaces` works

- [ ] **CI-2**: Add lightweight smoke job per workspace
  - Basic build/test validation
  - Log status until UI dashboard ready

- [ ] **CI-3**: Ensure local `make` targets work post-migration
  - Test `make dev`, `make dev-backend`, `make dev-frontend`
  - Verify `make test` runs all tests

**Deliverable**: Reliable CI/CD pipeline with automated checks

### Documentation & Onboarding (DOC)
**Complexity**: Low | **Impact**: Medium | **Estimated**: 2 days

- [ ] **DOC-1**: Update root README/CONTRIBUTING with stabilization steps
  - Reference new planning index
  - Link to consolidated documentation

- [ ] **DOC-2**: Create stabilization checklist summary
  - Reference stabilization plan
  - Clear next steps for contributors

- [ ] **DOC-3**: Archive superseded plan references
  - Link to capability roadmap
  - Consolidate historical documents

**Deliverable**: Clear, up-to-date documentation for all contributors

### Baseline Metrics (MET)
**Complexity**: Medium | **Impact**: High | **Estimated**: 1 week

- [ ] **MET-1**: Instrument token logging for every job
  - Include successes and failures
  - Track provider, model, tokens used

- [ ] **MET-2**: Capture baseline counts
  - Test duration, lint duration, build time
  - Number of outstanding tasks
  - Store as seed data in SQLite or JSON

- [ ] **MET-3**: Define manual process for monthly spend recording
  - Until automated APIs exist
  - Track Anthropic, OpenAI, Cursor, Copilot

**Deliverable**: Baseline metrics captured for future comparison

### Task Context Foundations (TC)
**Complexity**: High | **Impact**: Critical | **Estimated**: 2 weeks

- [x] **TC-1**: Task context submission schemas/validators - ✅ IN PROGRESS
- [x] **TC-2**: SQLite migrations for task context tables - ✅ IN PROGRESS
- [x] **TC-3**: Extend task API for context payloads - ✅ IN PROGRESS
- [x] **TC-4**: Container requirements documentation - ✅ COMPLETE
- [x] **TC-5**: Ephemeral container implementation - ✅ COMPLETE
- [x] **TC-6**: Safety mechanisms for uncommitted changes - ✅ COMPLETE

**Deliverable**: Foundation for context-rich autonomous task execution

### Prompt Engineering v3 (PE)
**Complexity**: High | **Impact**: Critical | **Estimated**: 2 weeks

- [ ] **PE-1**: Implement task template validation system
  - `validateTaskTemplate()` function
  - Clear error messages for violations

- [ ] **PE-2**: Create task template library
  - Migration template (`createMigrationTaskTemplate()`)
  - Extension template (`createExtensionTaskTemplate()`)
  - Bugfix template (`createBugfixTaskTemplate()`)
  - Refactor template (`createRefactorTaskTemplate()`)

- [ ] **PE-3**: Add scope validation rules to task creation API
  - Reject tasks without required v3 fields
  - Enforce investigation, doNotCreate, constraints fields

- [ ] **PE-4**: Enforce mandatory investigation phase
  - All tasks include investigation steps
  - Require mustFind, mustNotDuplicate fields

- [ ] **PE-5**: Add pre-implementation checklist validation
  - Verification checklist before execution begins
  - Track checklist completion

- [ ] **PE-6**: Update specification documents
  - Use "EXACTLY N items" format
  - Explicit feature lists to prevent scope creep

**Deliverable**: V3 prompt template system operational, preventing scope creep

### Quality Metrics Baseline (QM)
**Complexity**: Medium | **Impact**: High | **Estimated**: 1 week

- [ ] **QM-1**: Define success metrics for bot execution
  - Target: Scope compliance 100%
  - Target: Duplication rate 0%
  - Target: Git workflow success 100%
  - Target: Feature creep 0%

- [ ] **QM-2**: Implement metrics collection
  - Track scope violations
  - Detect code duplication
  - Monitor git commit success
  - Record investigation completion

- [ ] **QM-3**: Create quality metrics dashboard
  - Real-time scope compliance display
  - Duplication detection visualization
  - Workflow success rates

- [ ] **QM-4**: Set up alert thresholds
  - Yellow: 10% scope violations
  - Red: 20% scope violations
  - Emergency: 30% scope violations

**Deliverable**: Quality metrics dashboard operational with alerts

---

## POC Phase

### Goal: Prove Autonomous Continuous Task Queue
**Timeline**: 4-6 weeks after stabilization complete
**Success Criteria**: Bots successfully complete 10+ tasks autonomously with 90%+ quality scores

### Platform Stability & Infrastructure
**Complexity**: Medium | **Impact**: High

- [ ] Add smoke-test job per work-target (basic build/test)
- [ ] Expose test status in dashboard
- [ ] Ensure nightly lint/test cron keeps regressions visible

**Why**: Catch issues early, maintain system health

### Work-Target Intelligence
**Complexity**: High | **Impact**: Critical

- [ ] Extend schema for documentation catalogs
- [ ] Add service metadata (control commands, health hints, logging sources)
- [ ] Surface registry data in UI for quick reference
- [ ] Implement automated task discovery from issue patterns
- [ ] Add per-work-target success metrics
- [ ] Create documentation catalog with semantic search

**Why**: Enable intelligent task routing and context provision

### Service Orchestration
**Complexity**: Medium | **Impact**: Medium

- [ ] Onboard remaining work-target services into registry
- [ ] Add dependency graphs and environment notes
- [ ] Create UI controls for start/stop/kill with execution awareness

**Why**: Complete service management capabilities

### Logging & Observability
**Complexity**: Medium | **Impact**: High

- [ ] Connect job-finder, portfolio, imagineer log sources
- [ ] Add saved queries per target
- [ ] Expose lightweight log context endpoints for agents

**Why**: Provide agents with diagnostic context

### Task Automation
**Complexity**: High | **Impact**: Critical

- [ ] Stand up TaskAutomationManager and Docker runner
- [ ] Per-work-target configuration with bootstrap scripts
- [ ] Implement healing system for auto-recovery
- [ ] Add real-time scope monitoring with boundary validation
- [ ] Build auto-recovery system for scope violations
- [ ] Create template-based task creation UI

**Why**: Core autonomous task execution infrastructure

### Dev-Bot Experience
**Complexity**: High | **Impact**: Critical

- [ ] Stand up continuous task queue
- [ ] Bots pull prioritized work, update status
- [ ] Store metrics (accuracy, tokens, speed)
- [ ] UI summary of active/queued tasks and dependencies
- [ ] Track scope compliance and duplication rates
- [ ] Implement learning database for task patterns

**Why**: Enable fully autonomous development workflow

### Agent Console & UI
**Complexity**: Medium | **Impact**: Medium

- [ ] Implement agent terminal tab with WebSocket sessions
- [ ] Session logs stored as rotating flat files
- [ ] Support per-work-target layouts

**Why**: Developer visibility and debugging

### Token & Budget Awareness
**Complexity**: Medium | **Impact**: High

- [ ] Build budget dashboard with rolling totals vs limits
- [ ] Soft alerts for projected overages
- [ ] Support manual import of provider usage exports

**Why**: Stay within budget constraints

### Deployment & Operations
**Complexity**: Low | **Impact**: Medium

- [ ] Provide optional Docker Compose profile
- [ ] Add Cloudflare tunnel placeholder config
- [ ] Google OAuth stubs (local-only)

**Why**: Flexible deployment options

### Security & Access Control
**Complexity**: Medium | **Impact**: High

- [ ] Integrate Google OAuth for UI gate
- [ ] Instrument audit logs for agent terminal sessions
- [ ] Standardize secret templates per target

**Why**: Secure autonomous operations

### Data & Analytics
**Complexity**: Medium | **Impact**: High

- [ ] Build analytics primitives (success score, token trends, velocity)
- [ ] Expose query endpoints for bots
- [ ] Implement cross-system learning data integration
- [ ] Add learning effectiveness validation with A/B testing
- [ ] Track healing system effectiveness

**Why**: Continuous improvement and optimization

### Periodic Maintenance
**Complexity**: High | **Impact**: High

- [ ] Implement periodic scheduler for automated maintenance
- [ ] Add code deduplication engine with pattern detection
- [ ] Create linting engine with auto-fix (style, bugs, performance, security)
- [ ] Build testing engine for coverage analysis (80% minimum target)
- [ ] Implement documentation cleanup engine
- [ ] Set up codebase health monitoring with alerts

**Why**: Maintain code quality automatically

### Continuous Task Queue
**Complexity**: High | **Impact**: Critical

- [ ] Implement queue backend with dependency tracking
- [ ] Status transitions and priority management
- [ ] Integrate periodic maintenance tasks into scheduling

**Why**: Core autonomous development loop

---

## Autonomy Phase

### Goal: Self-Building, Self-Improving System
**Timeline**: 8-12 weeks after POC proves viable
**Success Criteria**: System generates and completes its own improvement tasks with minimal human intervention

### Platform Stability
- [ ] Bots open stabilization tasks automatically on failures
- [ ] Produce diffs and gate on human review only when confidence < threshold

### Work-Target Intelligence
- [ ] Allow bots to append/update registry entries after successful modifications
- [ ] Automated diff review and rollback history
- [ ] Auto-generate tasks from detected issues across all work targets
- [ ] Dynamic work-target configuration based on success patterns

### Service Orchestration
- [ ] Queue-aware bots schedule service restarts/fixes
- [ ] Validate health post-action
- [ ] Only mark tasks complete after verification

### Logging & Observability
- [ ] Bots capture "log recipes" when solving incidents
- [ ] Reuse them automatically in diagnostics

### Task Automation
- [ ] Containerized remediation agents process eligible tasks
- [ ] Attach artifacts, log automation events
- [ ] Feed results back into continuous queue
- [ ] Predictive task refinement based on learned failure patterns
- [ ] Self-adjusting scope boundaries
- [ ] Automatic healing and retry with confidence-based escalation

### Dev-Bot Experience
- [ ] Dynamic personality routing based on success metrics
- [ ] Experimentation knob with guardrails for high-confidence auto-merges
- [ ] Predictive failure prevention
- [ ] Self-optimizing agent selection using A/B testing

### Agent Console & UI
- [ ] Adaptive UI surfaces bot recommendations
- [ ] Auto-populates planning prompts
- [ ] Highlights confidence per decision

### Token & Budget
- [ ] Task queue throttles based on budgets
- [ ] Schedules cost-heavy work intelligently
- [ ] Proposes budget adjustments with supporting metrics

### Deployment
- [ ] Bots prepare release PRs
- [ ] Validate in staging
- [ ] Approve production redeploy when gates pass

### Security
- [ ] Bots audit secret usage
- [ ] Rotate mounted credentials
- [ ] Raise tasks when stale/unused secrets remain

### Data & Analytics
- [ ] Schedule self-review tasks that compute trend regressions
- [ ] Feed prioritized improvements back into queue
- [ ] Predictive analytics for failure prevention
- [ ] Self-tuning quality thresholds

### Periodic Maintenance
- [ ] Self-scheduling cleanup based on codebase health metrics
- [ ] Predictive maintenance scheduling
- [ ] Automated cleanup with human approval only for high-risk changes
- [ ] Continuous quality improvement loop

### Continuous Task Queue
- [ ] Queue becomes self-feeding
- [ ] Bots generate improvement tasks post-review
- [ ] Adjust priorities via success metrics
- [ ] Auto-generation of maintenance tasks

---

## Long-Term Vision

### Evolutionary Goals

#### Self-Improving Platform
- System tunes its own prompts automatically
- Adjusts quality gates based on success patterns
- Optimizes capacity planning dynamically
- Learns from every task execution

#### Multi-Model Intelligence
- Intelligent routing across Claude, GPT, Cursor, Copilot
- Cost/quality trade-offs inform decisions
- A/B testing framework for agent personalities
- Continuous optimization based on results

#### Advanced Healing & Recovery
- Context provision improvements (auto-include relevant code snippets)
- Task decomposition engine for complex work
- Code snippet injection for minimal-scope changes
- Pattern-based auto-recovery

#### Agent Specialization
- Maintain personality library with specialization metrics
- Comparative experiments for performance optimization
- Track effectiveness per model/provider
- Dynamic personality evolution

### Research & Expansion Backlog

#### Copilot & External Integrations
- Evaluate GitHub Copilot integration
- Third-party review tools (Code Climate, etc.)
- External feedback as advisory input
- Safe PR suggestion pathways

#### Script Consolidation
- Centralize repo-specific scripts through UI
- Maintain legacy Makefile/CLI compatibility
- Unified script management across work targets

#### Developer Experience
- Adaptive UI for task management
- Real-time collaboration features
- Enhanced debugging and monitoring tools
- Streamlined workflow automation

---

## Success Metrics

### Stabilization Phase Complete When:
- ✅ All frontend and backend tests passing
- ✅ All build errors resolved
- ✅ V3 prompt template system operational
- ✅ Token tracking integrated across all providers
- ✅ Quality metrics dashboard functional
- ✅ Pre-push hooks re-enabled and working
- ✅ SQLite work-target registry operational
- ✅ Documentation updated and comprehensive

### POC Phase Complete When:
- ✅ Continuous task queue operational
- ✅ Bots successfully complete 10+ tasks autonomously
- ✅ Quality scores consistently above 90%
- ✅ Token budgets respected
- ✅ Healing system auto-recovers from failures
- ✅ Scope violations below 5%
- ✅ Code duplication below 10%
- ✅ All quality gates enforced

### Autonomy Phase Complete When:
- ✅ System generates its own improvement tasks
- ✅ Auto-merges with >95% confidence
- ✅ Predictive failure prevention working
- ✅ Self-tuning prompts and configurations
- ✅ Cost per task decreasing over time
- ✅ Quality scores improving autonomously
- ✅ Human intervention < 10% of tasks

---

## Priority Matrix

### High Priority + High Impact (Do First)
1. Fix remaining build errors
2. Implement v3 prompt engineering
3. Token tracking integration
4. Quality metrics baseline

### High Priority + Medium Impact (Do Next)
5. Work-target registry migration
6. Task automation infrastructure
7. Continuous task queue implementation

### Medium Priority + High Impact (Important)
8. Healing system implementation
9. Learning database and analytics
10. Periodic maintenance system

### Low Priority + High Impact (Strategic)
11. Multi-model intelligence
12. Advanced healing & recovery
13. Full autonomy features

---

## Getting Started

### For New Contributors

1. **Read Documentation**:
   - [Architecture](./architecture.md)
   - [Setup Guide](./setup.md)
   - [Development Guide](./DEVELOPMENT.md)

2. **Pick a Task**:
   - Start with "Low Complexity" tasks
   - Look for "Good First Issue" labels
   - Ask questions in discussions

3. **Follow Workflow**:
   - Create feature branch from `staging`
   - Make changes with tests
   - Run linting and tests
   - Submit PR with clear description

### For Existing Contributors

1. **Check Current Sprint**: Review [Stabilization Plan](./plans/APP_MONITOR_STABILIZATION_PLAN.md)
2. **Grab Next Task**: Look for uncompleted tasks in your area
3. **Update Status**: Mark tasks in progress, complete when done
4. **Communicate**: Update team on blockers or questions

---

## Related Documentation

- [Architecture Overview](./architecture.md) - System design and components
- [Setup Guide](./setup.md) - Installation and configuration
- [Development Guide](./DEVELOPMENT.md) - Developer workflows
- [Stabilization Plan](./plans/APP_MONITOR_STABILIZATION_PLAN.md) - Current phase details
- [Capability Roadmap](./plans/APP_MONITOR_CAPABILITY_ROADMAP.md) - Long-term vision
- [Migration Guide](./MIGRATION_GUIDE.md) - Migration from dev-monitor

---

**Last Updated**: November 7, 2025
**Document Version**: 1.0
**Project Version**: v0.2.0
