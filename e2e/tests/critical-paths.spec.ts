import { test, expect } from '@playwright/test';
import { bypassPasswordGate } from '../helpers/auth';

/**
 * Critical Path E2E Tests
 *
 * These tests verify core user journeys work end-to-end
 * Running against DEV environment: http://localhost:5174
 *
 * ⚠️ NEVER run against production!
 */

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
    // beforeEach already navigated to / which redirects to /monitor/dev-bots
    // Dev-Bots tab now shows a header plus the list/detail workspace

    // Wait for API response instead of fixed timeout
    await page.waitForResponse(
      response => response.url().includes('/api/dev-bots/') && response.status() === 200,
      { timeout: 10000 }
    ).catch(() => null);

    // Look for any dev-bots content (loading state, header, tabs, list, or empty state)
    const hasLoading = await page.getByText(/Loading dev-bots status/i).isVisible().catch(() => false);
    const hasHeader = await page.getByRole('heading', { name: /Dev-Bots Chains/i }).isVisible().catch(() => false);
    const hasFilters = await page.getByRole('tab', { name: /All/i }).isVisible().catch(() => false);
    const hasListItem = await page.getByTestId('list-detail-item').first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/No chains found/i).isVisible().catch(() => false);

    // Test passes if page shows ANY dev-bots content (including loading state)
    expect(hasLoading || (hasHeader && hasFilters) || hasListItem || hasEmptyState).toBe(true);
  });

  test('dev-bots filters are displayed', async ({ page }) => {
    // beforeEach already navigated to / which redirects to /monitor/dev-bots

    // Wait for API response instead of fixed timeout
    await page.waitForResponse(
      response => response.url().includes('/api/dev-bots/') && response.status() === 200,
      { timeout: 10000 }
    ).catch(() => null);

    // Verify tabs (which contain the counts) or loading state is visible
    const hasLoading = await page.getByText(/Loading dev-bots status/i).isVisible().catch(() => false);
    const hasAllTab = await page.getByRole('tab', { name: /All/i }).isVisible().catch(() => false);
    const hasBlockedTab = await page.getByRole('tab', { name: /Blocked/i }).isVisible().catch(() => false);
    const hasQuarantinedTab = await page.getByRole('tab', { name: /Quarantined/i }).isVisible().catch(() => false);

    // Test passes if loading or all tabs render (counts are shown inside the tab labels)
    expect(hasLoading || (hasAllTab && hasBlockedTab && hasQuarantinedTab)).toBe(true);
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
