# Dev-Monitor Testing Issues Created

**Created:** 2025-10-21  
**Total Issues:** 7  
**Parent Issue:** [#36](https://github.com/Jdubz/job-finder-app-manager/issues/36)

## Issue Breakdown

### Backend Testing (Week 1)

#### [#37](https://github.com/Jdubz/job-finder-app-manager/issues/37) - DEV-MONITOR-TEST-2: Backend Infrastructure Setup

- **Priority:** P0 (Critical)
- **Effort:** 1 day (3 points)
- **Coverage Goal:** 10%
- **Dependencies:** None - **START HERE**
- **Focus:** Jest setup, PortManager tests
- **Deliverables:**
  - Jest configuration
  - Test helpers and mocks
  - PortManager test suite (80% coverage)
  - Initial test infrastructure

#### [#38](https://github.com/Jdubz/job-finder-app-manager/issues/38) - DEV-MONITOR-TEST-3: ProcessManager Tests

- **Priority:** P0 (Critical)
- **Effort:** 2 days (5 points)
- **Coverage Goal:** 40%
- **Depends On:** #37
- **Focus:** Service lifecycle, port conflicts, Docker
- **Deliverables:**
  - Comprehensive ProcessManager tests
  - Port conflict scenario tests
  - Docker container management tests
  - Error recovery tests
  - 60% ProcessManager coverage

#### [#39](https://github.com/Jdubz/job-finder-app-manager/issues/39) - DEV-MONITOR-TEST-4: API & Config Tests

- **Priority:** P1 (High)
- **Effort:** 1 day (3 points)
- **Coverage Goal:** 50%
- **Depends On:** #37
- **Focus:** API routes, config validation
- **Deliverables:**
  - All API endpoint tests
  - Service config validation tests
  - Integration tests for service lifecycle
  - 50% overall backend coverage ✅

### Frontend Testing (Week 2)

#### [#40](https://github.com/Jdubz/job-finder-app-manager/issues/40) - DEV-MONITOR-TEST-5: Frontend Infrastructure Setup

- **Priority:** P1 (High)
- **Effort:** 1 day (3 points)
- **Coverage Goal:** 15%
- **Dependencies:** None (independent of backend)
- **Focus:** Vitest setup, service hooks
- **Deliverables:**
  - Vitest configuration
  - React Testing Library setup
  - Test utilities and mocks
  - useServices hook tests
  - StatusBadge tests

#### [#41](https://github.com/Jdubz/job-finder-app-manager/issues/41) - DEV-MONITOR-TEST-6: Service Component Tests

- **Priority:** P1 (High)
- **Effort:** 2 days (5 points)
- **Coverage Goal:** 40%
- **Depends On:** #40
- **Focus:** Service components, log components
- **Deliverables:**
  - ServiceCard tests (60% coverage)
  - ServiceGrid tests
  - LogsViewer tests (60% coverage)
  - All log component tests

#### [#42](https://github.com/Jdubz/job-finder-app-manager/issues/42) - DEV-MONITOR-TEST-7: Integration & Panel Tests

- **Priority:** P1 (High)
- **Effort:** 2 days (5 points)
- **Coverage Goal:** 50%+
- **Depends On:** #40, #41
- **Focus:** Panel management, integration
- **Deliverables:**
  - Panel management tests
  - Remaining hook tests
  - App integration tests
  - API client tests
  - 50% overall frontend coverage ✅

### CI/CD

#### [#43](https://github.com/Jdubz/job-finder-app-manager/issues/43) - DEV-MONITOR-TEST-8: CI Integration

- **Priority:** P2 (Medium)
- **Effort:** 0.5 days (2 points)
- **Dependencies:** #37, #40
- **Focus:** GitHub Actions, coverage enforcement
- **Deliverables:**
  - GitHub Actions workflow
  - Pre-commit hooks
  - Coverage enforcement
  - PR coverage comments

## Implementation Timeline

```
Week 1: Backend Testing
┌─────────────────────────────────────────┐
│ Day 1  │ Day 2-3   │ Day 4    │ Day 5  │
│  #37   │   #38     │   #39    │ Buffer │
│ Setup  │ ProcMgr   │ API/Cfg  │        │
│ (10%)  │  (40%)    │  (50%)   │        │
└─────────────────────────────────────────┘

Week 2: Frontend Testing
┌─────────────────────────────────────────┐
│ Day 6  │ Day 7-8   │ Day 9-10  │ Bonus │
│  #40   │   #41     │   #42     │  #43  │
│ Setup  │Components │Integration│  CI   │
│ (15%)  │  (40%)    │  (50%+)   │       │
└─────────────────────────────────────────┘
```

## Dependency Graph

```
        #37 (Backend Setup)
         ├── #38 (ProcessManager)
         └── #39 (API & Config)

        #40 (Frontend Setup)
         ├── #41 (Components)
         └── #42 (Integration)

        #37 + #40
         └── #43 (CI Integration)
```

## Quick Reference

| Issue | Title          | Priority | Effort   | Coverage | Start After |
| ----- | -------------- | -------- | -------- | -------- | ----------- |
| #37   | Backend Setup  | P0       | 1 day    | → 10%    | None        |
| #38   | ProcessManager | P0       | 2 days   | → 40%    | #37         |
| #39   | API & Config   | P1       | 1 day    | → 50%    | #37         |
| #40   | Frontend Setup | P1       | 1 day    | → 15%    | None        |
| #41   | Components     | P1       | 2 days   | → 40%    | #40         |
| #42   | Integration    | P1       | 2 days   | → 50%    | #40, #41    |
| #43   | CI Integration | P2       | 0.5 days | N/A      | #37, #40    |

**Total Effort:** 10 days (26 points)

## Implementation Strategy

### Parallel Work Possible

**Week 1:** After completing #37 (Day 1), #38 and #39 can run in parallel if multiple developers available.

**Week 2:** After completing #40 (Day 6), work can proceed on #41 while #42 prep happens.

### Critical Path

```
#37 (1d) → #38 (2d) → #39 (1d) = 4 days backend
#40 (1d) → #41 (2d) → #42 (2d) = 5 days frontend
```

**Minimum Time:** 5 days with parallel work  
**Sequential Time:** 10 days

## Coverage Milestones

- **Day 1:** 10% backend coverage (PortManager complete)
- **Day 3:** 40% backend coverage (ProcessManager complete)
- **Day 4:** 50% backend coverage ✅ (API & Config complete)
- **Day 6:** 15% frontend coverage (Hooks + basic components)
- **Day 8:** 40% frontend coverage (All components)
- **Day 10:** 50% frontend coverage ✅ (Integration complete)

## Success Criteria

- ✅ Backend coverage ≥50%
- ✅ Frontend coverage ≥50%
- ✅ All critical service start scenarios tested
- ✅ Port conflict resolution fully tested
- ✅ Docker management tested
- ✅ CI enforcing coverage thresholds

## Getting Started

**For Developer Starting This Work:**

1. Read [TESTING_QUICKSTART.md](./TESTING_QUICKSTART.md)
2. Start with issue #37
3. Follow Day 1 instructions exactly
4. Commit infrastructure before writing first tests
5. Move to #38 after #37 is complete
6. Update parent issue #36 with progress

## Files Reference

All issues have markdown source in:

- `issues/dev-monitor-test-2-backend-setup.md`
- `issues/dev-monitor-test-3-processmanager-tests.md`
- `issues/dev-monitor-test-4-backend-api-config.md`
- `issues/dev-monitor-test-5-frontend-setup.md`
- `issues/dev-monitor-test-6-frontend-components.md`
- `issues/dev-monitor-test-7-frontend-integration.md`
- `issues/dev-monitor-test-8-ci-integration.md`

## Commands

```bash
# View all dev-monitor testing issues
gh issue list --label "task" --search "DEV-MONITOR-TEST"

# View specific issue
gh issue view 37

# Start working on an issue
gh issue develop 37 --checkout

# Update progress
gh issue comment 37 --body "Day 1 complete: PortManager tests at 82% coverage"
```

---

**Created:** 2025-10-21  
**Total Issues:** 7 (plus parent #36)  
**Estimated Completion:** 2025-11-04 (2 weeks)  
**Status:** Ready to start with #37
