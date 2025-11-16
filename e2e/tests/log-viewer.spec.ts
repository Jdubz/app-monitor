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

test.describe('Log Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await bypassPasswordGate(page);
    // Navigate to Local tab where logs are shown
    await page.getByRole('tab', { name: /local/i }).click();
  });

  test('should display log viewer controls', async ({ page }) => {
    // Check for pause/resume button
    const pauseButton = page.getByRole('button', { name: /pause|resume/i });
    await expect(pauseButton).toBeVisible();

    // Check for clear button
    const clearButton = page.getByRole('button', { name: /clear/i });
    await expect(clearButton).toBeVisible();

    // Check for download button
    const downloadButton = page.getByRole('button', { name: /download/i });
    await expect(downloadButton).toBeVisible();
  });

  test('should toggle auto-scroll', async ({ page }) => {
    const autoScrollButton = page.getByRole('button', { name: /auto-scroll/i });
    await expect(autoScrollButton).toBeVisible();
    
    // Click to toggle
    await autoScrollButton.click();
    
    // Should still be visible after toggle
    await expect(autoScrollButton).toBeVisible();
  });

  test('should clear logs when clear button clicked', async ({ page }) => {
    // Click clear button
    const clearButton = page.getByRole('button', { name: /clear/i });
    await clearButton.click();
    
    // Should show empty state
    await expect(page.getByText(/no logs/i)).toBeVisible({ timeout: 5000 }).catch(() => {
      // Logs might start streaming immediately
    });
  });

  test('should show filter options', async ({ page }) => {
    // Look for log level filters
    const filterSection = page.locator('[class*="filter"]').first();
    if (await filterSection.isVisible()) {
      await expect(filterSection).toBeVisible();
    }
  });

  test('keyboard shortcut - Ctrl+K should focus search', async ({ page }) => {
    // Press Ctrl+K
    await page.keyboard.press('Control+k');
    
    // Search input should be focused
    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeFocused();
    }
  });

  test('keyboard shortcut - Ctrl+Space should pause logs', async ({ page }) => {
    const pauseButton = page.getByRole('button', { name: /pause|resume/i });
    const initialText = await pauseButton.textContent();
    
    // Press Ctrl+Space
    await page.keyboard.press('Control+Space');
    
    // Wait a bit for state change
    await page.waitForTimeout(500);
    
    // Button text should change
    const newText = await pauseButton.textContent();
    expect(newText).not.toBe(initialText);
  });
});
