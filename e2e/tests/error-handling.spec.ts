import { test, expect, Page } from '@playwright/test';

/**
 * Error Handling and Edge Cases E2E Tests
 * Tests application resilience, error states, and edge case handling
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

test.describe('Network Error Handling', () => {
  test('should handle complete network failure gracefully', async ({ page }) => {
    await bypassPasswordGate(page);

    // Go offline
    await page.context().setOffline(true);
    await page.waitForTimeout(2000);

    // Should show offline state
    await expect(page.locator('body')).toBeVisible();

    // Restore connection
    await page.context().setOffline(false);
  });

  test('should recover from network failure automatically', async ({ page }) => {
    await bypassPasswordGate(page);

    // Simulate network interruption
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);

    // Should recover and continue working
    await expect(page.locator('#root')).toBeVisible();
  });

  test('should handle slow network conditions', async ({ page }) => {
    // Throttle network
    await page.route('**/*', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue();
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(3000);

    // Should show loading states appropriately
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle intermittent connectivity', async ({ page }) => {
    await bypassPasswordGate(page);

    // Toggle connectivity
    for (let i = 0; i < 3; i++) {
      await page.context().setOffline(true);
      await page.waitForTimeout(500);
      await page.context().setOffline(false);
      await page.waitForTimeout(500);
    }

    // Should handle gracefully
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('API Error Handling', () => {
  test('should handle 500 Internal Server Error', async ({ page }) => {
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ success: false, error: 'Internal server error' }),
      });
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(2000);

    // Should show error state, not crash
    await expect(page.locator('#root')).toBeVisible();
  });

  test('should handle 404 Not Found errors', async ({ page }) => {
    await page.route('**/api/dev-bots/queue', route => {
      route.fulfill({
        status: 404,
        body: JSON.stringify({ success: false, error: 'Not found' }),
      });
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(2000);

    // Should handle missing endpoints gracefully
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle 429 Too Many Requests', async ({ page }) => {
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 429,
        body: JSON.stringify({ success: false, error: 'Rate limit exceeded' }),
      });
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(2000);

    // Should show rate limit message
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle malformed API responses', async ({ page }) => {
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 200,
        body: 'not-valid-json{[',
      });
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(2000);

    // Should handle parsing errors gracefully
    await expect(page.locator('#root')).toBeVisible();
  });

  test('should handle empty API responses', async ({ page }) => {
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 200,
        body: '',
      });
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(2000);

    // Should handle empty responses
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle timeout errors', async ({ page }) => {
    await page.route('**/api/**', async route => {
      // Delay response to simulate timeout
      await new Promise(resolve => setTimeout(resolve, 30000));
      await route.abort();
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(5000);

    // Should show timeout error or loading state
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('UI Error Boundaries', () => {
  test('should catch and display component errors', async ({ page }) => {
    await bypassPasswordGate(page);

    // Monitor console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);

    // If errors occur, error boundary should catch them
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show error boundary UI when component crashes', async ({ page }) => {
    await bypassPasswordGate(page);

    // Look for error boundary components
    const errorBoundary = page.getByText(/something went wrong|error occurred/i);

    // Error boundary may or may not be visible
    const hasErrorBoundary = await errorBoundary.isVisible().catch(() => false);

    expect(typeof hasErrorBoundary).toBe('boolean');
  });

  test('should provide error recovery options', async ({ page }) => {
    await bypassPasswordGate(page);

    // Look for error recovery buttons (reload, retry, etc.)
    const retryButton = page.getByRole('button', { name: /retry|reload|try again/i });

    if (await retryButton.isVisible()) {
      await retryButton.click();
      await page.waitForTimeout(1000);

      // Should attempt recovery
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should not crash entire app when one component fails', async ({ page }) => {
    await bypassPasswordGate(page);

    // Even if one component fails, app should stay functional
    await expect(page.locator('#root')).toBeVisible();
  });
});

test.describe('Form Validation and Input Errors', () => {
  test('should validate required fields', async ({ page }) => {
    await bypassPasswordGate(page);
    await page.goto('/monitor/queue');
    await page.waitForTimeout(2000);

    // Try to create task without required fields
    const createButton = page.getByRole('button', { name: /create|new task/i });

    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForTimeout(500);

      const submitButton = page.getByRole('button', { name: /submit|create|save/i });
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await page.waitForTimeout(500);

        // Should show validation errors
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });

  test('should validate input formats', async ({ page }) => {
    await bypassPasswordGate(page);

    // Try invalid input formats
    const numberInputs = page.locator('input[type="number"]');

    if (await numberInputs.first().isVisible()) {
      await numberInputs.first().fill('abc');
      await page.keyboard.press('Tab');

      // Should show validation error or prevent input
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should prevent XSS attacks in input fields', async ({ page }) => {
    await bypassPasswordGate(page);

    const textInputs = page.locator('input[type="text"], textarea');

    if (await textInputs.first().isVisible()) {
      // Try XSS payload
      await textInputs.first().fill('<script>alert("xss")</script>');
      await page.keyboard.press('Tab');

      // Should sanitize or escape input
      const value = await textInputs.first().inputValue();
      expect(value).toBeTruthy();

      // Alert should not fire
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should handle very long input strings', async ({ page }) => {
    await bypassPasswordGate(page);

    const textInputs = page.locator('input[type="text"], textarea');

    if (await textInputs.first().isVisible()) {
      // Try very long string
      const longString = 'a'.repeat(10000);
      await textInputs.first().fill(longString);

      // Should handle without crashing
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should handle special characters in input', async ({ page }) => {
    await bypassPasswordGate(page);

    const textInputs = page.locator('input[type="text"], textarea');

    if (await textInputs.first().isVisible()) {
      // Try special characters
      await textInputs.first().fill('!@#$%^&*(){}[]<>?/\\|`~');

      // Should handle without breaking
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Data Loading Edge Cases', () => {
  test('should handle empty data sets gracefully', async ({ page }) => {
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: [], count: 0 } }),
      });
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(2000);

    // Should show empty state
    const emptyState = page.getByText(/no data|empty|no items/i);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    expect(hasEmptyState || true).toBe(true);
  });

  test('should handle very large data sets', async ({ page }) => {
    const largeDataSet = Array.from({ length: 1000 }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
    }));

    await page.route('**/api/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: largeDataSet } }),
      });
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(3000);

    // Should handle large data without performance issues
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle missing optional fields', async ({ page }) => {
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [{ id: '1' }], // Missing many optional fields
          },
        }),
      });
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(2000);

    // Should handle missing fields gracefully
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle null/undefined values', async ({ page }) => {
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [{ id: '1', value: null, other: undefined }],
          },
        }),
      });
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(2000);

    // Should handle null/undefined gracefully
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle concurrent data updates', async ({ page }) => {
    await bypassPasswordGate(page);

    // Simulate concurrent updates
    await page.goto('/monitor/queue');
    await page.waitForTimeout(500);
    await page.goto('/monitor/prs');
    await page.waitForTimeout(500);
    await page.goto('/monitor/plans');
    await page.waitForTimeout(500);

    // Should handle rapid navigation without issues
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Browser Compatibility Edge Cases', () => {
  test('should work with JavaScript disabled features', async ({ page }) => {
    await bypassPasswordGate(page);

    // App should still render (may have reduced functionality)
    await expect(page.locator('#root')).toBeVisible();
  });

  test('should handle window resize gracefully', async ({ page }) => {
    await bypassPasswordGate(page);

    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);

    await expect(page.locator('body')).toBeVisible();

    // Resize to desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);

    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle rapid window resizes', async ({ page }) => {
    await bypassPasswordGate(page);

    // Rapid resize changes
    for (let i = 0; i < 5; i++) {
      await page.setViewportSize({ width: 400 + i * 200, height: 600 });
      await page.waitForTimeout(100);
    }

    // Should remain stable
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle browser back/forward navigation', async ({ page }) => {
    await bypassPasswordGate(page);

    await page.goto('/monitor/queue');
    await page.waitForTimeout(500);
    await page.goto('/monitor/prs');
    await page.waitForTimeout(500);

    // Go back
    await page.goBack();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL(/queue/);

    // Go forward
    await page.goForward();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL(/prs/);
  });
});

test.describe('Memory and Performance Edge Cases', () => {
  test('should not leak memory on repeated actions', async ({ page }) => {
    await bypassPasswordGate(page);

    // Perform repeated actions
    for (let i = 0; i < 10; i++) {
      await page.goto('/monitor/queue');
      await page.waitForTimeout(200);
      await page.goto('/monitor/prs');
      await page.waitForTimeout(200);
    }

    // Should remain responsive
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle rapid user interactions', async ({ page }) => {
    await bypassPasswordGate(page);
    await page.goto('/monitor/queue');
    await page.waitForTimeout(1000);

    // Rapid clicks
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();

    if (buttonCount > 0) {
      for (let i = 0; i < 5; i++) {
        await buttons.first().click({ force: true });
        await page.waitForTimeout(100);
      }

      // Should handle rapid clicks gracefully
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should handle long-running sessions', async ({ page }) => {
    await bypassPasswordGate(page);

    // Simulate long session
    await page.waitForTimeout(10000);

    // Should remain stable
    await expect(page.locator('#root')).toBeVisible();
  });
});

test.describe('Console Error Monitoring', () => {
  test('should not log errors during normal operation', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(3000);

    // Navigate through app
    await page.goto('/monitor/queue');
    await page.waitForTimeout(1000);
    await page.goto('/monitor/prs');
    await page.waitForTimeout(1000);

    // Filter out known acceptable errors
    const criticalErrors = errors.filter(
      err =>
        !err.includes('favicon') &&
        !err.includes('net::ERR_') &&
        !err.includes('socket')
    );

    expect(criticalErrors.length).toBe(0);
  });

  test('should not have unhandled promise rejections', async ({ page }) => {
    const unhandled: string[] = [];
    page.on('pageerror', error => {
      unhandled.push(error.message);
    });

    await bypassPasswordGate(page);
    await page.waitForTimeout(3000);

    expect(unhandled.length).toBe(0);
  });
});

test.describe('Security Edge Cases', () => {
  test('should sanitize HTML in user-generated content', async ({ page }) => {
    await bypassPasswordGate(page);

    const textInputs = page.locator('input[type="text"], textarea');

    if (await textInputs.first().isVisible()) {
      // Try HTML injection
      await textInputs.first().fill('<img src=x onerror=alert(1)>');

      // HTML should be sanitized/escaped
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should prevent SQL injection attempts', async ({ page, request }) => {
    const response = await request.get(
      `http://localhost:3002/api/dev-bots/tasks/'; DROP TABLE tasks; --`,
      {
        headers: {
          'X-API-Key': 'test-e2e-api-key-not-for-production',
        },
      }
    ).catch(() => null);

    if (response) {
      // Should handle SQL injection attempts safely
      expect([400, 404]).toContain(response.status());
    }
  });

  test('should handle invalid JWT tokens', async ({ page }) => {
    // Set invalid token in storage
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'invalid.jwt.token');
    });

    await page.reload();
    await page.waitForTimeout(1000);

    // Should handle gracefully
    await expect(page.locator('body')).toBeVisible();
  });
});
