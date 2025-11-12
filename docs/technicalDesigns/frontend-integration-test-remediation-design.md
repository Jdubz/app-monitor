# Frontend Integration Test Remediation Design

Source Plan: docs/plans/FRONTEND_INTEGRATION_TEST_REMEDIATION_PLAN.md
Status: Not started.

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

## Next Actions
- Review with frontend/platform owners.
- Create execution tickets for helpers, CI, linting, and dev-monitor integration.
