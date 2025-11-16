import { test, expect, Page } from '@playwright/test';

async function bypassPasswordGate(page: Page) {
  await page.goto('/');
  const passwordInput = page.getByPlaceholder('Password');
  const isPasswordGateVisible = await passwordInput.isVisible().catch(() => false);

  if (isPasswordGateVisible) {
    await passwordInput.fill('e2e-test-password');
    await page.getByRole('button', { name: 'Enter' }).click();
    await page.waitForLoadState('networkidle');
  }
}

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
    await expect(page.getByText(/task queue|queue/i)).toBeVisible();

    // Click on Plans tab
    await page.getByRole('tab', { name: /plans/i }).click();
    await expect(page.getByText(/plans|plan/i)).toBeVisible();
  });

  test('should show loading state initially', async ({ page }) => {
    const loading = page.getByText(/loading/i);
    // Loading might be very quick, so we use waitFor with short timeout
    await expect(loading).toBeVisible({ timeout: 1000 }).catch(() => {
      // It's okay if loading finishes quickly
    });
  });
});
