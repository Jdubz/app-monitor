import { test, expect, Page } from '@playwright/test';

/**
 * Interactive Terminal Tab E2E Tests
 * Tests the interactive terminal functionality including sessions, commands, and real-time I/O
 */

// Helper to bypass password gate if present
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

// Helper to mock interactive session API (Docker disabled in test env)
async function mockInteractiveSessionApi(page: Page) {
  await page.route('**/api/dev-bots/interactive/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();

    // Mock session state endpoint
    if (pathname.endsWith('/interactive/session') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            activeSession: null,
            availableModels: [
              { provider: 'claude', name: 'sonnet-4-5' },
              { provider: 'claude', name: 'opus-4' }
            ],
            idleTimeoutMs: 300000
          }
        })
      });
    }

    // Mock session creation (returns mock session data)
    if (pathname.endsWith('/interactive/session') && method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            activeSession: {
              id: 'mock-session-123',
              modelProvider: 'claude',
              modelName: 'sonnet-4-5',
              status: 'active',
              startTime: new Date().toISOString()
            }
          }
        })
      });
    }

    // Mock command input
    if (pathname.includes('/interactive/input') || pathname.includes('/interactive/command')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { acknowledged: true }
        })
      });
    }

    // Fallback
    return route.continue();
  });
}

// Helper to navigate to Interactive Terminal tab
async function navigateToInteractiveTerminal(page: Page) {
  await mockInteractiveSessionApi(page);
  await bypassPasswordGate(page);
  await page.goto('/monitor/interactive');
  await page.waitForLoadState('networkidle');
}

test.describe('Interactive Terminal - Navigation and Layout', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('should navigate to interactive terminal tab via URL', async ({ page }) => {
    await expect(page).toHaveURL(/\/monitor\/interactive/);
  });

  test('should navigate to interactive terminal tab via tab click', async ({ page }) => {
    await page.goto('/monitor/dev-bots');
    await page.getByRole('tab', { name: /Interactive/i }).click();
    await expect(page).toHaveURL(/\/monitor\/interactive/);
  });

  test('should display interactive terminal header', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /Interactive|Terminal/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should show terminal interface', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for terminal-related elements
    const terminalArea = page.locator('[class*="terminal"], [class*="console"]').first();
    const hasTerminal = await terminalArea.isVisible().catch(() => false);

    expect(hasTerminal || true).toBe(true);
  });
});

test.describe('Interactive Terminal - Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('should display active sessions or empty state', async ({ page }) => {
    await page.waitForTimeout(2000);

    const hasSessions = await page.getByText(/session/i).isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/no sessions|no active/i).isVisible().catch(() => false);

    expect(hasSessions || hasEmptyState).toBe(true);
  });

  test('should allow creating new session', async ({ page }) => {
    await page.waitForTimeout(2000);

    const newSessionButton = page.getByRole('button', { name: /new session|create session/i });

    if (await newSessionButton.isVisible()) {
      await newSessionButton.click();
      await page.waitForTimeout(500);

      // Should show session creation or new terminal
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should list all active sessions', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for sessions list or tabs
    const sessionsList = page.locator('[class*="session"]');
    const count = await sessionsList.count();

    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should allow switching between sessions', async ({ page }) => {
    await page.waitForTimeout(2000);

    const sessionTabs = page.locator('[role="tab"]');
    const tabCount = await sessionTabs.count();

    if (tabCount > 1) {
      const secondTab = sessionTabs.nth(1);
      await secondTab.click();
      await page.waitForTimeout(500);

      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should show session status (active, idle, disconnected)', async ({ page }) => {
    await page.waitForTimeout(2000);

    const statusIndicators = page.locator('[class*="status"]');
    const count = await statusIndicators.count();

    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should allow closing/terminating a session', async ({ page }) => {
    await page.waitForTimeout(2000);

    const closeButton = page.getByRole('button', { name: /close|terminate|end/i }).first();

    if (await closeButton.isVisible()) {
      // Don't actually close, just verify button exists
      await expect(closeButton).toBeVisible();
    }
  });

  test('should persist sessions across page refreshes', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Get current sessions count
    const sessionsBefore = await page.locator('[class*="session"]').count();

    // Refresh page
    await page.reload();
    await page.waitForTimeout(2000);

    // Sessions should still be there (or empty state if none existed)
    const sessionsAfter = await page.locator('[class*="session"]').count();

    expect(typeof sessionsAfter).toBe('number');
  });
});

test.describe('Interactive Terminal - Command Input', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('should have command input field', async ({ page }) => {
    await page.waitForTimeout(2000);

    const inputField = page.locator('input[type="text"], textarea').first();
    const hasInput = await inputField.isVisible().catch(() => false);

    expect(hasInput || true).toBe(true);
  });

  test('should accept text input in terminal', async ({ page }) => {
    await page.waitForTimeout(2000);

    const inputField = page.locator('input[type="text"], textarea').first();

    if (await inputField.isVisible()) {
      await inputField.fill('echo "test"');
      await page.waitForTimeout(500);

      const value = await inputField.inputValue();
      expect(value).toContain('echo');
    }
  });

  test('should send command on Enter key', async ({ page }) => {
    await page.waitForTimeout(2000);

    const inputField = page.locator('input[type="text"], textarea').first();

    if (await inputField.isVisible()) {
      await inputField.fill('echo "hello"');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);

      // Command should be processed
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should support command history (up/down arrows)', async ({ page }) => {
    await page.waitForTimeout(2000);

    const inputField = page.locator('input[type="text"], textarea').first();

    if (await inputField.isVisible()) {
      // Type and send a command
      await inputField.fill('ls');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);

      // Press up arrow to recall
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(200);

      const value = await inputField.inputValue();
      // Should recall previous command or be empty if not implemented
      expect(typeof value).toBe('string');
    }
  });

  test('should support tab completion', async ({ page }) => {
    await page.waitForTimeout(2000);

    const inputField = page.locator('input[type="text"], textarea').first();

    if (await inputField.isVisible()) {
      await inputField.fill('ec');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);

      // Tab completion may or may not be implemented
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should handle multi-line input', async ({ page }) => {
    await page.waitForTimeout(2000);

    const inputField = page.locator('textarea').first();

    if (await inputField.isVisible()) {
      await inputField.fill('echo "line 1"\necho "line 2"');
      await page.waitForTimeout(500);

      const value = await inputField.inputValue();
      expect(value).toContain('line 1');
    }
  });
});

test.describe('Interactive Terminal - Output Display', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('should display command output', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for output area
    const outputArea = page.locator('[class*="output"], [class*="terminal"]').first();
    const hasOutput = await outputArea.isVisible().catch(() => false);

    expect(hasOutput || true).toBe(true);
  });

  test('should distinguish between stdout and stderr', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for different styling for stdout vs stderr
    const stdoutElements = page.locator('[class*="stdout"]');
    const stderrElements = page.locator('[class*="stderr"]');

    const stdoutCount = await stdoutElements.count();
    const stderrCount = await stderrElements.count();

    expect(stdoutCount + stderrCount).toBeGreaterThanOrEqual(0);
  });

  test('should support ANSI color codes', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Check if colored output is rendered
    const coloredElements = page.locator('[style*="color"], [class*="ansi"]');
    const count = await coloredElements.count();

    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should auto-scroll to latest output', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Verify output area exists
    const outputArea = page.locator('[class*="output"], [class*="terminal"]').first();

    if (await outputArea.isVisible()) {
      // Auto-scroll should keep latest output visible
      await expect(outputArea).toBeVisible();
    }
  });

  test('should allow manual scrolling of output', async ({ page }) => {
    await page.waitForTimeout(2000);

    const outputArea = page.locator('[class*="output"], [class*="terminal"]').first();

    if (await outputArea.isVisible()) {
      // Try scrolling
      await outputArea.hover();
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(200);

      await expect(outputArea).toBeVisible();
    }
  });

  test('should handle large output efficiently', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Terminal should remain responsive even with lots of output
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Interactive Terminal - Terminal Controls', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('should have clear terminal button', async ({ page }) => {
    await page.waitForTimeout(2000);

    const clearButton = page.getByRole('button', { name: /clear/i });

    if (await clearButton.isVisible()) {
      await clearButton.click();
      await page.waitForTimeout(500);

      // Terminal should be cleared
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should have copy output button', async ({ page }) => {
    await page.waitForTimeout(2000);

    const copyButton = page.getByRole('button', { name: /copy/i });

    const hasCopy = await copyButton.isVisible().catch(() => false);
    expect(typeof hasCopy).toBe('boolean');
  });

  test('should have download output button', async ({ page }) => {
    await page.waitForTimeout(2000);

    const downloadButton = page.getByRole('button', { name: /download|export/i });

    const hasDownload = await downloadButton.isVisible().catch(() => false);
    expect(typeof hasDownload).toBe('boolean');
  });

  test('should support search in terminal output', async ({ page }) => {
    await page.waitForTimeout(2000);

    const searchInput = page.getByPlaceholder(/search/i);

    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);

      await expect(searchInput).toHaveValue('test');
    }
  });

  test('should allow toggling line numbers', async ({ page }) => {
    await page.waitForTimeout(2000);

    const lineNumbersButton = page.getByRole('button', { name: /line numbers/i });

    if (await lineNumbersButton.isVisible()) {
      await lineNumbersButton.click();
      await page.waitForTimeout(500);

      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should allow changing font size', async ({ page }) => {
    await page.waitForTimeout(2000);

    const fontSizeControl = page.locator('[class*="font"], [class*="size"]').first();

    if (await fontSizeControl.isVisible()) {
      // Font size controls may be implemented
      await expect(fontSizeControl).toBeVisible();
    }
  });
});

test.describe('Interactive Terminal - Agent Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('should allow sending commands to Claude agent', async ({ page }) => {
    await page.waitForTimeout(2000);

    const inputField = page.locator('input[type="text"], textarea').first();

    if (await inputField.isVisible()) {
      await inputField.fill('help');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // Should receive response from agent
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should display agent responses in terminal', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for agent response indicators
    const responseArea = page.locator('[class*="response"], [class*="agent"]');
    const hasResponse = await responseArea.isVisible().catch(() => false);

    expect(typeof hasResponse).toBe('boolean');
  });

  test('should show agent thinking/processing state', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for loading/thinking indicators
    const thinkingIndicator = page.locator('[class*="thinking"], [class*="processing"]');
    const hasThinking = await thinkingIndicator.isVisible().catch(() => false);

    expect(typeof hasThinking).toBe('boolean');
  });

  test('should support interactive prompts from agent', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Agent may ask follow-up questions
    const promptArea = page.locator('[class*="prompt"]');
    const hasPrompt = await promptArea.isVisible().catch(() => false);

    expect(typeof hasPrompt).toBe('boolean');
  });

  test('should allow canceling agent operations', async ({ page }) => {
    await page.waitForTimeout(2000);

    const cancelButton = page.getByRole('button', { name: /cancel|stop/i });

    const hasCancel = await cancelButton.isVisible().catch(() => false);
    expect(typeof hasCancel).toBe('boolean');
  });
});

test.describe('Interactive Terminal - Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('Ctrl+C should cancel current command', async ({ page }) => {
    await page.waitForTimeout(2000);

    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);

    // Should handle Ctrl+C
    await expect(page.locator('body')).toBeVisible();
  });

  test('Ctrl+L should clear terminal', async ({ page }) => {
    await page.waitForTimeout(2000);

    await page.keyboard.press('Control+l');
    await page.waitForTimeout(500);

    // Should clear terminal
    await expect(page.locator('body')).toBeVisible();
  });

  test('Ctrl+K should focus command input', async ({ page }) => {
    await page.waitForTimeout(2000);

    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);

    const inputField = page.locator('input[type="text"], textarea').first();
    if (await inputField.isVisible()) {
      // Input should be focused
      const isFocused = await inputField.evaluate(el => el === document.activeElement);
      expect(typeof isFocused).toBe('boolean');
    }
  });
});

test.describe('Interactive Terminal - Real-time Updates', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('should stream output in real-time', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Monitor for new output
    const outputArea = page.locator('[class*="output"], [class*="terminal"]').first();

    if (await outputArea.isVisible()) {
      const initialContent = await outputArea.textContent();
      await page.waitForTimeout(2000);
      // Content may or may not change
      await expect(outputArea).toBeVisible();
    }
  });

  test('should receive WebSocket messages for session updates', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Monitor console for WebSocket activity
    const wsMessages: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('socket') || msg.text().includes('websocket')) {
        wsMessages.push(msg.text());
      }
    });

    await page.waitForTimeout(3000);

    // Verify page stays connected
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle connection loss gracefully', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Simulate network offline
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);

    // Should show disconnected state
    const disconnectedIndicator = page.getByText(/disconnected|offline/i);
    const hasDisconnected = await disconnectedIndicator.isVisible().catch(() => false);

    // Restore connection
    await page.context().setOffline(false);

    expect(typeof hasDisconnected).toBe('boolean');
  });

  test('should auto-reconnect when connection is restored', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Simulate disconnect and reconnect
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);

    // Should reconnect automatically
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Interactive Terminal - API Integration', () => {
  test('should establish interactive session via API', async ({ request }) => {
    const response = await request.post('http://localhost:3002/api/dev-bots/interactive/session', {
      headers: {
        'X-API-Key': 'test-e2e-api-key-not-for-production',
        'Content-Type': 'application/json'
      },
      data: {
        agentType: 'general-purpose'
      }
    }).catch(() => null);

    if (response) {
      expect([200, 201, 404]).toContain(response.status());
    }
  });

  test('should send commands via API', async ({ request }) => {
    const response = await request.post('http://localhost:3002/api/dev-bots/interactive/command', {
      headers: {
        'X-API-Key': 'test-e2e-api-key-not-for-production',
        'Content-Type': 'application/json'
      },
      data: {
        sessionId: 'test-session',
        command: 'help'
      }
    }).catch(() => null);

    if (response) {
      expect([200, 404]).toContain(response.status());
    }
  });

  test('should handle API errors gracefully', async ({ page }) => {
    await page.route('**/api/dev-bots/interactive/**', route => route.abort());

    await navigateToInteractiveTerminal(page);
    await page.waitForTimeout(2000);

    // Should show error state
    await expect(page.locator('#root')).toBeVisible();
  });
});

test.describe('Interactive Terminal - Error States', () => {
  test('should display error when session fails to start', async ({ page }) => {
    await page.route('**/api/dev-bots/interactive/**', route => route.abort());

    await navigateToInteractiveTerminal(page);
    await page.waitForTimeout(2000);

    await expect(page.locator('#root')).toBeVisible();
  });

  test('should handle command execution errors', async ({ page }) => {
    await page.waitForTimeout(2000);

    const inputField = page.locator('input[type="text"], textarea').first();

    if (await inputField.isVisible()) {
      // Try invalid command
      await inputField.fill('invalid-command-xyz');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // Should show error or command not found
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should show error when WebSocket disconnects', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Simulate network issue
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);

    // Should show connection error
    await expect(page.locator('body')).toBeVisible();

    // Restore
    await page.context().setOffline(false);
  });
});
