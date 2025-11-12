# Frontend Integration Test Remediation Design

## Document Metadata

| Field | Value |
|-------|-------|
| **Status** | 🔴 Not Started |
| **Priority** | P2 |
| **Dependencies** | None |
| **Last Updated** | November 12, 2025 |
| **Implementation Progress** | 0% (design ready, awaiting implementation) |

## Quick Reference

**What**: Stabilize frontend integration tests through improved helpers, lint enforcement, CI watchdogs, and dev-monitor integration for test health visibility.

**Why**: Flaky tests, lint gaps, and lack of visibility undermine confidence in frontend changes. Stable tests enable faster iteration and catch regressions early.

**Current Status**: Tests exist but are unreliable. Need helper refactoring, CI improvements, and monitoring integration.

## Source Plan
- `docs/plans/FRONTEND_INTEGRATION_TEST_REMEDIATION_PLAN.md`

## Table of Contents

1. [Objectives](#objectives)
2. [Requirements](#requirements)
3. [Architecture Considerations](#architecture-considerations)
4. [Implementation Steps](#implementation-steps)
5. [Success Criteria](#success-criteria)
6. [Testing Strategy](#testing-strategy)
7. [Related Files](#related-files)

## Objectives
1. Stabilize frontend integration tests by addressing flaky helpers, lint gaps, and missing CI watchdogs described in the plan.
2. Provide deterministic local/dev-monitor workflows for running the integration suite.
3. Surface test health in dev-monitor so regressions are visible alongside backend automation health.

## Requirements
- Implement improved test helpers (mock servers, socket harnesses) as outlined in the plan.
- Add lint/format rules specific to integration test directories.
- Introduce CI watchdog scripts to detect hung Playwright/Cypress runs and emit diagnostics.
- Expose integration test status in dev-monitor (simple pass/fail + last run metadata).

## Architecture Considerations
1. **Test Harness:** Decide on standard tooling (Playwright vs Cypress) and refactor existing suites accordingly.
2. **CI Integration:** Update pipelines to use the new helpers, enforce lint rules, and publish artifacts/logs for dev-monitor consumption.
3. **Diagnostics:** Capture screenshots, console logs, and network traces, feeding them into the context/artifact pipeline when tests fail.

## Implementation Steps
1. Audit current integration tests, document flakes, and finalize helper API.
2. Implement/refactor helpers and lint rules; update existing tests.
3. Add CI watchdog plus artifact uploads.
4. Hook test results into dev-monitor dashboards.

## Open Questions
- Which browsers/environments must be covered in v1 (Chromium only vs multi-browser)?
- How should we retain test artifacts (per build vs rolling window)?
- Do integration tests need to run per PR or nightly?

## Success Criteria

### Phase 1: Audit & Design (⏳ Pending)
- ⏳ Current integration tests audited
- ⏳ Flake patterns documented
- ⏳ Helper API designed
- ⏳ Tooling decision made (Playwright vs Cypress)
- ⏳ Lint rules defined

### Phase 2: Test Helpers & Refactoring (⏳ Pending)
- ⏳ Mock server helpers implemented
- ⏳ Websocket harness created
- ⏳ Common test utilities refactored
- ⏳ Existing tests updated to use new helpers
- ⏳ Flake rate reduced by 80%+

### Phase 3: CI & Watchdogs (⏳ Pending)
- ⏳ CI pipeline updated with new helpers
- ⏳ Watchdog script detects hung tests
- ⏳ Timeout handling improved
- ⏳ Artifact capture (screenshots, logs, traces)
- ⏳ Artifacts uploaded to storage

### Phase 4: Lint & Code Quality (⏳ Pending)
- ⏳ Integration test lint rules added
- ⏳ Format rules enforced
- ⏳ Pre-commit hooks configured
- ⏳ CI enforces lint checks

### Phase 5: Dev-Monitor Integration (⏳ Pending)
- ⏳ Test results API endpoint
- ⏳ Dev-monitor dashboard shows test health
- ⏳ Pass/fail metrics displayed
- ⏳ Last run metadata visible
- ⏳ Artifact links in dev-monitor

### Acceptance Criteria
1. **Flake Reduction**: < 5% test flake rate (down from current ~40%)
2. **CI Reliability**: 0 hung test runs in 30 days
3. **Coverage**: All critical user flows covered by integration tests
4. **Visibility**: Test status visible in dev-monitor within 5 minutes of run
5. **Artifact Retention**: Screenshots/logs available for 30 days
6. **Performance**: Integration suite completes in < 10 minutes

## Testing Strategy

### Unit Tests
- **Test Helpers**
  - Mock server behavior
  - Socket harness functionality
  - Utility function correctness

- **Watchdog Script**
  - Hung process detection
  - Timeout handling
  - Diagnostic capture

### Integration Tests (Meta)
- Test helper integration
  - Helpers work in real test scenarios
  - Mock servers respond correctly
  - Socket harnesses maintain state

- CI pipeline
  - Artifact upload successful
  - Watchdog triggers on timeout
  - Lint enforcement works

### System Tests
- Full integration suite
  - Run against real dev-monitor instance
  - All critical flows pass
  - Artifacts captured on failure

- Performance validation
  - Suite completes in < 10 minutes
  - Resource usage reasonable
  - Parallel execution stable

### Test Coverage Targets
- Test helpers: 90%+ coverage
- Watchdog script: 85%+ coverage
- Integration suite: Cover all critical user flows

### Performance Benchmarks
- Full integration suite: < 10 minutes
- Individual test: < 30 seconds average
- Artifact upload: < 5 seconds per test
- Dev-monitor update: < 30 seconds after completion

## Related Files

### Implementation Files (Existing)
- `frontend/tests/integration/**/*` - Existing integration tests (need refactoring)
- `frontend/package.json` - Test scripts and dependencies

### Implementation Files (To Be Created)
- `frontend/tests/helpers/mockServer.ts` - Mock API server utilities
- `frontend/tests/helpers/socketHarness.ts` - Websocket test harness
- `frontend/tests/helpers/testUtils.ts` - Common test utilities
- `scripts/ci/test-watchdog.sh` - CI watchdog script
- `scripts/ci/upload-test-artifacts.sh` - Artifact upload script
- `backend/src/routes/test-results.routes.ts` - Test results API

### Test Files
- All files in `frontend/tests/integration/` (to be refactored)
- `frontend/tests/helpers/__tests__/mockServer.test.ts` (to be created)
- `frontend/tests/helpers/__tests__/socketHarness.test.ts` (to be created)

### Configuration Files
- `frontend/.eslintrc.integration.js` (to be created) - Integration test lint rules
- `frontend/playwright.config.ts` or `cypress.config.ts` - Test framework config
- `.github/workflows/integration-tests.yml` (to be created/updated) - CI config

### Frontend Files (Dev-Monitor)
- `frontend/src/components/TestDashboard.tsx` (to be created) - Test health display
- `frontend/src/components/TestArtifactViewer.tsx` (to be created) - Artifact viewer

### Documentation Dependencies
- `docs/plans/FRONTEND_INTEGRATION_TEST_REMEDIATION_PLAN.md` - Source plan
- `docs/guides/e2e-testing-guide.md` - E2E testing guide (may need updates)

### Related Designs
- `docs/technicalDesigns/dev-bot-foundational-upgrades.md` - Artifact management integration

## Next Actions
- Review with frontend/platform owners.
- Create execution tickets for helpers, CI, linting, and dev-monitor integration.
- Choose between Playwright and Cypress (recommend Playwright for better TypeScript support).

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2025-11-12 | Claude Code | Added metadata, success criteria, testing strategy, related files |
| 1.0 | 2025-11-12 | Original Author | Initial design document |
