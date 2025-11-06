# APP-MONITOR-TEST-1: Implement Comprehensive Test Coverage

**Priority:** P1 (High)  
**Type:** Testing Infrastructure  
**Effort:** 10 days  
**Owner:** TBD (Recommend Worker B)  
**Repository:** job-finder-app-manager (app-monitor/)

## Problem Statement

The app-monitor has **0% test coverage** on both frontend and backend, leading to frequent breakages, especially in service start scripts. Port conflicts, Docker container management, and process lifecycle issues cause repeated failures that could be caught by proper testing.

## Goal

Achieve **50%+ test coverage** on both app-monitor frontend and backend, with heavy focus on the critical service management code that keeps breaking.

## Scope

### Backend Testing (50% coverage minimum)

- ✅ **ProcessManager** (60% coverage) - Service lifecycle, port conflicts, Docker
- ✅ **PortManager** (80% coverage) - Port detection, process killing
- ✅ **Config Validation** (70% coverage) - Service config validation
- ✅ **API Routes** (50% coverage) - REST endpoints
- ✅ **Log Streaming** (40% coverage) - LogStreamer, LogWatcher

### Frontend Testing (50% coverage minimum)

- ✅ **Service Hooks** (70% coverage) - useServices, usePortStatus
- ✅ **Service Components** (60% coverage) - ServiceCard, ServiceGrid
- ✅ **Log Components** (60% coverage) - LogsViewer, LogLine
- ✅ **Panel Management** (40% coverage) - PanelContainer, panels
- ✅ **API Client** (70% coverage) - API service wrapper

## Acceptance Criteria

### Must Have

- [ ] Backend test coverage ≥50%
- [ ] Frontend test coverage ≥50%
- [ ] ProcessManager.startService() has comprehensive tests
- [ ] Port conflict scenarios fully tested
- [ ] Docker container management tested
- [ ] All tests pass in CI
- [ ] Coverage reports generated and committed

### Should Have

- [ ] ProcessManager coverage ≥60%
- [ ] PortManager coverage ≥80%
- [ ] Integration tests for service lifecycle
- [ ] Error recovery paths tested
- [ ] Socket.IO event handling tested

### Nice to Have

- [ ] E2E tests for critical workflows
- [ ] Performance tests for log streaming
- [ ] Load tests for concurrent operations
- [ ] Visual regression tests for UI

## Implementation Plan

See detailed plan in: [app-monitor/TESTING_PLAN.md](../app-monitor/TESTING_PLAN.md)

### Week 1: Backend (Days 1-5)

1. **Day 1:** Setup + PortManager tests (10% coverage)
2. **Day 2:** ProcessManager basic lifecycle (25% coverage)
3. **Day 3:** ProcessManager edge cases (40% coverage)
4. **Day 4:** Config & API routes (50% coverage)
5. **Day 5:** Log streaming + refinement (50%+ coverage ✅)

### Week 2: Frontend (Days 6-10)

1. **Day 6:** Setup + Service hooks (15% coverage)
2. **Day 7:** Service components (30% coverage)
3. **Day 8:** Log viewer components (40% coverage)
4. **Day 9:** Panel management + hooks (48% coverage)
5. **Day 10:** Integration + refinement (50%+ coverage ✅)

## Technical Details

### Backend Stack

- **Framework:** Jest
- **Utilities:** Supertest for API testing
- **Mocking:** Built-in Jest mocks
- **Coverage:** Istanbul via Jest

### Frontend Stack

- **Framework:** Vitest
- **Utilities:** React Testing Library
- **Mocking:** Vi mocks + MSW for API
- **Coverage:** v8 via Vitest

### Test Files Structure

```
app-monitor/
├── backend/
│   ├── src/
│   │   ├── __tests__/
│   │   │   ├── setup.ts
│   │   │   ├── config.test.ts
│   │   │   ├── fixtures/
│   │   │   ├── helpers/
│   │   │   └── integration/
│   │   ├── services/__tests__/
│   │   ├── routes/__tests__/
│   │   └── utils/__tests__/
│   └── jest.config.js
├── frontend/
│   ├── src/
│   │   ├── __tests__/
│   │   │   ├── setup.ts
│   │   │   ├── App.test.tsx
│   │   │   ├── utils/
│   │   │   └── integration/
│   │   ├── components/__tests__/
│   │   ├── hooks/__tests__/
│   │   └── services/__tests__/
│   └── vitest.config.ts
└── TESTING_PLAN.md
```

## Critical Test Scenarios

The following scenarios MUST be tested (these are where it breaks most):

1. ✅ Port conflict on start → kills blocking process, starts successfully
2. ✅ Docker container already running → attaches instead of starting new
3. ✅ Service crashes after start → status updates to 'error'
4. ✅ Graceful stop timeout → force kills unresponsive process
5. ✅ Rapid start/stop cycles → no race conditions
6. ✅ Invalid configuration → fails fast with clear error
7. ✅ Missing working directory → rejects before attempting start
8. ✅ Multiple port conflicts → resolves all before starting

## Dependencies

- None (self-contained testing infrastructure)

## Risks

1. **Test Flakiness:** Port-based tests can be flaky
   - _Mitigation:_ Use random ports, proper cleanup, retries
2. **Docker Dependency:** Tests requiring Docker may be unstable in CI
   - _Mitigation:_ Make Docker tests optional, use mocks in CI
3. **Time Estimate:** 10 days might be ambitious
   - _Mitigation:_ Focus on P0/P1 modules first, P2/P3 if time allows

## Success Criteria

### Week 1 Success

- ✅ Backend coverage ≥50%
- ✅ ProcessManager and PortManager fully tested
- ✅ All service start/stop scenarios passing
- ✅ CI pipeline includes backend tests

### Week 2 Success

- ✅ Frontend coverage ≥50%
- ✅ Service management UI fully tested
- ✅ Log viewer components tested
- ✅ CI pipeline includes frontend tests

### Overall Success

- ✅ Combined coverage ≥50% (both frontend and backend)
- ✅ Zero test failures in CI
- ✅ Service start reliability improved to 95%+
- ✅ Documentation updated with testing guidelines

## Deliverables

1. **Test Infrastructure**
   - Jest config for backend
   - Vitest config for frontend
   - Test helpers and utilities
   - Mock factories

2. **Test Suite**
   - ~50 backend unit tests
   - ~40 frontend component tests
   - ~10 integration tests
   - Coverage reports

3. **Documentation**
   - Testing guide for contributors
   - How to run tests locally
   - How to add new tests
   - Coverage report interpretation

4. **CI Integration**
   - GitHub Actions workflow
   - Pre-commit hooks
   - Coverage reporting
   - Test failure notifications

## Follow-up Tasks

After achieving 50% coverage:

- [ ] Increase to 70% coverage on critical modules
- [ ] Add E2E tests for full workflows
- [ ] Add performance tests for log streaming
- [ ] Add visual regression tests
- [ ] Implement test-driven development for new features

## References

- **Testing Plan:** [app-monitor/TESTING_PLAN.md](../app-monitor/TESTING_PLAN.md)
- **Branch Protocols:** [docs/processes/BRANCH_PROTOCOLS.md](../docs/processes/BRANCH_PROTOCOLS.md)
- **Contributing Guide:** [CONTRIBUTING.md](../CONTRIBUTING.md)

---

**Labels:** `app-monitor`, `testing`, `infrastructure`, `priority-p1`, `worker-b`  
**Estimated Points:** 13 (2 weeks)  
**Target Completion:** 2025-11-04
