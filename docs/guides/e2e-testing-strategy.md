# End-to-End Testing Strategy

## Current State Assessment

### Critical Issues Identified
1. **No Real E2E Tests**: Current "integration" tests only test in-process APIs, not the deployed application
2. **Tests Pass, App Broken**: CI passes green while production is non-functional
3. **No Browser Testing**: Frontend completely untested in real browser environment
4. **No API Contract Validation**: Frontend-backend contract mismatches go undetected
5. **No Deployment Verification**: No smoke tests run against actual deployed environment

### What's Actually Broken (November 16, 2025)
- Frontend loads HTML but JavaScript may have runtime errors
- API returns data but frontend components don't display it (0 tasks shown despite 2 failed in DB)
- Failed tasks weren't being returned in API (fixed but not caught by tests)
- No E2E test caught these issues before deployment

---

## Proposed E2E Testing Architecture

### Test Pyramid

```
                    /\
                   /  \
                  / E2E\ (Small - Critical paths only)
                 /------\
                /        \
               /Integration\ (Medium - API contracts)
              /------------\
             /              \
            /  Unit Tests     \ (Large - Business logic)
           /------------------\
```

### Three Layers of Testing

#### Layer 1: Unit Tests (Current - Good)
- ✅ Testing business logic
- ✅ Testing services in isolation
- ✅ Fast, comprehensive coverage
- **Keep as-is**

#### Layer 2: API Integration Tests (Current - Needs Fix)
**Problems:**
- Tests use mocks instead of real implementations
- Tests don't validate actual HTTP responses
- Tests don't catch type mismatches between frontend and backend

**Solutions:**
1. **Real Integration Tests**: Test actual Express app with real database
2. **Contract Testing**: Validate API responses match TypeScript contracts
3. **Schema Validation**: Use Zod/JSON Schema to validate responses

#### Layer 3: E2E Tests (Missing - Critical)
**What We Need:**
1. **Playwright E2E Tests**: Real browser testing
2. **Smoke Tests**: Post-deployment verification
3. **Critical Path Tests**: Core user journeys

---

## Implementation Plan

### Phase 1: Critical Smoke Tests (IMMEDIATE - Day 1)

Create `/backend/tests/smoke/production-smoke.test.ts`:

```typescript
/**
 * Production Smoke Tests
 * Run these against deployed environment to verify basic functionality
 */
describe('Production Smoke Tests', () => {
  const BASE_URL = process.env.APP_URL || 'http://localhost';

  it('frontend serves HTML', async () => {
    const response = await fetch(BASE_URL);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<div id="root">');
  });

  it('backend health endpoint responds', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('API returns valid JSON with correct structure', async () => {
    // Test without auth first to verify structure
    const response = await fetch(`${BASE_URL}/api/dev-bots/queue`);
    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty(data.success ? 'data' : 'error');
  });
});
```

### Phase 2: Playwright E2E Tests (Week 1)

Create `/e2e/tests/critical-paths.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Critical User Journeys', () => {
  test('user can view task queue', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await expect(page.locator('[data-testid="task-queue"]')).toBeVisible();

    // Verify task counts are displayed
    const failedCount = await page.locator('[data-testid="failed-count"]').textContent();
    expect(parseInt(failedCount || '0')).toBeGreaterThanOrEqual(0);
  });

  test('failed tasks are displayed when they exist', async ({ page }) => {
    // Create a failed task via API
    await page.request.post('/api/dev-bots/tasks', {
      data: { /* task data */ }
    });

    await page.goto('/');
    await page.click('[data-testid="filter-failed"]');

    // Verify failed tasks appear in list
    await expect(page.locator('[data-testid^="task-item-"]')).toHaveCount(1, { timeout: 5000 });
  });

  test('API errors are handled gracefully', async ({ page }) => {
    // Mock API failure
    await page.route('**/api/dev-bots/queue', route => route.abort());

    await page.goto('/');

    // Verify error message is shown
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
  });
});
```

### Phase 3: Contract Testing (Week 1)

Create `/backend/tests/contracts/api-contracts.test.ts`:

```typescript
import { z } from 'zod';
import request from 'supertest';
import { app } from '../../src/app';

// Define expected schema
const DevBotsQueueSummarySchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(z.object({
      bucket: z.enum(['pending', 'active', 'completed', 'failed']),
      task: z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        // ... all required fields
      })
    })),
    counts: z.object({
      pending: z.number(),
      active: z.number(),
      completed: z.number(),
      failed: z.number(),
    }),
    lastUpdated: z.string(),
  })
});

describe('API Contract Validation', () => {
  it('GET /api/dev-bots/queue matches contract', async () => {
    const response = await request(app)
      .get('/api/dev-bots/queue')
      .set('X-API-Key', process.env.API_KEY);

    expect(response.status).toBe(200);

    // Validate response matches schema
    const result = DevBotsQueueSummarySchema.safeParse(response.body);
    if (!result.success) {
      console.error('Schema validation failed:', result.error.format());
    }
    expect(result.success).toBe(true);
  });
});
```

### Phase 4: Visual Regression Testing (Week 2)

```typescript
test('task queue renders correctly', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Take screenshot and compare
  await expect(page).toHaveScreenshot('task-queue.png', {
    fullPage: true,
    animations: 'disabled',
  });
});
```

---

## CI/CD Integration

### Update `.github/workflows/ci.yml`

```yaml
jobs:
  # ... existing jobs ...

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4

      # Start app in test mode
      - name: Start Backend
        run: |
          cd backend
          npm run build
          npm run start:test &

      - name: Build and Serve Frontend
        run: |
          cd frontend
          npm run build
          npx serve -s dist -p 3000 &

      - name: Wait for Services
        run: |
          npx wait-on http://localhost:3000 http://localhost:3001/api/health

      - name: Run Playwright Tests
        run: npx playwright test

      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-results
          path: playwright-report/

  deployment-smoke-test:
    runs-on: ubuntu-latest
    needs: [deploy]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Run Production Smoke Tests
        env:
          APP_URL: ${{ secrets.PRODUCTION_URL }}
        run: npm run test:smoke

      - name: Notify on Failure
        if: failure()
        run: |
          # Send alert that production is broken
          echo "🚨 Production smoke tests failed!"
```

---

## Testing Checklist

### Before Every PR
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] API contracts validated
- [ ] No TypeScript errors

### Before Merging to Main
- [ ] All above ✓
- [ ] E2E tests pass locally
- [ ] Manual smoke test performed

### After Every Deployment
- [ ] Production smoke tests run automatically
- [ ] Health endpoint returns 200
- [ ] Frontend loads without console errors
- [ ] Critical user journey works (view tasks)

---

## Success Metrics

### Current State (Baseline - Nov 16, 2025)
- E2E Test Coverage: 0%
- Deployment Success Rate: Unknown
- Time to Detect Production Issues: Days (manual discovery)

### Target State (End of Week 2)
- E2E Test Coverage: 80% of critical paths
- Deployment Success Rate: >95% (caught by smoke tests)
- Time to Detect Production Issues: <5 minutes (automated)

---

## Priority Test Cases

### P0 (Must Have - Week 1)
1. ✅ Frontend HTML loads
2. ✅ Backend health check responds
3. ✅ API returns valid JSON structure
4. ✅ Failed tasks appear in UI when present in DB
5. ✅ Task counts match database reality

### P1 (Should Have - Week 1)
6. Task filtering works (pending/active/completed/failed)
7. Real-time updates via WebSocket
8. Error messages display when API fails
9. Loading states show during data fetch
10. Empty states show when no tasks

### P2 (Nice to Have - Week 2)
11. Visual regression tests for all pages
12. Performance budgets (< 3s initial load)
13. Accessibility tests (a11y violations)
14. Mobile responsive tests
15. Cross-browser testing (Chrome, Firefox, Safari)

---

## Immediate Action Items

### Today (Nov 16, 2025)
1. Create smoke test script
2. Add to CI/CD pipeline
3. Run against current production
4. Document all failures

### This Week
1. Set up Playwright
2. Implement P0 test cases
3. Add contract validation
4. Run before every deployment

### Next Week
1. Implement P1 test cases
2. Add visual regression
3. Set up monitoring alerts
4. Train team on E2E testing

---

## Tools & Dependencies

```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "zod": "^3.22.4",
    "wait-on": "^7.2.0",
    "percy-playwright": "^1.0.0"
  },
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:smoke": "vitest run tests/smoke",
    "test:contracts": "vitest run tests/contracts"
  }
}
```

---

## Notes

- **Don't over-test**: E2E tests are slow. Focus on critical paths only.
- **Use data-testid**: Make selectors stable (`data-testid="task-item"` not `.css-class-123`)
- **Independent tests**: Each test should set up its own data and clean up
- **Flaky tests = Delete**: If a test is flaky, fix it or remove it
- **Fast feedback**: Run smoke tests first, full E2E suite after

