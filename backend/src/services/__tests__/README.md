# Service-Level Integration Tests

## Overview

These tests implement the **service-level integration testing** approach designed in `/docs/E2E_TEST_SUITE_DESIGN.md`.

They test the multi-phase task execution system by:
- Calling service methods directly (no HTTP)
- Mocking ONLY expensive operations (container artifacts, GitHub API)
- Testing ALL backend logic (validators, orchestrator, recovery, database)
- Verifying database state directly

## Test Files

- `phase1.simple.test.ts` - Phase 1 (Planning) validator, orchestrator, blocking
- `phase2.implementation.test.ts` - Phase 2 (Implementation) PR validation
- `phase3.review.test.ts` - Phase 3 (Review) issue detection, fingerprints
- `taskLifecycle.integration.test.ts` - Full lifecycle and review-fix cycle

## Important: Segmentation Fault Issue - ✅ FIXED

### The Problem (Now Resolved)

When running **multiple test files in parallel**, the test suite would encounter a segmentation fault after all tests passed:

```
✓ All tests pass...
Segmentation fault (core dumped)
```

This was caused by:
1. Multiple test files creating in-memory better-sqlite3 databases in parallel
2. All databases trying to clean up simultaneously when tests finish
3. Race condition in better-sqlite3's native C++ cleanup code
4. Segfault when native resources are finalized concurrently

### The Solution (Now Implemented)

**✅ Global serial execution is now configured in `vitest.config.ts`**

The configuration automatically enforces serial execution for all test runs:

```typescript
// vitest.config.ts
const poolConfig = {
  fileParallelism: false,  // Run test files serially
  maxConcurrency: 1,       // One test file at a time
  singleFork: true,        // Single worker process
};
```

**You don't need to do anything special - tests now run reliably by default:**

```bash
# Just run tests normally - serial execution is automatic
npm run test

# Or with CI mode (automatic in CI)
VITEST_FORCE_FORKS=1 npx vitest run
```

### Verification

All tests now pass without segfault:

```bash
$ VITEST_FORCE_FORKS=1 npx vitest run src/services/__tests__/phase*.test.ts

✓ src/services/__tests__/phase3.review.test.ts (12 tests)
✓ src/services/__tests__/phase2.implementation.test.ts (9 tests)
✓ src/services/__tests__/phase1.simple.test.ts (3 tests)
✓ src/services/__tests__/taskLifecycle.integration.test.ts (2 tests)

Test Files  10 passed (10)
Tests  114 passed | 2 skipped (116)
Duration  1.36s
✅ No segfault!
```

**See `SEGFAULT_FIX.md` for detailed technical explanation and verification.**

## Running Tests

### Run All Service-Level Tests (Serial Mode)

```bash
npm run test:service-level
```

Or manually:

```bash
npx vitest run src/services/__tests__/phase*.test.ts \
  src/services/__tests__/taskLifecycle.integration.test.ts \
  --pool=forks --poolOptions.forks.singleFork=true
```

### Run Individual Phase Tests

```bash
npx vitest run src/services/__tests__/phase1.simple.test.ts
npx vitest run src/services/__tests__/phase2.implementation.test.ts
npx vitest run src/services/__tests__/phase3.review.test.ts
```

### Run Full Lifecycle Test

```bash
npx vitest run src/services/__tests__/taskLifecycle.integration.test.ts
```

## Test Architecture

### Service-Level Testing Approach

```
Test Layer
    ↓
ServiceLevelTestHelper
    ├─ Mock: artifactExtractor.extractArtifacts()
    └─ Real: All other service methods
        ↓
ephemeralWorkerService.completePhaseExecution()
    ├→ REAL: Phase Validators (all 7)
    ├→ REAL: Recovery Agent
    ├→ REAL: Phase Orchestrator
    ├→ REAL: Database Updates
    └→ MOCK: Container artifacts
```

### What We Test (Real Code)

- ✅ All 7 phase validators
- ✅ Phase orchestrator state machine
- ✅ Recovery agent diagnosis logic
- ✅ Database operations and transactions
- ✅ Phase transition logic
- ✅ Attempt counting and blocking

### What We Mock (Expensive)

- ❌ Container execution (too slow/expensive)
- ❌ AI agent CLI calls (too expensive)
- ❌ GitHub API calls (rate limits)
- ❌ Docker operations (resource intensive)

## Test Coverage

### Phase 1 (Planning) - 3 Tests
- Successful validation
- Invalid plan rejection
- Max attempt blocking

### Phase 2 (Implementation) - 9 Tests
- Valid PR creation
- Missing/invalid fields
- Type validation
- Orchestrator integration

### Phase 3 (Review) - 12 Tests
- Clean review (no issues)
- Issue detection and routing
- Fingerprint validation
- Count validation
- Duplicate detection

### Full Lifecycle - 2 Tests
- Complete 7-phase flow
- Review → Fixes → Re-review cycle

## Performance

- **Execution Time**: ~900ms for all 26 tests
- **Database**: In-memory SQLite (fast)
- **No Network**: All mocked
- **No Containers**: All mocked

This allows for rapid iteration and confident refactoring.
