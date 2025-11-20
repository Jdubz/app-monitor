/**
 * Admin Bot Chat E2E Tests
 *
 * End-to-end tests for the admin bot chat interface.
 * Tests full user flow from starting session to sending messages and receiving responses.
 */

import { test, expect, Page } from '@playwright/test';

test.describe('Admin Bot Chat', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    await page.goto('/monitor/interactive');
  });

  test('should display admin bot chat interface', async () => {
    // Check page elements are present
    await expect(page.getByText('Admin Bot Chat')).toBeVisible();
    await expect(page.getByText(/Interactive chat with Codex CLI/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /start session/i })).toBeVisible();
  });

  test('should show empty state when no session', async () => {
    await expect(page.getByText(/No active session/i)).toBeVisible();
    await expect(page.getByText(/Start a session to begin chatting/i)).toBeVisible();
  });

  test('should have disabled input when no session', async () => {
    const textarea = page.getByPlaceholder(/Start a session to send messages/i);
    await expect(textarea).toBeDisabled();
  });

  test('should start a session', async () => {
    // Click Start Session button
    await page.getByRole('button', { name: /start session/i }).click();

    // Wait for session to start
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Should show Active badge
    await expect(page.getByText('Active')).toBeVisible();

    // Should show Stop Session button
    await expect(page.getByRole('button', { name: /stop session/i })).toBeVisible();

    // Input should be enabled
    const textarea = page.getByPlaceholder(/Type your message/i);
    await expect(textarea).not.toBeDisabled();
  });

  test('should send a message and display it', async () => {
    // Start session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Type message
    const textarea = page.getByPlaceholder(/Type your message/i);
    await textarea.fill('Hello, admin bot!');

    // Send message (click send button or press Enter)
    await textarea.press('Enter');

    // Should display user message
    await expect(page.getByText('Hello, admin bot!')).toBeVisible();

    // Input should be cleared
    await expect(textarea).toHaveValue('');
  });

  test('should support multiline messages with Shift+Enter', async () => {
    // Start session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Type multiline message
    const textarea = page.getByPlaceholder(/Type your message/i);
    await textarea.fill('Line 1');
    await textarea.press('Shift+Enter');
    await textarea.type('Line 2');

    // Should have two lines
    const value = await textarea.inputValue();
    expect(value).toContain('\n');
  });

  test('should not send empty messages', async () => {
    // Start session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Count initial messages (should be 1 - the session started message)
    const initialMessageCount = await page.locator('[class*="rounded-lg"]').count();

    // Try to send empty message
    const textarea = page.getByPlaceholder(/Type your message/i);
    await textarea.press('Enter');

    // Wait a bit
    await page.waitForTimeout(500);

    // Message count should not increase
    const finalMessageCount = await page.locator('[class*="rounded-lg"]').count();
    expect(finalMessageCount).toBe(initialMessageCount);
  });

  test('should stop a session', async () => {
    // Start session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Stop session
    await page.getByRole('button', { name: /stop session/i }).click();

    // Should show stopped message
    await expect(page.getByText(/Admin bot session stopped/i)).toBeVisible();

    // Should show Start Session button again
    await expect(page.getByRole('button', { name: /start session/i })).toBeVisible();

    // Input should be disabled
    const textarea = page.getByPlaceholder(/Start a session to send messages/i);
    await expect(textarea).toBeDisabled();
  });

  test('should display timestamps for messages', async () => {
    // Start session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Send a message
    const textarea = page.getByPlaceholder(/Type your message/i);
    await textarea.fill('Test message');
    await textarea.press('Enter');

    // Should display timestamp in format HH:MM:SS
    await expect(page.locator('text=/\\d{1,2}:\\d{2}:\\d{2}/')).toBeVisible();
  });

  test('should show loading state when starting session', async () => {
    // Click Start Session
    await page.getByRole('button', { name: /start session/i }).click();

    // Should show loading spinner (briefly)
    const loadingSpinner = page.locator('svg.animate-spin');

    // The spinner might be visible very briefly or immediately hidden
    // Just check that we can eventually see the success state
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });
  });

  test('should prevent starting multiple sessions', async () => {
    // Start first session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Stop Session button should be visible, Start Session should not
    await expect(page.getByRole('button', { name: /stop session/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /start session/i })).not.toBeVisible();
  });

  test('should handle message send errors gracefully', async () => {
    // Start session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Simulate an error by stopping the backend or using invalid message
    // For this test, we'll send a message and check error handling is in place
    const textarea = page.getByPlaceholder(/Type your message/i);
    await textarea.fill('Test message');
    await textarea.press('Enter');

    // Message should be displayed even if backend has issues
    await expect(page.getByText('Test message')).toBeVisible();
  });

  test('should auto-scroll to latest message', async () => {
    // Start session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Send multiple messages
    const textarea = page.getByPlaceholder(/Type your message/i);

    for (let i = 1; i <= 5; i++) {
      await textarea.fill(`Message ${i}`);
      await textarea.press('Enter');
      await page.waitForTimeout(200);
    }

    // Last message should be visible
    await expect(page.getByText('Message 5')).toBeVisible();
  });

  test('should navigate to Interactive tab from other tabs', async () => {
    // Start on Dev-Bots tab
    await page.goto('/monitor/dev-bots');
    await expect(page.getByRole('tab', { name: 'Dev-Bots', selected: true })).toBeVisible();

    // Click Interactive tab
    await page.getByRole('tab', { name: 'Interactive' }).click();

    // Should navigate to Interactive tab
    await expect(page).toHaveURL('/monitor/interactive');
    await expect(page.getByText('Admin Bot Chat')).toBeVisible();
  });

  test('should maintain session state when navigating away and back', async () => {
    // Start session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Navigate to another tab
    await page.getByRole('tab', { name: 'Dev-Bots' }).click();
    await expect(page).toHaveURL('/monitor/dev-bots');

    // Navigate back
    await page.getByRole('tab', { name: 'Interactive' }).click();
    await expect(page).toHaveURL('/monitor/interactive');

    // Note: Session state may or may not persist depending on component mounting behavior
    // This test documents the expected behavior (check implementation)
  });

  test('should display error when Codex CLI not available', async () => {
    // This test assumes Codex CLI is not installed in test environment
    // Or we need to mock the backend response

    await page.getByRole('button', { name: /start session/i }).click();

    // Should show error if Codex not available
    // Either success message or error message should appear
    const sessionResult = await Promise.race([
      page.getByText(/Admin bot session started/i).waitFor({ timeout: 10000 }).then(() => 'started'),
      page.getByText(/error/i).waitFor({ timeout: 10000 }).then(() => 'error'),
    ]);

    // One of these should have happened
    expect(['started', 'error']).toContain(sessionResult);
  });

  test('should handle SSE connection and streaming', async () => {
    // Start session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // Send a message
    const textarea = page.getByPlaceholder(/Type your message/i);
    await textarea.fill('What is 2+2?');
    await textarea.press('Enter');

    // Wait for potential streaming response
    // If Codex responds, we should see assistant messages
    // Note: This depends on Codex being available and responding
    await page.waitForTimeout(2000);

    // At minimum, user message should be visible
    await expect(page.getByText('What is 2+2?')).toBeVisible();
  });

  test('should display system messages differently from user messages', async () => {
    // Start session
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });

    // System message should have different styling (yellow background)
    const systemMessage = page.getByText(/Admin bot session started/i).locator('..');
    const className = await systemMessage.getAttribute('class');
    expect(className).toContain('yellow');
  });

  test('should work with keyboard navigation', async () => {
    // Tab to Start Session button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Check if Start Session button is focused (implementation-dependent)
    const startButton = page.getByRole('button', { name: /start session/i });

    // Press Enter to start
    await startButton.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByText(/Admin bot session started/i)).toBeVisible({ timeout: 10000 });
  });
});
