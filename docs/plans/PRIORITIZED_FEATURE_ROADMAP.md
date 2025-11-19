# Prioritized Feature Roadmap

**Version:** 2.0.0
**Date:** 2025-11-18
**Purpose:** A lean, actionable roadmap focused exclusively on outstanding work.

---

## P0: Critical UX Integration

### P0.1: Implement Minimal Task API & UI
**Status:** BLOCKING
**Time Estimate:** 2-3 Weeks
**Description:** The backend context management system is complete, but the user-facing minimal API (3-field submission) and corresponding UI are missing. This is the highest impact feature and is blocking all further development.
**Tasks:**
-   Implement the `POST /api/v2/tasks` endpoint.
-   Create the `MinimalTaskForm.tsx` React component.
-   Migrate all automated task creators to the new minimal API.
-   Deprecate and remove the legacy `EnhancedTaskData` schema and related code.

---

## P1: POC Features

### P1.1: Production Deployment Model
**Status:** PLANNING
**Time Estimate:** 2 Weeks
**Description:** Implement the three-root architecture for production deployments.

### P1.2: Safety Mechanisms & Prompt Quality
**Status:** PLANNING
**Time Estimate:** 4 Weeks
**Description:** Implement auto-capture of uncommitted changes, commit verification, and prompt quality validation.

### P1.3: Task Pipeline Enhancement
**Status:** DRAFT
**Time Estimate:** 3 Weeks
**Description:** Extend the task system with diagnostic metadata persistence and dev-bot telemetry.

---

## P2: Autonomy Features

### P2.1: PR-Based Workflow (Self-Healing)
**Status:** IN PROGRESS
**Time Estimate:** 1-2 Weeks
**Description:** Implement the self-healing and auto-merge capabilities for the PR-based workflow.

### P2.2: Interactive Session Tab
**Status:** DRAFT
**Time Estimate:** 2 Weeks
**Description:** Implement the browser-based interactive terminal for operators.

---

## P3: Refactoring

### P3.1: Consolidate Interactive Session Services
**Status:** NOT STARTED
**Time Estimate:** 16 Hours
**Description:** Consolidate 6 interactive session services into 3 focused services.

### P3.2: Consolidate PR Services
**Status:** NOT STARTED
**Time Estimate:** 12 Hours
**Description:** Consolidate 7 PR services and implement request caching.

### P3.3: Refactor Database Migrations
**Status:** NOT STARTED
**Time Estimate:** 16 Hours
**Description:** Create a versioned migration system and extract ad-hoc migrations.
