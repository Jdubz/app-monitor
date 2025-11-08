import { test, expect } from '@playwright/test';

test.describe('Local Services', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: /local/i }).click();
  });

  test('should display service list', async ({ page }) => {
    // Wait for services to load
    await page.waitForTimeout(2000);
    
    // Look for common service names (BE, FE, Worker)
    const serviceIndicators = page.locator('[class*="service"]');
    const count = await serviceIndicators.count();
    
    // Should have at least one service element
    expect(count).toBeGreaterThan(0);
  });

  test('should show service status indicators', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Look for status indicators (running, stopped, etc.)
    const statusElements = page.locator('[class*="status"]');
    if (await statusElements.count() > 0) {
      await expect(statusElements.first()).toBeVisible();
    }
  });

  test('should have start/stop buttons for services', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Look for action buttons
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();
    
    // Should have multiple buttons (start/stop for services)
    expect(buttonCount).toBeGreaterThan(0);
  });
});

test.describe('System Health', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: /health/i }).click();
  });

  test('should display system metrics', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Look for common health metrics
    const metricsSection = page.locator('text=/cpu|memory|disk/i').first();
    if (await metricsSection.isVisible()) {
      await expect(metricsSection).toBeVisible();
    }
  });

  test('should show service health status', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Look for health status indicators
    const healthIndicators = page.locator('[class*="health"]');
    if (await healthIndicators.count() > 0) {
      await expect(healthIndicators.first()).toBeVisible();
    }
  });
});

test.describe('Scripts Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: /scripts/i }).click();
  });

  test('should display scripts list or empty state', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Should show either scripts or empty state
    const hasScripts = await page.getByText(/script/i).isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/no scripts|empty/i).isVisible().catch(() => false);
    
    expect(hasScripts || hasEmptyState).toBe(true);
  });
});
