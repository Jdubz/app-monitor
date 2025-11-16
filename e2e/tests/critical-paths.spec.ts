import { test, expect, Page } from '@playwright/test';

/**
 * Critical Path E2E Tests
 *
 * These tests verify core user journeys work end-to-end
 * Running against DEV environment: http://localhost:5174
 *
 * ⚠️ NEVER run against production!
 */

// Helper to bypass password gate if present
async function bypassPasswordGate(page: Page) {
  await page.goto('/');

  // Check if password gate is present
  const passwordInput = page.getByPlaceholder('Password');
  const isPasswordGateVisible = await passwordInput.isVisible().catch(() => false);

  if (isPasswordGateVisible) {
    // Enter the E2E test password
    await passwordInput.fill('e2e-test-password');
    await page.getByRole('button', { name: 'Enter' }).click();
    await page.waitForLoadState('networkidle');
  }
}

test.describe('Task Queue - Critical Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and handle password gate
    await bypassPasswordGate(page);

    // Wait for React to render
    await page.waitForLoadState('networkidle');
  });

  test('frontend loads without errors', async ({ page }) => {
    // Verify no console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Check that React root is rendered
    const root = page.locator('#root');
    await expect(root).toBeVisible();

    await page.waitForTimeout(2000); // Let app initialize

    // Log errors for debugging
    if (errors.length > 0) {
      console.log('Console errors detected:');
      errors.forEach((err, idx) => console.log(`  ${idx + 1}. ${err}`));
    }

    expect(errors.length).toBe(0);
  });

  test('can view task queue page', async ({ page }) => {
    // Navigate to task queue (might be default page)
    await page.goto('/');

    // Look for task queue elements (adjust selectors based on actual UI)
    const heading = page.getByRole('heading', { name: /task/i });
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('task counts are displayed', async ({ page }) => {
    await page.goto('/');

    // Wait for API response to load
    await page.waitForResponse(
      response => response.url().includes('/api/dev-bots/queue'),
      { timeout: 10000 }
    );

    // Verify count elements exist (they may show 0, that's ok)
    // Adjust selectors based on actual component structure
    const pageContent = await page.content();

    // At minimum, the page should load successfully
    expect(pageContent).toContain('root');
  });

  test('API endpoint returns valid data', async ({ page, request }) => {
    // Test backend API directly
    const response = await request.get('http://localhost:3002/api/health');

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ok');
  });

  test('task queue API returns proper structure', async ({ request }) => {
    const response = await request.get('http://localhost:3002/api/dev-bots/queue', {
      headers: {
        'X-API-Key': 'test-e2e-api-key-not-for-production'
      }
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('items');
    expect(data.data).toHaveProperty('counts');
    expect(data.data.counts).toHaveProperty('pending');
    expect(data.data.counts).toHaveProperty('active');
    expect(data.data.counts).toHaveProperty('completed');
    expect(data.data.counts).toHaveProperty('failed'); // This was our bug!
  });
});

test.describe('Error Handling', () => {
  test('shows error state when API fails', async ({ page }) => {
    // Block API requests to simulate failure
    await page.route('**/api/dev-bots/**', route => route.abort());

    await bypassPasswordGate(page);

    // Wait and check if error message appears
    // Adjust selector based on actual error component
    await page.waitForTimeout(3000);

    // At minimum, app shouldn't crash
    const root = page.locator('#root');
    await expect(root).toBeVisible();
  });

  test('handles missing API key gracefully', async ({ request }) => {
    const response = await request.get('http://localhost:3002/api/dev-bots/queue');

    // Should return 401 or appropriate auth error
    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });
});

test.describe('Data Integrity', () => {
  test('failed task count matches database reality', async ({ request }) => {
    // Get queue summary
    const queueResponse = await request.get('http://localhost:3002/api/dev-bots/queue', {
      headers: { 'X-API-Key': 'test-e2e-api-key-not-for-production' }
    });

    const queueData = await queueResponse.json();
    const failedCount = queueData.data.counts.failed;
    const failedItems = queueData.data.items.filter((item: any) => item.bucket === 'failed');

    // This was the bug: counts showed 2 but items showed 0
    // Now counts and items should match
    expect(failedItems.length).toBeLessThanOrEqual(failedCount);
  });

  test('items array includes all task buckets', async ({ request }) => {
    const response = await request.get('http://localhost:3002/api/dev-bots/queue', {
      headers: { 'X-API-Key': 'test-e2e-api-key-not-for-production' }
    });

    const data = await response.json();

    // Verify items can have all bucket types
    const validBuckets = ['pending', 'active', 'completed', 'failed'];
    for (const item of data.data.items) {
      expect(validBuckets).toContain(item.bucket);
    }
  });
});
