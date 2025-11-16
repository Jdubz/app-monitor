# E2E Testing Suite

## ⚠️ IMPORTANT: Development Environment Only

**These tests run against LOCAL development servers ONLY.**

- Backend: `http://localhost:3002` (Port 3002, NOT production!)
- Frontend: `http://localhost:5174` (Port 5174, NOT production!)
- Database: `backend/data/e2e-test.db` (Isolated test DB)

**NEVER run E2E tests against production!**

---

## Quick Start

### 1. Setup (First Time Only)

```bash
npm run test:e2e:setup
```

This will:
- Create isolated E2E test database
- Install Playwright browsers
- Configure test environment

### 2. Run Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with interactive UI
npm run test:e2e:ui

# Run specific test file
npx playwright test critical-paths
```

---

## How It Works

### Test Environment Architecture

```
┌─────────────────────────────────────────┐
│         E2E Test Runner                  │
│         (Playwright)                     │
└────────────┬────────────────────────────┘
             │
             │ Controls
             ├────────────────────────────┐
             │                            │
             ▼                            ▼
    ┌────────────────┐           ┌──────────────┐
    │   Frontend     │           │   Backend    │
    │  localhost:5174│◄─────────►│localhost:3002│
    │  (Vite Dev)    │   API     │  (Node.js)   │
    └────────────────┘           └──────┬───────┘
                                        │
                                        ▼
                                 ┌──────────────┐
                                 │  E2E Test DB │
                                 │e2e-test.db   │
                                 └──────────────┘
```

### Port Isolation

| Environment | Backend Port | Frontend Port | Database |
|------------|-------------|---------------|----------|
| **Production** | 80 (nginx) | 80 (nginx) | `/opt/app-monitor/shared/backend/data/app-monitor.db` |
| **E2E Tests** | 3002 | 5174 | `backend/data/e2e-test.db` |
| **Dev** | 3001 | 5173 | `backend/data/app-monitor.db` |

---

## Test Structure

```
e2e/
├── playwright.config.ts    # Playwright configuration
├── tests/
│   ├── critical-paths.spec.ts   # Core user journeys
│   ├── error-handling.spec.ts   # Error scenarios
│   └── data-integrity.spec.ts   # Data validation
├── fixtures/                # Test data and helpers
└── results/                 # Test reports (gitignored)
```

---

## Writing Tests

### Basic Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should do something', async ({ page }) => {
    // Arrange
    const element = page.locator('[data-testid="my-element"]');

    // Act
    await element.click();

    // Assert
    await expect(element).toHaveText('Expected');
  });
});
```

### Best Practices

1. **Use data-testid attributes** for stable selectors
   ```tsx
   <div data-testid="task-item-123">...</div>
   ```

2. **Wait for network requests**
   ```typescript
   await page.waitForResponse(
     response => response.url().includes('/api/tasks')
   );
   ```

3. **Test real user behavior**, not implementation details

4. **Keep tests independent** - each test should work in isolation

5. **Use descriptive test names**
   ```typescript
   test('user can filter tasks by failed status')
   ```

---

## Debugging Tests

### Run with UI Mode (Recommended)

```bash
npm run test:e2e:ui
```

This opens interactive UI where you can:
- See tests run in real browser
- Step through each action
- Inspect element selectors
- View network requests

### Debug Specific Test

```bash
npx playwright test --debug critical-paths.spec.ts
```

### View Test Reports

```bash
npx playwright show-report
```

---

## CI Integration

E2E tests run in GitHub Actions CI:

```yaml
- name: Run E2E Tests
  run: |
    npm run test:e2e:setup
    npm run test:e2e
```

Tests run:
- ✅ On every PR
- ✅ Before merging to main
- ✅ In isolated CI environment
- ❌ NEVER against production

---

## Troubleshooting

### "Port 3002 already in use"

```bash
# Kill existing backend
pkill -f "node.*3002"

# Or use different port
PORT=3003 npm run e2e:backend
```

### "Cannot connect to backend"

1. Check backend is running: `curl http://localhost:3002/api/health`
2. Check logs: `tail -f backend/logs/*.log`
3. Verify database exists: `ls -la backend/data/e2e-test.db`

### "Tests are flaky"

1. Add explicit waits:
   ```typescript
   await page.waitForSelector('[data-testid="element"]', { timeout: 10000 });
   ```

2. Use `test.describe.serial()` to run tests in order

3. Increase timeout in playwright.config.ts

### "Database is locked"

```bash
# Stop all processes
pkill -f e2e

# Remove lock
rm -f backend/data/e2e-test.db-shm backend/data/e2e-test.db-wal

# Re-run setup
npm run test:e2e:setup
```

---

## What We Test

### Critical Paths (P0)
- ✅ Frontend loads without errors
- ✅ Backend health check responds
- ✅ Task queue displays correctly
- ✅ Failed tasks appear in UI
- ✅ Task counts match database

### Error Handling (P1)
- ✅ API failures show error state
- ✅ Missing auth shows appropriate error
- ✅ Network errors handled gracefully

### Data Integrity (P1)
- ✅ Counts match actual items
- ✅ All task buckets represented
- ✅ Real-time updates work

---

## Adding New Tests

1. Create test file in `e2e/tests/`
2. Follow existing patterns
3. Run locally: `npm run test:e2e:ui`
4. Verify in CI before merging

---

## Performance

E2E tests are intentionally **slow** (10-30s per test).

That's OK! They're testing real browser interactions.

**Guidelines:**
- Keep E2E suite < 50 tests
- Focus on critical paths only
- Use unit/integration tests for edge cases
- Run E2E tests in CI, not on every save

---

## Security

**Test API Key:** `test-e2e-api-key-not-for-production`

This key:
- ✅ Only works in test environment
- ✅ Has no access to production
- ✅ Is safe to commit to repo
- ✅ Expires with test database

**Never use production credentials in E2E tests!**

---

## Resources

- [Playwright Docs](https://playwright.dev/docs/intro)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)
