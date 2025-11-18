# Integrated Planning System - Status Review

**Date:** 2025-11-17
**Reviewer:** GitHub Copilot CLI
**Scope:** Complete assessment of planning system implementation vs documentation

---

## Executive Summary

The integrated planning system has **three separate designs** that need to be reconciled:

1. **Basic Planning System** (✅ IMPLEMENTED) - Simple plan tracking with task linkage
2. **DRY Implementation Plan** (📋 DESIGN ONLY) - Code reuse focused approach  
3. **Multi-Phase Plan System** (📋 DESIGN ONLY) - File-first, batch-based, admin bot integrated

**Status:** Only #1 is implemented. #2 and #3 are comprehensive design documents but have no implementation.

---

## What's Currently Implemented (Migration 021)

### Database Schema ✅
- `plans` table with fields: id, title, description, markdown_ref, plan_type, priority, status, timestamps, ownership, success_criteria, scope_boundaries
- Status values: `'planning' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'`
- Indexes on status, priority, type, created_at
- `plan_id` column in tasks table (soft FK, no CASCADE)

### Backend Services ✅
- **PlansService** (`backend/src/services/plans.service.ts`) - CRUD operations
- **PlanProgressCalculator** (`backend/src/services/planProgressCalculator.service.ts`) - Computes progress from tasks/PRs/chains
- **PlanStatusUpdater** (`backend/src/services/planStatusUpdater.service.ts`) - Event-driven status updates

### API Routes ✅
- **File:** `backend/src/routes/dev-bots/plans.routes.ts`
- Endpoints:
  - POST `/api/dev-bots/plans` - Create plan
  - GET `/api/dev-bots/plans` - List plans (with filters)
  - GET `/api/dev-bots/plans/:id` - Get plan details
  - PATCH `/api/dev-bots/plans/:id` - Update plan
  - DELETE `/api/dev-bots/plans/:id` - Delete plan

### Frontend ✅
- **Component:** `PlansTabContent.tsx` (uses stub data, not connected to API)
- **Type Contracts:** Shared types in `shared/api-contracts/`

### Test Coverage ✅
- Unit tests for PlansService
- Unit tests for PlanProgressCalculator  
- Unit tests for PlanStatusUpdater
- Integration tests for API routes

---

## What's NOT Implemented (Design-Only Features)

### From integrated-planning-system-implementation-plan.md

**Designed but NOT Built:**
- Plan file backups table (`plan_file_backups`)
- Plan task linker service (`PlanTaskLinker`)
- Plan batch support (no tables, no service, no UI)
- Batch submission endpoints
- Restore from backup endpoint
- UI for batch management

**Key Finding:** This document says "~70% of needed functionality already exists" but it was written BEFORE implementation. The actual implementation is much simpler.

### From multi-phase-plan-system.md

**Designed but NOT Built:**
- File-first approach (markdown files in `docs/plans/`)
- YAML frontmatter with plan metadata
- Multi-phase status flow: `draft → researched → ready → in_progress → completed`
- Task batches (`task_batches` field with dependencies, swimlanes)
- Plan batches table (`plan_batches`)
- Batch dependencies and ordering
- Incremental batch submission
- Admin bot integration (volume mounts, context docs, CLI commands)
- Event-driven batch completion tracking
- Milestone system
- Learning/retrospective capture
- Plan dependencies (blocks_on, enables)
- Backup/restore from file versions

**Key Finding:** This is a COMPLETE redesign, not an extension. It would replace 80% of the current implementation.

---

## Gap Analysis

### Database Schema Gaps

| Feature | Current State | Multi-Phase Design | Gap |
|---------|--------------|-------------------|-----|
| Status values | 5 values (planning, in_progress, blocked, completed, cancelled) | 7 values (adds draft, researched, ready) | ❌ Missing 2 statuses |
| Batch tables | ❌ None | `plan_batches`, `plan_file_backups` | ❌ Missing tables |
| Task batch_id | ❌ No column | `batch_id TEXT` in tasks | ❌ Missing column |
| Dependencies | ❌ No support | `blocks_on`, `enables` fields | ❌ Missing feature |
| Phase metadata | ❌ No support | `phase_metadata` JSON | ❌ Missing feature |

### Service Layer Gaps

| Service | Current State | Multi-Phase Design | Gap |
|---------|--------------|-------------------|-----|
| PlansService | ✅ Database CRUD | File-first CRUD + backup/restore | ⚠️ Needs refactor |
| PlanProgressCalculator | ✅ Task-based progress | Task + batch progress | ⚠️ Needs extension |
| PlanStatusUpdater | ✅ Task events | Task + batch events | ⚠️ Needs extension |
| PlanTaskLinker | ❌ Not implemented | Links tasks to plans | ❌ Missing service |
| Batch submission | ❌ Not implemented | Submit batch to queue | ❌ Missing service |

### API Gaps

| Endpoint | Current State | Multi-Phase Design | Gap |
|----------|--------------|-------------------|-----|
| POST /plans/:id/validate | ❌ Not implemented | Validate plan file YAML | ❌ Missing |
| POST /plans/:id/submit | ❌ Not implemented | Save backup to DB | ❌ Missing |
| POST /plans/:id/batches/:batchId/submit | ❌ Not implemented | Submit batch to queue | ❌ Missing |
| POST /plans/:id/restore | ❌ Not implemented | Restore from backup | ❌ Missing |

### Frontend Gaps

| Component | Current State | Multi-Phase Design | Gap |
|-----------|--------------|-------------------|-----|
| PlansTabContent | ✅ Exists (stub data) | Connected to API | ⚠️ Not connected |
| Batch management UI | ❌ Not implemented | Batch list, submit controls | ❌ Missing |
| Batch progress bars | ❌ Not implemented | Per-batch progress | ❌ Missing |
| Dependency visualization | ❌ Not implemented | Batch dependency graph | ❌ Missing |

### Admin Bot Integration Gaps

| Feature | Current State | Multi-Phase Design | Gap |
|---------|--------------|-------------------|-----|
| Volume mounts | ❌ Not implemented | Mount `docs/plans/` to container | ❌ Missing |
| Context document | ❌ Not implemented | `docs/context/admin-bot-plan-management.md` | ❌ Missing |
| CLI commands | ❌ Not implemented | curl commands for validate/submit | ❌ Missing |
| Workflow docs | ❌ Not implemented | Step-by-step phase progression | ❌ Missing |

---

## Architectural Conflicts

### 1. Database-First vs File-First

**Current Implementation:**
- Database is source of truth
- `markdown_ref` is optional pointer to docs
- Plans created via API POST

**Multi-Phase Design:**
- Files are source of truth (YAML frontmatter + Markdown)
- Database is backup/cache only
- Plans created by editing files + validation

**Conflict:** These are fundamentally incompatible approaches.

### 2. Simple Status vs Multi-Phase Workflow

**Current Implementation:**
- 5 status values
- Status computed from task states
- No phase transitions

**Multi-Phase Design:**
- 7 status values with phase semantics
- Status reflects phase (draft → researched → ready)
- Explicit phase transitions required

**Conflict:** Adding 2 status values would break existing status computation logic.

### 3. Task Linkage vs Batch Linkage

**Current Implementation:**
- Tasks have `plan_id` (soft FK)
- No batch concept
- Progress = aggregate all tasks

**Multi-Phase Design:**
- Tasks have `plan_id` AND `batch_id`
- Batches have dependencies and ordering
- Progress = aggregate by batch, then by plan

**Conflict:** Would require migration of all existing tasks and rewrite of progress calculator.

---

## Implementation Effort Estimate

### Option 1: Keep Current System (0 days)
- ✅ Working backend, API, services, tests
- ✅ Event-driven status updates
- ✅ Simple and maintainable
- ❌ No batching, no file-first, no admin bot

### Option 2: Implement DRY Plan (10-12 days)
- Add batch tables and services
- Extend progress calculator
- Add batch submission endpoints
- Add UI for batch management
- Keep database-first approach
- **Does NOT include file-first or admin bot**

### Option 3: Implement Multi-Phase Plan (20-25 days)
- Replace database-first with file-first
- Add 7-phase workflow
- Add batch tables and full dependency system
- Add backup/restore from files
- Integrate admin bot (volume mounts, context docs)
- Add milestone and learning capture
- Complete UI overhaul
- **Complete redesign, high risk**

### Option 4: Hybrid Approach (15-18 days)
- Keep database-first for now
- Add batch support (tables, services, API)
- Add file export/import (but DB remains source of truth)
- Add batch UI
- Defer admin bot integration
- Defer multi-phase status flow
- **Incremental, lower risk**

---

## Recommendations

### 1. Validate Requirements First ⚠️

**Questions to Answer:**
- Is the current simple planning system sufficient?
- Do we actually need batching? (Can we use task chains instead?)
- Do we need file-first approach? (Database works fine for agents)
- Is admin bot integration critical? (Interactive tab already exists)

**Before implementing anything, clarify:**
- Who are the users? (AI agents or humans?)
- What problems does batching solve that chains don't?
- Why file-first when database is more reliable for automation?

### 2. If Batching is Required: Hybrid Approach ✅

**Phase 1 (Week 1-2): Core Batching**
- Migration 022: Add `plan_batches` table and `batch_id` to tasks
- Extend PlanProgressCalculator for batch-level metrics
- Add batch submission endpoint
- Update PlanStatusUpdater for batch events

**Phase 2 (Week 3): UI Integration**
- Connect PlansTabContent to API (remove stub data)
- Add batch list view
- Add batch submission controls
- Add batch progress indicators

**Phase 3 (Week 4): Polish**
- Add batch validation
- Add dependency checking
- Add escalation on batch failures
- Documentation updates

**Benefits:**
- Incremental delivery
- Low risk (extends existing system)
- Preserves working features
- Can defer file-first and admin bot

### 3. If Simple System is Sufficient: Stop Here ✅

**Current system provides:**
- Plan tracking with automatic status computation
- Task linkage via `plan_id`
- Event-driven progress tracking
- PR and chain integration
- Query and filtering
- Full test coverage

**Consider:**
- Use task chains for dependencies (already implemented)
- Use interactive tab for admin workflows (already implemented)
- Keep markdown files as documentation, not source of truth

---

## Critical Issues in Documentation

### 1. Conflicting Designs

The two implementation plans contradict each other:
- **DRY Plan:** Extends database-first with batches (~1,000 new lines)
- **Multi-Phase Plan:** Replaces with file-first (~3,000 line rewrite)

**Resolution Needed:** Choose ONE approach, archive the other.

### 2. Implementation Status Not Tracked

None of the design documents indicate:
- What's actually implemented
- What's partially implemented  
- What's design-only

**Resolution Needed:** Add status headers to all plan docs.

### 3. Unclear Requirements

Neither document explains:
- Why batching is needed (vs task chains)
- Why file-first is needed (vs database)
- Who the users are (agents or humans)

**Resolution Needed:** Add "Problem Statement" and "Alternatives Considered" sections.

---

## Next Steps

### Immediate (This Session)

1. ✅ **Document current state** (this file)
2. 🔄 **Clarify requirements** with user
3. ⏳ **Choose implementation path** (Option 1-4)
4. ⏳ **Update documentation** to reflect decision

### Short-term (1-2 weeks)

If batching is needed:
1. Design migration 022 (batch tables)
2. Implement batch services
3. Add batch API endpoints
4. Update tests

If current system is sufficient:
1. Connect frontend to API
2. Remove stub data
3. Archive unimplemented designs
4. Update docs to reflect "basic plan tracking"

### Long-term (1+ months)

If file-first is needed:
1. Write comprehensive migration plan
2. Implement file parser/validator
3. Add backup/restore system
4. Migrate existing plans to files
5. Update all services

---

## Conclusion

**Current State:** Basic plan tracking system (migration 021) is fully implemented and working.

**Gap:** Two comprehensive design documents exist but have NO implementation.

**Decision Required:** Choose between:
- **Option 1:** Keep current simple system (0 effort)
- **Option 2:** Add batching to current system (10-12 days, moderate risk)
- **Option 3:** Complete file-first redesign (20-25 days, high risk)
- **Option 4:** Hybrid incremental approach (15-18 days, low risk)

**Recommendation:** Validate requirements first. If batching is needed, use Option 4 (hybrid). If not, use Option 1 (keep simple).

**Documentation Action:** Archive one of the two design docs, update the other with implementation status.

