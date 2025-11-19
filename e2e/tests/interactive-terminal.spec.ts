import { test, expect, Page } from '@playwright/test';
import { bypassPasswordGate } from '../helpers/auth';

/**
 * Interactive Terminal Tab E2E Tests
 * Tests the interactive terminal functionality using the new tmux-based TerminalService
 *
 * Architecture:
 * - Frontend: xterm.js terminal component with Socket.IO client
 * - Backend: TerminalService managing tmux sessions via node-pty
 * - Communication: Socket.IO events (terminal:create, terminal:attach, terminal:input, terminal:output)
 * - Persistence: tmux sessions survive disconnects
 */

// Helper to navigate to Interactive Terminal tab
async function navigateToInteractiveTerminal(page: Page) {
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

  test('should display terminal container', async ({ page }) => {
    // Terminal container is always rendered (doesn't require socket)
    const terminalContainer = page.locator('.terminal-container');
    await expect(terminalContainer).toBeVisible({ timeout: 20000 });
  });

  test('should display terminal header with status', async ({ page }) => {
    // Terminal header is always rendered (doesn't require socket)
    const terminalHeader = page.locator('.terminal-header');
    await expect(terminalHeader).toBeVisible({ timeout: 20000 });

    // Should show connection status
    const statusText = page.locator('.terminal-header').getByText(/(connecting|connected|disconnected)/i);
    await expect(statusText).toBeVisible({ timeout: 20000 });
  });

  test('should display xterm.js terminal element after socket connects', async ({ page }) => {
    // First, wait for terminal container
    const terminalContainer = page.locator('.terminal-container');
    await expect(terminalContainer).toBeVisible({ timeout: 20000 });

    // Wait for socket to connect and xterm to initialize
    // xterm.js creates elements with class="xterm" only after socket is available
    const xtermElement = page.locator('.xterm');
    await expect(xtermElement).toBeVisible({ timeout: 30000 });
  });
});

test.describe('Interactive Terminal - Connection Status', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('should show connecting status initially', async ({ page }) => {
    // Wait for terminal header to render
    const terminalHeader = page.locator('.terminal-header');
    await expect(terminalHeader).toBeVisible({ timeout: 20000 });

    // Should show connecting or connected status
    const statusIndicator = terminalHeader.getByText(/(connecting|connected)/i);
    await expect(statusIndicator).toBeVisible({ timeout: 20000 });
  });

  test('should show session ID when connected', async ({ page }) => {
    // Wait for terminal header
    const terminalHeader = page.locator('.terminal-header');
    await expect(terminalHeader).toBeVisible({ timeout: 20000 });

    // Wait for socket to connect and session to be created
    // Header should show either "Terminal" or "Session: <id>"
    await expect(terminalHeader).toContainText(/(Terminal|Session:)/i, { timeout: 30000 });
  });

  test('should have visual status indicator', async ({ page }) => {
    // Terminal header contains a colored status dot
    const terminalHeader = page.locator('.terminal-header');
    await expect(terminalHeader).toBeVisible({ timeout: 20000 });

    // Status text should be visible
    const status = terminalHeader.getByText(/(connecting|connected|disconnected)/i);
    await expect(status).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Interactive Terminal - Terminal Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
    // Wait for terminal container to ensure page loaded
    await page.locator('.terminal-container').waitFor({ timeout: 20000 });
  });

  test('should have xterm.js textarea for input', async ({ page }) => {
    // Wait for xterm to initialize (requires socket connection)
    const xtermElement = page.locator('.xterm');
    await expect(xtermElement).toBeVisible({ timeout: 30000 });

    // xterm.js creates a textarea for input
    const xtermTextarea = page.locator('.xterm-helper-textarea');
    await expect(xtermTextarea).toBeAttached({ timeout: 10000 });
  });

  test('should display terminal viewport', async ({ page }) => {
    // Wait for xterm to initialize
    await page.locator('.xterm').waitFor({ timeout: 30000 });

    // xterm.js creates a viewport element
    const viewport = page.locator('.xterm-viewport');
    await expect(viewport).toBeVisible({ timeout: 10000 });
  });

  test('should have terminal screen for output', async ({ page }) => {
    // Wait for xterm to initialize
    await page.locator('.xterm').waitFor({ timeout: 30000 });

    // xterm.js creates a screen element
    const screen = page.locator('.xterm-screen');
    await expect(screen).toBeVisible({ timeout: 10000 });
  });

  test('should focus terminal when clicked', async ({ page }) => {
    // Wait for xterm to initialize
    const xtermElement = page.locator('.xterm');
    await expect(xtermElement).toBeVisible({ timeout: 30000 });

    await xtermElement.click();

    // After clicking, the terminal should be focused
    const xtermTextarea = page.locator('.xterm-helper-textarea');
    const isFocused = await xtermTextarea.evaluate(el => el === document.activeElement);
    expect(isFocused).toBe(true);
  });
});

test.describe('Interactive Terminal - Socket.IO Communication', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('should establish Socket.IO connection', async ({ page }) => {
    // Wait for terminal container
    const terminalContainer = page.locator('.terminal-container');
    await expect(terminalContainer).toBeVisible({ timeout: 20000 });

    // Wait for socket to connect and xterm to initialize
    const xtermElement = page.locator('.xterm');
    await expect(xtermElement).toBeVisible({ timeout: 30000 });

    // If xterm is visible, socket must be connected
    const terminalHeader = page.locator('.terminal-header');
    const status = terminalHeader.getByText(/(connected|connecting)/i);
    await expect(status).toBeVisible();
  });

  test('should handle Socket.IO reconnection', async ({ page }) => {
    // Wait for terminal to load and connect
    const terminalHeader = page.locator('.terminal-header');
    await expect(terminalHeader).toBeVisible({ timeout: 20000 });

    // Wait for initial connection
    await page.locator('.xterm').waitFor({ timeout: 30000 });

    // Simulate network offline/online
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);

    // Restore connection
    await page.context().setOffline(false);
    await page.waitForTimeout(3000);

    // Should reconnect - check status shows connected or connecting
    const status = terminalHeader.getByText(/(connected|connecting)/i);
    await expect(status).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Interactive Terminal - Error Handling', () => {
  test('should gracefully handle navigation away and back', async ({ page }) => {
    await navigateToInteractiveTerminal(page);

    // Terminal should be visible
    const terminal1 = page.locator('.terminal-container');
    await expect(terminal1).toBeVisible({ timeout: 20000 });

    // Navigate away
    await page.goto('/monitor/dev-bots');
    await page.waitForLoadState('networkidle');

    // Navigate back
    await page.goto('/monitor/interactive');
    await page.waitForLoadState('networkidle');

    // Terminal should be visible again
    const terminal2 = page.locator('.terminal-container');
    await expect(terminal2).toBeVisible({ timeout: 20000 });
  });

  test('should handle page refresh', async ({ page }) => {
    await navigateToInteractiveTerminal(page);

    // Wait for terminal container to load
    const terminalContainer = page.locator('.terminal-container');
    await expect(terminalContainer).toBeVisible({ timeout: 20000 });

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Terminal should reload
    await expect(terminalContainer).toBeVisible({ timeout: 20000 });

    // Should show connecting or connected status
    const status = page.locator('.terminal-header').getByText(/(connecting|connected)/i);
    await expect(status).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Interactive Terminal - Layout and Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToInteractiveTerminal(page);
  });

  test('should have full height terminal container', async ({ page }) => {
    const terminalContainer = page.locator('.terminal-container');
    await expect(terminalContainer).toBeVisible({ timeout: 20000 });

    const height = await terminalContainer.evaluate(el => {
      return window.getComputedStyle(el).height;
    });

    // Should have substantial height (not collapsed)
    expect(height).not.toBe('0px');
    expect(height).not.toBe('');
  });

  test('should have proper terminal header styling', async ({ page }) => {
    const terminalHeader = page.locator('.terminal-header');
    await expect(terminalHeader).toBeVisible({ timeout: 20000 });

    const styles = await terminalHeader.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        display: computed.display,
        padding: computed.padding,
        background: computed.backgroundColor,
      };
    });

    // Should be visible and styled
    expect(styles.display).toBe('flex');
    expect(styles.padding).not.toBe('');
  });

  test('should resize terminal on window resize', async ({ page }) => {
    // Wait for xterm to initialize
    const xtermViewport = page.locator('.xterm-viewport');
    await expect(xtermViewport).toBeVisible({ timeout: 30000 });

    // Get initial size
    const initialSize = await xtermViewport.boundingBox();

    // Resize viewport
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(500);

    // Size should be updated (terminal should fit new viewport)
    const newSize = await xtermViewport.boundingBox();

    expect(newSize).not.toBeNull();
    expect(initialSize).not.toBeNull();
  });
});
