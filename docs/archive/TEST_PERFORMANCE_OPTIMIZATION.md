# Test Performance Optimization Analysis

**Date:** 2025-11-09
**Status:** Investigation Complete - Ready for Implementation

---

## Executive Summary

Current test execution times are slow due to:
1. Frontend integration tests running with maxForks=1 (single-threaded)
2. Backend integration tests not running in CI at all (excluded)
3. No build caching between test runs
4. vitest rebuilding on every test execution

---

## Findings

### Frontend Integration Tests

**Current Configuration** (`frontend/vitest.integration.config.ts`):
```typescript
pool: 'forks',
poolOptions: {
  forks: {
    maxForks: 1,      // ⚠️ SINGLE-THREADED
    minForks: 1,
  },
},
fileParallelism: false,  // ⚠️ NO PARALLEL FILE EXECUTION
testTimeout: 60000,       // ⚠️ 60s timeout (very long)
```

**Issues:**
- Tests run sequentially, one file at a time
- No parallelization = slow execution
- Vitest rebuilds the entire app for every test run
- 5 integration test files taking ~2-3 minutes each

**Test Files:**
1. `src/App.integration.test.tsx` (576 lines, 21 tests)
2. `src/services/api.integration.test.ts` (191 lines)
3. `src/components/ServiceCard.integration.test.tsx` (285 lines)
4. `src/components/CloudLogs.integration.test.tsx` (502 lines)
5. `src/components/dev-bots/DevBots.integration.test.tsx` (534 lines)

### Backend Integration Tests

**Current Status:**
- Only 1 of 5 integration tests running in CI
- Other 4 tests excluded via `SKIP_HEAVY_DEV_BOT_TESTS=1`

**Tests in CI:**
✅ `tests/integration/api/api.routes.test.ts` - RUNNING

**Tests NOT in CI:**
❌ `tests/integration/process-lifecycle.test.ts` - EXCLUDED
❌ `tests/integration/socket-events.test.ts` - EXCLUDED (heavyBotPatterns)
❌ `tests/integration/docker-operations.test.ts` - EXCLUDED (heavyBotPatterns)
❌ `src/services/websocket.integration.test.ts` - EXCLUDED

**Exclusion Reason** (`backend/vitest.config.ts:28-29`):
```typescript
const heavyBotPatterns = [
  // ...
  'tests/integration/docker-operations.test.ts',
  'tests/integration/socket-events.test.ts',
];

exclude: [
  ...(skipHeavyBots ? heavyBotPatterns : []),
]
```

### CI Configuration Analysis

**Current CI Jobs** (`.github/workflows/ci.yml`):
```yaml
backend-test:
  - npm run test -w backend  # Unit tests with safe-test-runner
    env:
      SKIP_HEAVY_DEV_BOT_TESTS: '1'  # ⚠️ Excludes integration tests

  - Backend API integration tests  # Only api.routes.test.ts
    run: npx vitest run tests/integration/api/api.routes.test.ts

frontend-test-integration:
  - npm run test:integration -w frontend  # All integration tests, no build cache
```

---

## Performance Optimization Opportunities

### 1. Frontend Test Parallelization (High Impact)

**Current:** Single-threaded execution (~10-15 min)
**Proposed:** Multi-threaded execution with threads pool
**Expected Improvement:** 60-75% faster (~3-5 min)

**Changes:**
```typescript
// vitest.integration.config.ts
export default defineConfig({
  test: {
    pool: 'threads',  // Change from 'forks'
    poolOptions: {
      threads: {
        maxThreads: 4,   // Parallel execution
        minThreads: 1,
      },
    },
    fileParallelism: true,  // Enable parallel file execution
    testTimeout: 10000,     // Reduce from 60s to 10s (we added explicit timeouts)
    hookTimeout: 10000,
  },
});
```

**Rationale:**
- Threads pool is faster than forks for CPU-bound tests
- With 5 test files, we can run 4 in parallel
- We already fixed hanging tests with explicit timeouts, so 60s is unnecessary

### 2. Remove Redundant Builds (Medium Impact)

**Current Issue:**
- Vitest rebuilds source code on every test run via `@vitejs/plugin-react`
- No caching between test executions in CI

**Proposed Solution:**
Vitest handles this automatically via its transform pipeline. The `@vitejs/plugin-react`
plugin already caches transformations between test runs. No additional build step needed.

**Why This Works:**
- Vitest uses Vite's transform pipeline (not a separate build)
- Vite caches transformed modules in `node_modules/.vite`
- CI already caches node_modules, so transforms are cached too

### 3. Add Backend Integration Tests to CI (High Value)

**Current:** 4 of 5 integration tests excluded
**Proposed:** Run all integration tests in separate CI job
**Expected Improvement:** Better test coverage, catch integration issues

**Implementation:**
Add new CI job to run excluded integration tests:
```yaml
backend-test-integration:
  name: Backend Integration Tests
  runs-on: ubuntu-latest
  needs: install
  steps:
    # ... cache restore ...
    - name: Backend integration tests
      run: npx vitest run --config vitest.config.ts tests/integration/ src/**/*.integration.test.ts
      # No SKIP_HEAVY_DEV_BOT_TESTS env var
```

### 4. Optimize Test Timeouts (Low Impact)

**Current:**
- Frontend integration: 60s timeout
- Backend integration: 30s timeout

**Proposed:**
- Frontend integration: 10s timeout (we added explicit waitFor timeouts)
- Backend integration: 20s timeout

---

## Implementation Plan

### Phase 1: Frontend Parallelization (Immediate - High Impact)
1. Update `vitest.integration.config.ts`:
   - Change `pool` from 'forks' to 'threads'
   - Set `maxThreads: 4` (CI has 2-4 cores)
   - Enable `fileParallelism: true`
   - Reduce `testTimeout` to 10000ms
2. Update `vitest.shared.config.js` to export integration config
3. Test locally to verify no race conditions
4. Expected time: ~15 minutes

### Phase 2: Backend Integration Tests in CI (High Value)
1. Create new CI job `backend-test-integration`
2. Run without `SKIP_HEAVY_DEV_BOT_TESTS` env var
3. Add timeout of 10 minutes for job
4. Expected time: ~10 minutes

### Phase 3: Verification & Monitoring
1. Run full CI suite and measure execution times
2. Monitor for flaky tests or race conditions
3. Adjust thread counts if needed

---

## Expected Results

### Before:
- Frontend integration tests: ~10-15 min (single-threaded)
- Backend integration tests: 4 of 5 tests not running

### After:
- Frontend integration tests: ~3-5 min (4 threads, 60-75% faster)
- Backend integration tests: All 5 tests running in ~5-7 min
- Total CI time savings: ~5-10 minutes per run
- Better test coverage with all integration tests running

---

## Risks & Mitigations

### Risk 1: Race Conditions from Parallelization
**Mitigation:**
- We already fixed test isolation issues with proper mocking
- Tests use isolated environments (jsdom, mocked API)
- Monitor for flaky tests in CI

### Risk 2: CI Resource Constraints
**Mitigation:**
- Start with maxThreads: 4 (conservative)
- GitHub Actions runners have 2-4 cores
- Can adjust down if CI becomes unstable

### Risk 3: Heavy Tests Timing Out in CI
**Mitigation:**
- Keep longer timeout for specific heavy tests
- Consider splitting very heavy tests into separate job
- docker-operations and socket-events may need 20-30s timeout

---

## Next Steps

1. ✅ Investigation complete
2. ⏳ Implement Phase 1 (Frontend parallelization)
3. ⏳ Implement Phase 2 (Backend integration tests)
4. ⏳ Test and verify improvements
5. ⏳ Monitor CI for stability

---

## References

- Frontend vitest config: `frontend/vitest.integration.config.ts`
- Backend vitest config: `backend/vitest.config.ts`
- CI workflow: `.github/workflows/ci.yml`
- Test investigation: `INTEGRATION_TEST_INVESTIGATION.md`
