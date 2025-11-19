# Prioritized Feature Roadmap

**Version:** 1.2.0
**Date:** 2025-11-18
**Last Updated:** 2025-11-18 18:35:21 UTC
**Purpose:** Consolidated prioritized features for the App Monitor project.

---

## 🎉 Recent Updates (2025-11-18)

**Documentation System Audit & Overhaul**
- Audited and reorganized the entire documentation system.
- Archived outdated and completed plans.
- This document is now the single source of truth for the project roadmap.

**Context-Aware Task Submission - Operational ✅**
- The minimal API for task submission is fully operational.
- All new tasks should be created using the minimal API.

**PR Tracking System - Operational ✅**
- The PR tracking system is stable and in production.

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

---

## Priority 0: Critical Stabilization (COMPLETE)

All stabilization tasks are complete.

### P0.1: Frontend Health ✅ **COMPLETE**
**Status:** ✅ **COMPLETE**

### P0.2: Backend Test Passing ✅ **COMPLETE**
**Status:** ✅ **COMPLETE**

### P0.3: Work-Target Registry ✅ **COMPLETE**
**Status:** ✅ **COMPLETE**

### P0.4: Prompt Engineering V3 Implementation ✅ **COMPLETE**
**Status:** ✅ **COMPLETE** (Implemented as context-aware minimal API)

### P0.5: Task Context Foundations ✅ **COMPLETE**
**Status:** ✅ **COMPLETE**

---

## Priority 1: POC Features

These features enable proof-of-concept for autonomous workflows.

### P1.1: Production Deployment Model (Three-Root Architecture)
**Owner:** DevOps + Platform Tooling
**Duration:** 2 weeks (Phases 1-4)
**Status:** Draft

**Description:**
Separate work-target development path from production deployment with artifact handoff mechanism.

### P1.2: Context-Aware Task Submission ✅ **COMPLETE**
**Status:** 🟢 **OPERATIONAL** - Backend 100% | Frontend awaiting UI component

### P1.3: Safety Mechanisms & Prompt Quality
**Owner:** Platform Tooling
**Duration:** 4 weeks (Phases 1-4)
**Status:** Planning

**Description:**
Prevent lost changes and task misinterpretation through auto-capture, commit verification, and prompt validation.

### P1.4: Task Pipeline Enhancement (Context Capture)
**Owner:** Platform Tooling
**Duration:** 3 weeks (Phases 1-3)
**Status:** Draft

**Description:**
Extend task system with diagnostic metadata persistence and dev-bot telemetry.

---

## Priority 2: Refactoring

### P2.1: Consolidate Interactive Session Services (16h)
**Status:** NOT STARTED
**Priority:** P2
**Effort:** 16 hours

**Issue:** 6 services with deep indirection chain.

**Target:** 3 focused services
- InteractiveSessionManager (CRUD, lifecycle)
- InteractiveSessionStreaming (I/O, logs)
- InteractiveSessionOrchestration (coordination)

### P2.2: Consolidate PR Services (12h)
**Status:** NOT STARTED
**Priority:** P2
**Effort:** 12 hours

**Issue:** 7 services duplicating PR fetching logic.

**Action:**
- Create PRServiceFacade to coordinate operations
- Implement request caching in githubPR.service.ts
- Add PR state change event emitter

### P2.3: Refactor Database Migrations (16h)
**Status:** NOT STARTED
**Priority:** P2
**Effort:** 16 hours

**Issue:** Ad-hoc migrations in TaskQueueService (293 lines).

**Action:**
- Create MigrationManager with versioned migrations
- Extract migrations to separate files
- Add rollback support

---

## Priority 3: Autonomy Features

These features enable fully autonomous workflows with self-healing.

### P3.1: PR-Based Workflow
**Owner:** Platform Tooling
**Duration:** 4 weeks (Phases 1-4)
**Status:** ✅ Phase 1-2 Complete, Phase 3-4 In Progress

**Description:**
Transform dev-bots from direct-push-to-staging to full PR-based workflow with CI monitoring, review integration, and auto-merge.

### P3.2: Interactive Session Tab (Optional Enhancement)
**Owner:** Platform Tooling
**Duration:** 2 weeks (Backend + Frontend)
**Status:** Draft (Needs sign-off)

**Description:**
Browser-based interactive terminal for operators to "drop into" dev-bot shell when automation falls short.

---

## Task Creation Guide

All new tasks should be created using the minimal API.

**API Usage:**
```bash
curl -X POST http://localhost:5000/api/dev-bots/tasks/minimal \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix login timeout issue",
    "taskType": "fix",
    "intent": "Increase session timeout from 5min to 30min"
  }'
```

The minimal API accepts the following fields:
- `title` (required): A short, descriptive title for the task.
- `taskType` (required): The type of task. Can be `implementation`, `testing`, `documentation`, or `refactor`.
- `intent` (required): A brief description of the task's goal.

The system will automatically detect the relevant files, risk level, and context profiles.

---

## Related Documents

- **Master Design Intent:** `docs/architecture/master-design-intent.md`

---

**Maintenance:** Update this document when priorities shift or features complete. Archive superseded plans to `docs/archive/` with dated filenames.
