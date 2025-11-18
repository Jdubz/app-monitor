import { Page } from '@playwright/test';

const TEST_PASSWORD = 'e2e-test-password';

export async function authenticate(page: Page) {
  // Check if already authenticated
  const isAuth = await page.evaluate(() => {
    return sessionStorage.getItem('app-monitor-auth') === 'true';
  });

  if (isAuth) {
    return;
  }

  // Fill password and submit
  await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();

  // Wait for authentication to complete
  await page.waitForSelector('button:has-text("Logout")', { timeout: 5000 });
}

/**
 * Bypass password gate if present
 * This is a convenience function for tests that need to get past the password gate quickly
 */
export async function bypassPasswordGate(page: Page) {
  await page.goto('/');

  const passwordInput = page.getByPlaceholder('Password');
  const isPasswordGateVisible = await passwordInput.isVisible().catch(() => false);

  if (isPasswordGateVisible) {
    await passwordInput.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Enter' }).click();
    await page.waitForLoadState('networkidle');
  }
}
