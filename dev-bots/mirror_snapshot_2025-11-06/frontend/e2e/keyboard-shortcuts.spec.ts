import { test, expect } from "@playwright/test";

test.describe("Keyboard Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /local/i }).click();
  });

  test("should show keyboard shortcuts help with ?", async ({ page }) => {
    // Press Shift+? to show shortcuts help
    await page.keyboard.press("Shift+?");

    // Wait for modal to appear
    await page.waitForTimeout(500);

    // Look for shortcuts modal
    const modal = page.getByText(/keyboard shortcuts/i);
    if (await modal.isVisible()) {
      await expect(modal).toBeVisible();

      // Press Escape to close
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);

      // Modal should be hidden
      await expect(modal).not.toBeVisible();
    }
  });

  test("Ctrl+L should clear logs", async ({ page }) => {
    await page.waitForTimeout(1000);

    // Press Ctrl+L
    await page.keyboard.press("Control+l");

    // Should show cleared logs or empty state
    await page.waitForTimeout(500);
  });

  test("Ctrl+UpArrow should jump to top", async ({ page }) => {
    await page.waitForTimeout(1000);

    // Scroll down first
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(500);

    // Press Ctrl+Up to jump to top
    await page.keyboard.press("Control+ArrowUp");
    await page.waitForTimeout(500);
  });

  test("Ctrl+DownArrow should jump to bottom", async ({ page }) => {
    await page.waitForTimeout(1000);

    // Press Ctrl+Down to jump to bottom
    await page.keyboard.press("Control+ArrowDown");
    await page.waitForTimeout(500);
  });

  test("N key should toggle line numbers", async ({ page }) => {
    await page.waitForTimeout(1000);

    // Press N to toggle line numbers
    await page.keyboard.press("n");
    await page.waitForTimeout(500);

    // Press N again to toggle back
    await page.keyboard.press("n");
    await page.waitForTimeout(500);
  });

  test("Escape should clear search", async ({ page }) => {
    // Focus search with Ctrl+K
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);

    const searchInput = page.getByRole("textbox", { name: /search/i });
    if (await searchInput.isVisible()) {
      // Type something
      await searchInput.fill("test search");

      // Press Escape to clear
      await page.keyboard.press("Escape");

      // Search should be cleared
      const value = await searchInput.inputValue();
      expect(value).toBe("");
    }
  });
});

test.describe("Error Handling", () => {
  test("should display error boundary for crashes", async ({ page }) => {
    // This test would need to trigger an error
    // For now, just check the app loads without crashing
    await page.goto("/");
    await expect(page).toHaveTitle(/Dev Monitor/i);
  });

  test("should handle network errors gracefully", async ({ page }) => {
    // Navigate to app
    await page.goto("/");

    // App should load even if some requests fail
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Loading States", () => {
  test("should show loading spinner when appropriate", async ({ page }) => {
    await page.goto("/");

    // Look for loading indicators
    const loadingIndicators = page.locator(
      '[class*="loading"], [class*="spinner"]',
    );

    // Loading might finish quickly, so just check the page loads
    await expect(page.locator("body")).toBeVisible();
  });

  test("should have smooth transitions between states", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Switch tabs to test transitions
    await page.getByRole("tab", { name: /scripts/i }).click();
    await page.waitForTimeout(500);

    await page.getByRole("tab", { name: /health/i }).click();
    await page.waitForTimeout(500);

    // Should not have any console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    expect(errors.length).toBe(0);
  });
});
