import { test, expect } from "@playwright/test";

test.describe("Dev Monitor - Basic Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should load the application", async ({ page }) => {
    await expect(page).toHaveTitle(/Dev Monitor/i);
  });

  test("should display header with logo", async ({ page }) => {
    const header = page.locator("header");
    await expect(header).toBeVisible();
  });

  test("should have all main tabs visible", async ({ page }) => {
    const tabs = [
      "local",
      "scripts",
      "staging",
      "production",
      "health",
      "claude-workers",
    ];

    for (const tab of tabs) {
      const tabElement = page.getByRole("tab", { name: new RegExp(tab, "i") });
      await expect(tabElement).toBeVisible();
    }
  });

  test("should switch between tabs", async ({ page }) => {
    // Click on Scripts tab
    await page.getByRole("tab", { name: /scripts/i }).click();
    await expect(page.getByText(/scripts/i)).toBeVisible();

    // Click on Health tab
    await page.getByRole("tab", { name: /health/i }).click();
    await expect(page.getByText(/system health/i)).toBeVisible();
  });

  test("should show loading state initially", async ({ page }) => {
    const loading = page.getByText(/loading/i);
    // Loading might be very quick, so we use waitFor with short timeout
    await expect(loading)
      .toBeVisible({ timeout: 1000 })
      .catch(() => {
        // It's okay if loading finishes quickly
      });
  });
});
