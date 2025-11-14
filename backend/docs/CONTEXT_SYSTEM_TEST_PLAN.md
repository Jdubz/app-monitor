# Context System - Comprehensive Test Plan

## Executive Summary

**Current Test Coverage**: ~15-20%
**Target Coverage**: 80%+
**Critical Bugs Found**: 3 (1 high, 2 medium priority)
**Missing Test Files**: 5 out of 6 components untested

This document outlines the complete test implementation plan for the Phase 2 context system.

---

## Critical Bugs to Fix (Before Adding Tests)

### 1. Path Traversal Vulnerability - HIGH PRIORITY ⚠️
**File**: `src/services/context/contextBundleGenerator.ts:254-272`
**Issue**: `path.normalize()` insufficient for preventing directory traversal

**Current Code**:
```typescript
const normalizedPath = path.normalize(source.path);
if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
  throw new Error(...);
}
```

**Problem**: `path.normalize('foo/../../../etc/passwd')` may still allow traversal

**Fix**:
```typescript
// Sanitize the source path to prevent path traversal
const normalizedPath = path.normalize(source.path).replace(/^(\.\.[\/\\])+/, '');

// Prevent path traversal attacks
if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
  throw new Error(`Invalid source path: ${source.path}. Paths must be relative and cannot contain '..'`);
}

// Resolve file path
const backendPath = this.getBackendPath();
const filePath = path.join(backendPath, normalizedPath);

// CRITICAL: Verify the resolved path is within the backend directory
const resolvedPath = path.resolve(filePath);
const allowedRoot = path.resolve(backendPath);

if (!resolvedPath.startsWith(allowedRoot + path.sep) && resolvedPath !== allowedRoot) {
  throw new Error(`Path traversal detected in source: ${source.path}`);
}
```

### 2. Database Initialization Failure - MEDIUM PRIORITY
**File**: `src/services/context/contextCache.ts:46-63`
**Issue**: If DB init fails, `this.db` is undefined but code tries to use it

**Fix**: Add null checks before DB usage:
```typescript
private async loadFromDb(cacheKey: string): Promise<{ entry: BundleCacheEntry; bundle: ContextBundle } | null> {
  // Add check at start
  if (!this.persistToDb || !this.db) {
    return null;
  }
  // ... rest of method
}
```

### 3. Race Condition in Cleanup - MEDIUM PRIORITY
**File**: `src/services/context/contextCache.ts:52-57`
**Issue**: Cleanup interval can overlap with destroy()

**Fix**:
```typescript
private cleanupInProgress = false;

// In constructor:
this.cleanupInterval = setInterval(async () => {
  if (this.cleanupInProgress) return;
  this.cleanupInProgress = true;
  try {
    await this.cleanupExpiredEntries();
  } finally {
    this.cleanupInProgress = false;
  }
}, 60 * 60 * 1000);

// In destroy():
destroy(): void {
  if (this.cleanupInterval) {
    clearInterval(this.cleanupInterval);
    this.cleanupInterval = undefined;
  }
  // Wait for cleanup to finish if in progress
  const waitForCleanup = () => {
    if (this.cleanupInProgress) {
      setTimeout(waitForCleanup, 100);
    } else {
      this.clear();
    }
  };
  waitForCleanup();
}
```

---

## Test Implementation Priority

### Phase 1: Critical Unit Tests (Week 1)

#### 1.1 ContextCache.test.ts - CRITICAL
**Lines of Code**: ~600 test code needed
**Coverage Target**: 85%+

**Test Suites**:
- Constructor & initialization (10 tests)
- Cache key generation (12 tests)
- Get/Set/Has/Delete operations (15 tests)
- LRU eviction (8 tests)
- Database persistence (12 tests)
- Cleanup & destroy (6 tests)
- Edge cases & error handling (10 tests)

**Total**: ~73 test cases

#### 1.2 ContextBundleGenerator.test.ts - CRITICAL
**Lines of Code**: ~800 test code needed
**Coverage Target**: 85%+

**Test Suites**:
- Bundle generation flow (12 tests)
- Input validation (15 tests)
- Recipe loading (8 tests)
- Content generation (10 tests)
- Source processing (15 tests)
- Path security (8 tests)
- Size limits (6 tests)
- Environment overrides (5 tests)

**Total**: ~79 test cases

#### 1.3 ContextTransforms.test.ts - CRITICAL
**Lines of Code**: ~500 test code needed
**Coverage Target**: 85%+

**Test Suites**:
- Transform dispatch (5 tests)
- Summarize (8 tests)
- Strip comments (6 tests)
- Minify (5 tests)
- Bullet list (6 tests)
- Extract headings (8 tests)
- Extract code blocks (6 tests)
- Extract tables (5 tests)
- Extract code sections (10 tests)
- Extract JSON path (15 tests)
- Security tests (5 tests)

**Total**: ~79 test cases

### Phase 2: Remaining Unit Tests (Week 2)

#### 2.1 ContextRecipeValidator.test.ts - MEDIUM
**Lines of Code**: ~300 test code needed
**Coverage Target**: 90%+

**Test Suites**:
- Recipe validation (15 tests)
- Source validation (8 tests)
- Extraction validation (7 tests)
- Size limit validation (4 tests)
- TTL validation (5 tests)

**Total**: ~39 test cases

#### 2.2 ContextLogger.test.ts - LOW
**Lines of Code**: ~200 test code needed
**Coverage Target**: 80%+

**Test Suites**:
- Singleton pattern (3 tests)
- Log levels (6 tests)
- Formatting (8 tests)
- Configuration (4 tests)

**Total**: ~21 test cases

### Phase 3: Integration Tests (Week 3)

#### 3.1 End-to-End Integration
**File**: `__tests__/integration/contextSystem.integration.test.ts`
**Lines of Code**: ~400 test code needed

**Test Suites**:
- Complete bundle generation flow (8 tests)
- Cache persistence across restarts (4 tests)
- Multi-profile bundles (6 tests)
- Real recipe files (5 tests)
- Error recovery (6 tests)

**Total**: ~29 test cases

#### 3.2 Database Integration
**File**: `__tests__/integration/contextDatabase.integration.test.ts`
**Lines of Code**: ~200 test code needed

**Test Suites**:
- Table operations (6 tests)
- Migration verification (3 tests)
- Data integrity (4 tests)
- Concurrent access (3 tests)

**Total**: ~16 test cases

#### 3.3 File System Integration
**File**: `__tests__/integration/contextFileSystem.integration.test.ts`
**Lines of Code**: ~250 test code needed

**Test Suites**:
- Recipe loading (5 tests)
- Source file reading (6 tests)
- Path resolution (5 tests)
- Permission handling (4 tests)

**Total**: ~20 test cases

### Phase 4: Edge Cases & Performance (Week 4)

#### 4.1 Edge Case Tests
- Large file handling (5 tests)
- Concurrent operations (5 tests)
- Memory leaks (3 tests)
- Resource exhaustion (4 tests)

#### 4.2 Performance Tests
- Benchmark cache operations (3 tests)
- Benchmark bundle generation (3 tests)
- Stress tests (4 tests)

---

## Test Coverage Breakdown

| Component | LOC | Current Coverage | Target Coverage | Test Cases Needed |
|-----------|-----|-----------------|-----------------|-------------------|
| ContextCache | 572 | 0% | 85% | 73 |
| ContextBundleGenerator | 538 | 0% | 85% | 79 |
| ContextTransforms | 396 | 0% | 85% | 79 |
| ContextRecipeLoader | 280 | ~60% | 90% | +15 |
| ContextRecipeValidator | 282 | 0% | 90% | 39 |
| ContextLogger | 162 | 0% | 80% | 21 |
| **Integration Tests** | - | 0% | - | 65 |
| **Total** | 2,230 | ~15% | 80%+ | **371 test cases** |

---

## Test Utilities Needed

### Mock Factories
```typescript
// test/helpers/contextMocks.ts
export const mockRecipe = (overrides?: Partial<ContextRecipe>): ContextRecipe => { ... }
export const mockBundle = (overrides?: Partial<ContextBundle>): ContextBundle => { ... }
export const mockDatabase = (): jest.Mocked<DevBotsDatabase> => { ... }
```

### Test Fixtures
```typescript
// test/fixtures/recipes/
- test-recipe-1.yaml
- test-recipe-invalid.yaml
- test-recipe-large.yaml
```

### Test Helpers
```typescript
// test/helpers/testUtils.ts
export const createTempFile = (content: string): string => { ... }
export const createTempDir = (): string => { ... }
export const cleanupTemp = (): void => { ... }
```

---

## Testing Best Practices

### 1. Test Organization
- One describe block per public method
- Group related tests together
- Use clear, descriptive test names

### 2. Test Independence
- Each test should be independent
- Use beforeEach/afterEach for setup/teardown
- Don't share state between tests

### 3. Mocking Strategy
- Mock external dependencies (DB, file system)
- Use real implementations for unit logic
- Integration tests use real dependencies

### 4. Assertions
- Test one thing per test
- Use specific matchers (toEqual, toThrow, etc.)
- Add helpful error messages

### 5. Coverage Goals
- Minimum 80% line coverage
- 100% coverage for security-sensitive code
- Test happy path AND error paths

---

## Test Execution Strategy

### During Development
```bash
# Run specific test file
npm test -- contextCache.test.ts

# Run with coverage
npm test -- --coverage contextCache.test.ts

# Watch mode
npm test -- --watch contextCache.test.ts
```

### CI/CD Integration
```bash
# Run all tests with coverage
npm test -- --coverage --reporter=json

# Fail if coverage below 80%
npm test -- --coverage --coverageThreshold='{"global":{"lines":80}}'
```

### Pre-commit Hook
```bash
# Run only changed tests
npm test -- --onlyChanged --bail
```

---

## Success Criteria

### Phase 1 Complete When:
- ✅ All critical bugs fixed
- ✅ ContextCache has 85%+ coverage
- ✅ ContextBundleGenerator has 85%+ coverage
- ✅ ContextTransforms has 85%+ coverage
- ✅ All tests passing

### Phase 2 Complete When:
- ✅ ContextRecipeValidator has 90%+ coverage
- ✅ ContextLogger has 80%+ coverage
- ✅ No regressions in existing tests

### Phase 3 Complete When:
- ✅ All integration tests implemented
- ✅ End-to-end scenarios tested
- ✅ Database operations verified
- ✅ File system operations verified

### Phase 4 Complete When:
- ✅ Edge cases covered
- ✅ Performance benchmarks established
- ✅ Overall coverage 80%+
- ✅ Documentation updated

---

## Estimated Effort

| Phase | Test Files | Test Cases | LOC | Effort (Days) |
|-------|------------|------------|-----|---------------|
| Phase 1 | 3 | 231 | 1,900 | 5-7 |
| Phase 2 | 2 | 60 | 500 | 2-3 |
| Phase 3 | 3 | 65 | 850 | 3-4 |
| Phase 4 | 2 | 15 | 300 | 2-3 |
| **Total** | **10** | **371** | **3,550** | **12-17 days** |

---

## Next Steps

1. ✅ Review and approve test plan
2. 🔧 Fix critical bugs (1-2 days)
3. 📝 Create test utilities and mocks (1 day)
4. ✅ Implement Phase 1 tests (5-7 days)
5. ✅ Implement Phase 2 tests (2-3 days)
6. ✅ Implement Phase 3 tests (3-4 days)
7. ✅ Implement Phase 4 tests (2-3 days)
8. 📊 Generate coverage reports
9. 📚 Update documentation

**Total Estimated Timeline**: 2-3 weeks

---

## Risk Mitigation

### Risk 1: Test Implementation Takes Longer
**Mitigation**: Prioritize critical path tests first (cache, generator, transforms)

### Risk 2: Existing Code Needs Refactoring
**Mitigation**: Create tests for current behavior first, then refactor

### Risk 3: Integration Tests Flaky
**Mitigation**: Use test isolation, proper cleanup, retry mechanisms

### Risk 4: Coverage Goals Not Met
**Mitigation**: Focus on critical code paths, document untested edge cases

---

## Conclusion

This comprehensive test plan will bring the context system from ~15% coverage to 80%+ coverage with 371 test cases across 10 test files. The phased approach ensures critical components are tested first, with integration and edge case testing following.

**Recommended Action**: Approve this plan and begin Phase 1 implementation immediately.
