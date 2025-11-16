# E2E Test Inventory

## Test Suite Overview

All tests run against **isolated development environment**:
- Backend: `http://localhost:3002`
- Frontend: `http://localhost:5174`
- Database: `backend/data/e2e-test.db`

**Total Tests:** 7 spec files

---

## Test Files

### 1. `critical-paths.spec.ts` (NEW)
**Purpose:** Tests that would have caught the production bugs

**Tests:**
- ✅ Frontend loads without errors
- ✅ Can view task queue page
- ✅ Task counts are displayed
- ✅ API endpoint returns valid data
- ✅ Task queue API returns proper structure (including `failed` property!)
- ✅ Shows error state when API fails
- ✅ Handles missing API key gracefully
- ✅ Failed task count matches database reality (THE BUG WE FIXED!)
- ✅ Items array includes all task buckets

**Coverage:** API contracts, data integrity, error handling

---

### 2. `dev-bots-smoke.spec.ts` (EXISTING)
**Purpose:** Smoke test for Dev Bots dashboard UI

**Tests:**
- ✅ Queue and worker consoles visible
- ✅ Task filters show counts
- ✅ Worker list renders
- ✅ Layout screenshot regression test

**Coverage:** UI rendering, visual regression

**Notes:**
- Uses mocked API responses
- Good for UI-only testing
- Should be augmented with real API tests

---

### 3. `navigation.spec.ts` (EXISTING)
**Purpose:** Basic app navigation and routing

**Tests:**
- ✅ Application loads
- ✅ Header with logo displays
- ✅ All main tabs visible (local, scripts, staging, production, health, claude-workers)
- ✅ Tab switching works
- ✅ Loading states

**Coverage:** Navigation, tabs, basic UI

---

### 4. `services.spec.ts` (EXISTING)
**Purpose:** Service management UI

**Tests:**
- ✅ Service list displays
- ✅ Status indicators shown
- ✅ Start/stop buttons present
- ✅ System health metrics
- ✅ Scripts panel

**Coverage:** Service controls, health monitoring

---

### 5. `keyboard-shortcuts.spec.ts` (EXISTING)
**Purpose:** Keyboard shortcuts functionality

**Tests:**
- ✅ `Shift+?` shows shortcuts help
- ✅ `Ctrl+L` clears logs
- ✅ `Ctrl+↑` jumps to top
- ✅ `Ctrl+↓` jumps to bottom
- ✅ `N` toggles line numbers
- ✅ `Escape` clears search

**Coverage:** Keyboard navigation, accessibility

---

### 6. `log-viewer.spec.ts` (EXISTING)
**Purpose:** Log viewing and filtering

**Location:** `frontend/e2e/log-viewer.spec.ts` (needs consolidation)

---

## Test Coverage Analysis

### What We Test Well ✅
- Basic navigation
- UI rendering
- Keyboard shortcuts
- Service status display

### What We DON'T Test (Gaps Found) ❌
1. **Real API Integration**
   - Most tests use mocks
   - No validation of actual HTTP responses
   - No type checking of API contracts

2. **Critical Data Flows**
   - ❌ Failed tasks appearing in UI (THE BUG!)
   - ❌ Real-time WebSocket updates
   - ❌ Task status transitions
   - ❌ Worker assignment logic

3. **Error Scenarios**
   - ❌ Database failures
   - ❌ Network timeouts
   - ❌ Malformed API responses
   - ❌ Race conditions

4. **Performance**
   - ❌ Page load time < 3s
   - ❌ API response time < 500ms
   - ❌ Memory leaks in long-running sessions

5. **Accessibility**
   - ❌ Screen reader compatibility
   - ❌ Keyboard-only navigation
   - ❌ WCAG compliance

---

## Priority Test Additions Needed

### P0 (Critical - Blocks Deploy)
1. **Failed Task Display Test** ✅ ADDED in critical-paths.spec.ts
   - Verify failed tasks show in UI
   - Verify count matches items

2. **API Contract Validation** ✅ ADDED in critical-paths.spec.ts
   - Check all required fields present
   - Check types match TypeScript interfaces

3. **Basic Smoke Test** ✅ EXISTS
   - App loads
   - No console errors
   - Can navigate

### P1 (High - Should Have)
4. **Task Lifecycle Test** ❌ MISSING
   - Create task
   - Assign to worker
   - Task completes
   - Shows in completed list

5. **Real-time Updates** ❌ MISSING
   - WebSocket connection established
   - Updates appear without refresh
   - Connection recovery after disconnect

6. **Error Boundary Test** ❌ MISSING
   - Trigger error in component
   - Error boundary catches it
   - User sees friendly error message

### P2 (Medium - Nice to Have)
7. **Performance Budgets** ❌ MISSING
8. **Visual Regression** ✅ EXISTS (dev-bots-smoke)
9. **Accessibility Audit** ❌ MISSING

---

## Test Execution Strategy

### Local Development
```bash
npm run test:e2e:ui    # Interactive mode for development
```

### CI Pipeline
```bash
npm run test:e2e       # Headless mode for CI
```

### Pre-Deploy
```bash
npm run test:e2e:setup # Reset test environment
npm run test:e2e       # Run full suite
```

---

## Test Results Analysis

### Current Status (Nov 16, 2025)

| Category | Tests | Pass | Fail | Skip |
|----------|-------|------|------|------|
| Critical Paths | 9 | TBD | TBD | 0 |
| UI Smoke | 2 | TBD | TBD | 0 |
| Navigation | 5 | TBD | TBD | 0 |
| Services | 7 | TBD | TBD | 0 |
| Keyboard | 9 | TBD | TBD | 0 |
| **TOTAL** | **32** | **?** | **?** | **0** |

---

## Known Issues

### Flaky Tests
- ⚠️ `keyboard-shortcuts.spec.ts` - timing-dependent, uses waitForTimeout
- ⚠️ `services.spec.ts` - relies on specific service states

### Test Environment Issues
- ⚠️ Tests currently don't clean up database between runs
- ⚠️ Port conflicts if dev servers running
- ⚠️ Some tests use hardcoded waits instead of proper assertions

---

## Recommendations

1. **Immediate Actions**
   - ✅ Add failed task test (DONE)
   - ✅ Validate API contracts (DONE)
   - ⬜ Run full suite and fix failures
   - ⬜ Add to CI pipeline

2. **This Week**
   - ⬜ Add task lifecycle test
   - ⬜ Test real-time WebSocket updates
   - ⬜ Remove hardcoded waits, use proper assertions
   - ⬜ Add database cleanup between tests

3. **Next Week**
   - ⬜ Performance budgets
   - ⬜ Accessibility testing
   - ⬜ Cross-browser testing (Firefox, Safari)
   - ⬜ Mobile responsive tests

---

## Success Metrics

**Before (Nov 15, 2025):**
- E2E Coverage: ~40% (UI only, mocked APIs)
- Bugs Caught: 0 (failed task bug went to production)
- CI Integration: Partial (frontend only)

**Target (Nov 23, 2025):**
- E2E Coverage: >80% of critical paths
- Bugs Caught: >90% before production
- CI Integration: Full (blocks merge on failure)
- Test Execution Time: <5 minutes
- Flaky Test Rate: <5%

---

## Notes

- All tests MUST use isolated test environment
- Never test against production
- Each test should be independent
- Clean up test data after each test
- Use data-testid for stable selectors
- Avoid hardcoded waits, use proper assertions
