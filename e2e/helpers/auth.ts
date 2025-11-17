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
