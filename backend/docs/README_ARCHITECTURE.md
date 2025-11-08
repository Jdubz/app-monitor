# App-Monitor Architecture Documentation

Complete architectural analysis and design documentation for the app-monitor dev-bots system.

## Documents in This Collection

### 1. [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) - PRIMARY REFERENCE
**1,029 lines | Comprehensive Technical Analysis**

Complete breakdown of all recovery mechanisms and long-term vision:

**Sections**:
1. **Current Recovery Mechanisms** (7 major systems)
   - Two-Stage Failure Recovery System (343 lines)
   - SQLite Transaction-Based Task Queue
   - Circuit Breaker Pattern for Docker
   - Manual Retry Manager
   - Task Execution Flow
   - Task Completion Service
   - PR Workflow Orchestration

2. **Existing Patterns to Extend** (5 patterns)
   - Metadata-Driven State Management
   - Event-Driven Architecture
   - Workspace Isolation via Docker
   - Structured Logging System (20+ categories)
   - Database Migrations & Versioning

3. **Long-Term Vision & Roadmap**
   - Phase 1: System Stabilization (current)
   - Phase 2: Bot Execution Quality
   - Phase 3: Failure Recovery Optimization
   - Phase 4: Database & Performance
   - Phase 5: Testing Coverage

4. **Architectural Patterns for Extension**
   - Metadata-Driven Linking
   - State Snapshots for Rollback
   - Event-Driven Recovery Hooks
   - Atomic State Transitions via Transactions
   - Circuit Breaker for External Services

5. **Key Failure Points & Mitigations** (5 critical points)
   - Container Lifecycle Failures
   - Workspace State Corruption
   - Agent Unavailability
   - Output Capture Failure
   - Recovery Loop Prevention

6. **Monitoring & Observability Foundation**
   - Structured Logging
   - Metrics Collection
   - Health Check Points

7. **Configuration & Environment**
   - Critical Environment Variables
   - Configuration Files

8. **Recommendations for Extensions** (5 priority items)
   - Workspace State Snapshots (HIGH)
   - Recovery Budget System (MEDIUM)
   - Recovery Analytics (MEDIUM)
   - Task Dependency Graphs (LOWER)
   - Agent Health Monitoring (LOWER)

9. **Testing Strategy**
   - Current State & Coverage Gaps
   - Existing Test Files

10. **Performance Considerations**
    - Current Bottlenecks
    - Optimization Opportunities
    - Performance Targets

11. **Migration Paths**
    - From Manual to Automatic Recovery
    - From Single-Task to Multi-Task Workflows
    - From Container-Isolated to Persistent Workspaces

12. **Decision Points & Trade-Offs**
    - Well-Made Design Decisions
    - Current Limitations (Acceptable)
    - Trade-offs to Consider

**Use this document for**: Deep technical understanding, design decisions, future planning, extension points.

---

### 2. [ARCHITECTURE_ANALYSIS_SUMMARY.txt](./ARCHITECTURE_ANALYSIS_SUMMARY.txt) - QUICK REFERENCE
**15KB | Executive Summary**

Condensed version for quick orientation:

**Sections**:
- Executive Summary of Recovery Mechanisms
- Architectural Patterns (5 key patterns)
- Long-Term Vision by Phase
- Key Failure Points (5 critical points)
- Immediate Recommendations (5 priority items)
- Design Decisions (7 well-made, 3 limitations)
- What's Already Working (10 items)
- Critical Facts for Planning

**Use this document for**: Quick orientation, status briefings, identifying what's already implemented.

---

### 3. [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) - VISUAL REFERENCE
**Detailed diagrams and flowcharts**

Visual representations of key systems:

**Diagrams**:
1. **Complete Task Execution & Recovery Flow** (detailed lifecycle)
2. **Task Completion Flow** (success and failure paths)
3. **Metadata & State Management** (JSON structure)
4. **Circuit Breaker State Machine** (3 states)
5. **Database Transaction Flow** (atomicity guarantee)
6. **Logging Categories & Filtering** (20+ categories)
7. **Execution Hooks Pattern** (proposed extension)
8. **Recovery Budget System** (proposed implementation)
9. **System Health Dashboard** (metrics display)
10. **Failure Categories Decision Tree** (pattern matching)

**Use this document for**: Visual understanding, presentations, quick reference of state machines.

---

### 4. [FAILURE_RECOVERY_SYSTEM.md](./FAILURE_RECOVERY_SYSTEM.md) - EXISTING IMPLEMENTATION
**Implementation details of the current recovery system**

The simplified failure recovery system (343 lines, 73% reduction from previous).

**Topics**:
- Two-stage architecture (cleanup → followup)
- Safety guarantees
- Recovery flow diagram
- Recoverable error categories
- Configuration and environment variables
- Database schema
- Monitoring & logging
- Testing instructions
- Troubleshooting guide

**Use this document for**: Understanding current recovery implementation, deployment config, troubleshooting.

---

### 5. [CONSOLIDATED_ROADMAP.md](./CONSOLIDATED_ROADMAP.md) - PRODUCT PLANNING
**Strategic roadmap and priorities**

High-level planning document for the next phases.

**Topics**:
- Executive summary of current state
- Priority 1-5 breakdown
- Implementation timeline (week-by-week)
- Configuration & environment
- Monitoring & observability
- Risk mitigation
- Success criteria (short-term and long-term)

**Use this document for**: Product planning, stakeholder communication, sprint planning.

---

### 6. [BOT_EXECUTION_IMPROVEMENTS.md](./BOT_EXECUTION_IMPROVEMENTS.md) - QUALITY FOCUS
**Analysis and improvements for bot task execution quality**

Focus on improving success rates from 60% to 90%+.

**Topics**:
- Problem statement (analysis of failures)
- Current state assessment (what's working, what's broken)
- Proposed solution (3-phase approach)
- Implementation plan (validation → prompt enhancement → testing)
- Success metrics
- Risks & mitigation

**Use this document for**: Understanding quality issues, planning improvements, task validation.

---

## Quick Navigation Guide

### "I need to understand..."

**The current architecture:**
→ Start with [ARCHITECTURE_ANALYSIS_SUMMARY.txt](./ARCHITECTURE_ANALYSIS_SUMMARY.txt) (5 min read)
→ Then [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) (visual reference)

**How recovery works:**
→ [FAILURE_RECOVERY_SYSTEM.md](./FAILURE_RECOVERY_SYSTEM.md) (implementation details)
→ [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) section 1 (deep dive)

**What needs to be built next:**
→ [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) section 8 (recommendations)
→ [CONSOLIDATED_ROADMAP.md](./CONSOLIDATED_ROADMAP.md) (priority phases)

**How to extend the system:**
→ [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) section 4 (patterns)
→ [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) section 8 (specific recommendations)

**Why certain decisions were made:**
→ [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) section 12 (decision points)
→ [FAILURE_RECOVERY_SYSTEM.md](./FAILURE_RECOVERY_SYSTEM.md) (design rationale)

**What's the long-term vision:**
→ [CONSOLIDATED_ROADMAP.md](./CONSOLIDATED_ROADMAP.md) (phased approach)
→ [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) section 3 (vision detail)

**Why tasks are failing:**
→ [BOT_EXECUTION_IMPROVEMENTS.md](./BOT_EXECUTION_IMPROVEMENTS.md) (quality analysis)
→ [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) section 5 (failure points)

---

## Key Findings Summary

### What's Working Well ✅

1. **Event-Driven Architecture** (no polling)
2. **Transactional Task Queue** (atomic operations)
3. **Two-Stage Recovery System** (simple, proven)
4. **Circular Prevention** (no infinite loops)
5. **Failure Pattern Detection** (categorized, regex-based)
6. **Structured Logging** (20+ categories)
7. **Circuit Breaker** (prevents cascading failures)
8. **Metadata Linking** (audit trails, task graphs)
9. **Ephemeral Containers** (automatic cleanup)
10. **Manual Intervention** (respects long-running tasks)

### What Needs Work ⚠️

1. **Recovery Analytics** (no metrics yet)
2. **Recovery Budget** (no attempt limits)
3. **Workspace Rollback** (no snapshots)
4. **Task Dependencies** (no parallel execution)
5. **Agent Failover** (no fallback logic)

### Immediate Priorities 🎯

1. Implement workspace state snapshots
2. Add recovery budget tracking (max 3 attempts)
3. Collect recovery analytics (success rates by error type)
4. Improve task quality validation (files array, acceptance criteria)
5. Increase test coverage (20% → 80%+)

---

## Recommended Reading Order

1. **Start**: [ARCHITECTURE_ANALYSIS_SUMMARY.txt](./ARCHITECTURE_ANALYSIS_SUMMARY.txt) (15 min)
2. **Understand**: [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) (20 min)
3. **Deep Dive**: [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) (60 min)
4. **Implement**: [CONSOLIDATED_ROADMAP.md](./CONSOLIDATED_ROADMAP.md) (15 min)
5. **Current State**: [FAILURE_RECOVERY_SYSTEM.md](./FAILURE_RECOVERY_SYSTEM.md) (20 min)
6. **Quality Focus**: [BOT_EXECUTION_IMPROVEMENTS.md](./BOT_EXECUTION_IMPROVEMENTS.md) (20 min)

**Total Reading Time**: ~2.5 hours for comprehensive understanding

---

## For Different Roles

### Product Manager
1. [CONSOLIDATED_ROADMAP.md](./CONSOLIDATED_ROADMAP.md)
2. [BOT_EXECUTION_IMPROVEMENTS.md](./BOT_EXECUTION_IMPROVEMENTS.md)
3. [ARCHITECTURE_ANALYSIS_SUMMARY.txt](./ARCHITECTURE_ANALYSIS_SUMMARY.txt)

### Engineering Lead / Architect
1. [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) (complete)
2. [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md)
3. [FAILURE_RECOVERY_SYSTEM.md](./FAILURE_RECOVERY_SYSTEM.md)

### New Team Member
1. [ARCHITECTURE_ANALYSIS_SUMMARY.txt](./ARCHITECTURE_ANALYSIS_SUMMARY.txt)
2. [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md)
3. [FAILURE_RECOVERY_SYSTEM.md](./FAILURE_RECOVERY_SYSTEM.md)
4. Source code files (cross-reference with ARCHITECTURE_ANALYSIS.md)

### DevOps / Infrastructure
1. [CONSOLIDATED_ROADMAP.md](./CONSOLIDATED_ROADMAP.md) (Configuration section)
2. [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) (Sections 6-7)
3. [FAILURE_RECOVERY_SYSTEM.md](./FAILURE_RECOVERY_SYSTEM.md) (Deployment section)

### QA / Tester
1. [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) (Section 9)
2. [FAILURE_RECOVERY_SYSTEM.md](./FAILURE_RECOVERY_SYSTEM.md) (Testing section)
3. [BOT_EXECUTION_IMPROVEMENTS.md](./BOT_EXECUTION_IMPROVEMENTS.md)

---

## Key Implementation Files Referenced

### Core Services
- `src/services/failureRecovery.ts` - Two-stage recovery (343 lines)
- `src/services/taskQueue.sqlite.ts` - Task queue with ACID transactions
- `src/services/taskExecution.service.ts` - Task execution orchestration
- `src/services/taskCompletion.service.ts` - Completion handler
- `src/services/prWorkflowOrchestrator.service.ts` - PR workflow

### Supporting Systems
- `src/services/taskFailureGuards.ts` - Failure pattern detection (13 patterns)
- `src/services/taskQueueWorker.ts` - Background polling worker
- `src/services/retryManager.ts` - Manual retry management
- `src/utils/circuitBreaker.ts` - Circuit breaker implementation
- `src/utils/logger.ts` - Structured logging (20+ categories)

### Configuration & Utilities
- `src/config.ts` - Central configuration
- `src/services/agentPersonalities.ts` - Agent management
- `src/services/taskPromptTemplates.ts` - Prompt generation

### Database & Migrations
- `migrations/001_initial_schema.sql`
- `migrations/002_tasks_table.sql`
- `migrations/004_task_context.sql`
- `migrations/005_*.sql` (pending - missing Task interface fields)

---

## Standards & Patterns

### Always Use
- ✅ Metadata field for task linking (not new database tables)
- ✅ Event handlers for triggering actions (not polling)
- ✅ SQLite transactions for consistency (not ad-hoc locking)
- ✅ Structured logging with categories (not console.log)
- ✅ Error pattern detection (not generic error handling)

### Avoid
- ❌ New database tables for feature flags or state
- ❌ Polling loops (use events instead)
- ❌ Unprotected shared state (use transactions)
- ❌ Unstructured logging
- ❌ Auto-timeouts for tasks (use manual intervention)

---

## Document Maintenance

**Last Updated**: 2025-11-08
**Status**: Active (living document)
**Review Cycle**: Weekly (during active development)
**Next Review**: After Phase 1 completion (2025-11-15)

**Contributors**: Backend Team, Architecture Review Board
**Contact**: See project README

---

## Questions?

Refer to the specific document sections indicated in "Quick Navigation Guide" above.

For implementation questions: See section references in ARCHITECTURE_ANALYSIS.md
For design questions: See section 12 (Decision Points) in ARCHITECTURE_ANALYSIS.md
For priority questions: See CONSOLIDATED_ROADMAP.md phases
For recovery details: See FAILURE_RECOVERY_SYSTEM.md

---

