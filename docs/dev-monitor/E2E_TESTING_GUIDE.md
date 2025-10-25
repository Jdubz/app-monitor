# E2E Testing Guide

## Overview

This guide covers end-to-end testing for the Dev Monitor application using Playwright.

## Prerequisites

- Node.js 18.x or 20.x
- npm or yarn
- Chrome, Firefox, or Safari browser

## Installation

```bash
cd dev-monitor/frontend
npm install
npx playwright install
```

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run tests in UI mode (interactive)
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser)
```bash
npm run test:e2e:headed
```

### Debug a specific test
```bash
npm run test:e2e:debug -- navigation.spec.ts
```

### Run specific test file
```bash
npx playwright test e2e/navigation.spec.ts
```

### Run tests on specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Test Structure

```
dev-monitor/frontend/
├── e2e/
│   ├── navigation.spec.ts      # Basic navigation tests
│   ├── log-viewer.spec.ts      # Log viewer functionality
│   ├── services.spec.ts        # Local services & health
│   └── keyboard-shortcuts.spec.ts  # Keyboard shortcuts
├── playwright.config.ts        # Playwright configuration
└── package.json
```

## Test Coverage

### 1. Navigation Tests (`navigation.spec.ts`)
- ✅ Application loads successfully
- ✅ Header and logo display
- ✅ All tabs are visible and clickable
- ✅ Tab switching works correctly
- ✅ Loading states display

### 2. Log Viewer Tests (`log-viewer.spec.ts`)
- ✅ Log viewer controls (pause, clear, download)
- ✅ Auto-scroll toggle
- ✅ Clear logs functionality
- ✅ Filter options
- ✅ Keyboard shortcuts (Ctrl+K, Ctrl+Space)

### 3. Services Tests (`services.spec.ts`)
- ✅ Local services list display
- ✅ Service status indicators
- ✅ Start/stop buttons
- ✅ System health metrics
- ✅ Scripts panel

### 4. Keyboard Shortcuts Tests (`keyboard-shortcuts.spec.ts`)
- ✅ Show shortcuts help (?)
- ✅ Clear logs (Ctrl+L)
- ✅ Jump to top (Ctrl+↑)
- ✅ Jump to bottom (Ctrl+↓)
- ✅ Toggle line numbers (N)
- ✅ Clear search (Escape)
- ✅ Error handling
- ✅ Loading states

## Writing New Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Additional setup
  });

  test('should do something', async ({ page }) => {
    // Test implementation
    await expect(page.locator('#element')).toBeVisible();
  });
});
```

### Common Patterns

#### Waiting for elements
```typescript
await page.waitForSelector('#element');
await page.waitForTimeout(1000); // Use sparingly
await page.waitForLoadState('networkidle');
```

#### Interacting with elements
```typescript
await page.click('#button');
await page.fill('#input', 'text');
await page.press('Control+k');
await page.keyboard.type('Hello');
```

#### Assertions
```typescript
await expect(page.locator('#element')).toBeVisible();
await expect(page).toHaveTitle(/Expected Title/);
await expect(page.locator('#text')).toHaveText('Expected');
```

#### Handling dynamic content
```typescript
// Graceful handling of fast-loading content
await expect(loading).toBeVisible({ timeout: 1000 }).catch(() => {
  // Content loaded quickly, that's okay
});
```

## Configuration

The `playwright.config.ts` file configures:

- **Test directory**: `./e2e`
- **Base URL**: `http://localhost:5173`
- **Browsers**: Chromium, Firefox, WebKit
- **Retries**: 2 retries in CI, 0 locally
- **Screenshots**: On failure only
- **Trace**: On first retry
- **Auto-start dev server**: Yes (unless in CI)

## CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Changes to `dev-monitor/**` files

### GitHub Actions Workflow

1. **Frontend Tests** - Lint, unit tests, build
2. **Backend Tests** - Lint, unit tests
3. **E2E Tests** - Full browser tests (Chromium only in CI)
4. **Code Quality** - Coverage reports

### Viewing Results

After CI runs:
- Check "Actions" tab in GitHub
- Download test artifacts (reports, screenshots)
- View detailed logs for failures

## Debugging Failed Tests

### 1. Run in UI mode
```bash
npm run test:e2e:ui
```

### 2. Run with debug flag
```bash
npm run test:e2e:debug -- path/to/test.spec.ts
```

### 3. View test report
```bash
npm run test:e2e:report
```

### 4. Check screenshots
Failed tests automatically capture screenshots in `test-results/`

### 5. Enable trace
Traces are captured on first retry. View with:
```bash
npx playwright show-trace trace.zip
```

## Best Practices

### 1. Use proper selectors
```typescript
// ✅ Good - semantic selectors
await page.getByRole('button', { name: /submit/i });
await page.getByLabel('Email');
await page.getByText('Welcome');

// ❌ Avoid - brittle selectors
await page.locator('.btn-primary');
await page.locator('#submit-btn-123');
```

### 2. Make tests independent
- Each test should be able to run alone
- Use `beforeEach` for setup
- Don't rely on test execution order

### 3. Handle timing issues
```typescript
// ✅ Wait for specific condition
await expect(element).toBeVisible();

// ❌ Arbitrary timeouts
await page.waitForTimeout(5000);
```

### 4. Use appropriate timeouts
```typescript
// Short timeout for quick actions
await expect(button).toBeVisible({ timeout: 1000 });

// Longer timeout for network requests
await page.waitForLoadState('networkidle', { timeout: 10000 });
```

### 5. Clean up after tests
```typescript
test.afterEach(async ({ page }) => {
  // Close WebSocket connections
  // Clear local storage
  // Reset state
});
```

## Performance Testing

### Load Testing
Use the browser DevTools to measure performance:

```typescript
test('page load performance', async ({ page }) => {
  const startTime = Date.now();
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const loadTime = Date.now() - startTime;
  
  expect(loadTime).toBeLessThan(3000); // 3 seconds
});
```

### Memory Leak Detection
```typescript
test('memory leak check', async ({ page, context }) => {
  await page.goto('/');
  
  // Perform actions that might leak memory
  for (let i = 0; i < 10; i++) {
    await page.reload();
  }
  
  // Check memory usage (requires CDP)
  const metrics = await context.pages()[0].metrics();
  console.log('Memory:', metrics);
});
```

## Troubleshooting

### Tests fail locally but pass in CI
- Check Node.js version matches CI
- Ensure browsers are up to date
- Check for local environment differences

### Tests are flaky
- Add explicit waits for dynamic content
- Use `waitForLoadState('networkidle')`
- Increase timeouts if needed
- Check for race conditions

### Tests are slow
- Run tests in parallel: `npx playwright test --workers=4`
- Use `--project=chromium` to test one browser
- Skip visual regression tests locally

### Can't find elements
- Use Playwright Inspector: `npm run test:e2e:debug`
- Check selectors with `page.locator('#id').highlight()`
- Verify element is in viewport

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright CI/CD](https://playwright.dev/docs/ci)
- [Debugging Guide](https://playwright.dev/docs/debug)

## Support

For issues:
1. Check this guide
2. Review test output and screenshots
3. Run in debug mode
4. Check GitHub Actions logs
5. Create an issue with details and screenshots
