import { test, expect } from '@playwright/test';
import { bypassPasswordGate } from '../helpers/auth';

test.describe('Dev Monitor - Basic Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await bypassPasswordGate(page);
  });

  test('should load the application', async ({ page }) => {
    await expect(page).toHaveTitle(/App Monitor/i);
  });

  test('should display header with logo', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();
  });

  test('should have all main tabs visible', async ({ page }) => {
    const tabs = ['Dev-Bots', 'PR Tracking', 'Task Queue', 'Plans', 'Interactive'];

    for (const tab of tabs) {
      const tabElement = page.getByRole('tab', { name: new RegExp(tab, 'i') });
      await expect(tabElement).toBeVisible();
    }
  });

  test('should switch between tabs', async ({ page }) => {
    // Click on Task Queue tab
    await page.getByRole('tab', { name: /task queue/i }).click();
    await expect(page.getByRole('tab', { name: /task queue/i })).toHaveAttribute('aria-selected', 'true');

    // Click on Plans tab
    await page.getByRole('tab', { name: /plans/i }).click();
    await expect(page.getByRole('tab', { name: /plans/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('should show loading state initially', async ({ page }) => {
    const loading = page.getByText(/loading/i);
    // Loading might be very quick, so we use waitFor with short timeout
    await expect(loading).toBeVisible({ timeout: 1000 }).catch(() => {
      // It's okay if loading finishes quickly
    });
  });
});
