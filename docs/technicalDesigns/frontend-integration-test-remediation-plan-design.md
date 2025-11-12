# FRONTEND_INTEGRATION_TEST_REMEDIATION_PLAN Technical Design

**Source Plan:** docs/plans/FRONTEND_INTEGRATION_TEST_REMEDIATION_PLAN.md
**Status:** Not started
**Outstanding Focus:** Implement helpers, lint rule, CI watchdog per plan.

## Objectives
- Implement helpers, lint rule, CI watchdog per plan.

## Plan Snapshot

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


## Requirements
- Refer to the source plan for full requirement breakdown; key deliverables must satisfy the outstanding focus above.

## Architecture Considerations
- Define system boundaries, data flows, and integrations described in the plan.
- Ensure compatibility with the updated master design intent.

## Implementation Steps
1. Review the source plan sections relevant to this feature.
2. Break work into milestones (schema, services, UI, telemetry, etc.).
3. Update dev-monitor visibility and automation hooks as needed.
4. Add automated tests per subsystem.

## Open Questions
- Identify unresolved decisions noted in the plan.
- Capture new questions discovered during implementation.

## Next Actions
- Schedule design review with architecture owners.
- Flesh out detailed sub-designs (schema, API, UI) as required.
- Create execution tickets once this design is ratified.
