# Frontend Integration Test Remediation Plan
**Date:** 2025-11-12  
**Primary Owner:** Frontend Platform  
**Stakeholders:** QA Automation, Release Engineering, Dev-Bots Team

## Goals
- Eliminate integration-test hangs caused by unsafe `waitFor` usage and missing awaits.
- Ensure mocked sockets, timers, and API fixtures reset state between tests.
- Prevent `undefined` data contracts from reaching render paths by enforcing stricter fixtures.
- Provide guardrails (lint rule + CI watchdog) so new tests adopt the hardened helpers.

## Success Metrics
1. **Stability:** 0 hanging Vitest jobs across 3 consecutive nightly CI runs.
2. **Coverage:** 100% of integration suites import the shared `renderWithEnv` + `waitForSafe` helpers.
3. **Data Fidelity:** Cloud environment fixture generator rejects unknown environments and surfaces explicit errors.
4. **Observability:** Alert fires within 5 minutes if Vitest integration jobs exceed 12 minutes runtime.

## Workstreams & Tasks
### 1. Deterministic Async Orchestration
- [ ] Implement `waitForSafe` helper (timeout + error message) in `frontend/test-utils`.
- [ ] Refactor `App.integration.test.tsx` + `DevBots.integration.test.tsx` to use helper and explicit awaited navigation.
- [ ] Add ESLint rule or lint-staged check that flags raw `waitFor` usage.

### 2. Mock Lifecycle Hygiene
- [ ] Convert socket mock factory to return `{ socket, cleanup }` and ensure `cleanup` is invoked in every suite.
- [ ] Reset global mock maps (events, timers) inside `afterEach` within `vitest.setup.ts`.
- [ ] Add leak-detection test that throws if listener count grows across suites.

### 3. Fixture/Data Contract Hardening
- [ ] Update `mockGenerators.environmentsResponse()` to throw on unknown envs instead of returning `{ services: [] }`.
- [ ] Add explicit error boundary coverage around CloudLogs error tests.
- [ ] Document fixture contract in `/frontend/docs/testing.md`.

### 4. Guardrails & Observability
- [ ] Configure `vitest.config.ts` with `testTimeout`/`hookTimeout` = 10s and `teardownTimeout` = 5s.
- [ ] Add CI watchdog script that fails the pipeline if integration tests exceed 12 minutes.
- [ ] Emit test metrics to existing monitoring stack (count of waits > 5s, leaked listeners, etc.).

## Timeline (Aggressive)
| Date | Milestone |
|------|-----------|
| Nov 13 | Helpers + lint rule merged
| Nov 14 | Mock lifecycle refactor merged
| Nov 15 | Fixture hardening + docs merged
| Nov 16 | CI watchdog + monitoring live |

## Dependencies
- Needs coordination with Dev-Bots team for CI job updates.
- Requires QA sign-off on updated fixtures.
- Monitoring hooks depend on existing telemetry exporter in `frontend/scripts/report-tests.ts`.

## Risks & Mitigations
- **Test churn**: Refactors could break snapshots → mitigate by pairing with component owners.
- **CI noise**: Watchdog may produce false positives initially → start in warn-only mode for 1 day.
- **Developer adoption**: Enforcing helper usage could block PRs → provide codemod snippets in docs.

## Verification & Exit Criteria
1. All integration suites reference the shared helpers (lint gate passes).
2. CI history shows three green nightly integration runs with durations < 12 minutes.
3. No new occurrences of "Cannot read properties of undefined (reading find)" in integration logs for 7 days.
4. Investigation `docs/investigations/INTEGRATION_TEST_INVESTIGATION.md` updated with closure note referencing completed work.
