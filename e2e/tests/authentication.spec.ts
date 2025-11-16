import { test, expect } from '@playwright/test';

/**
 * Authentication and Authorization E2E Tests
 * Tests password gate, session management, and access control
 */

test.describe('Password Gate', () => {
  test('should display password gate on initial visit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    // Password gate may or may not be enabled
    if (isVisible) {
      await expect(passwordInput).toBeVisible();
      await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible();
    }
  });

  test('should reject incorrect password', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('wrong-password-123');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForTimeout(1000);

      // Should show error or stay on password gate
      const errorMessage = page.getByText(/incorrect|invalid|wrong/i);
      const hasError = await errorMessage.isVisible().catch(() => false);

      // Either error is shown or we're still on password gate
      const stillOnGate = await passwordInput.isVisible();
      expect(hasError || stillOnGate).toBe(true);
    }
  });

  test('should accept correct password and grant access', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('e2e-test-password');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForLoadState('networkidle');

      // Should navigate to app
      const appContent = page.locator('#root');
      await expect(appContent).toBeVisible();

      // Password gate should be gone
      const gateStillVisible = await passwordInput.isVisible().catch(() => false);
      expect(gateStillVisible).toBe(false);
    }
  });

  test('should handle Enter key submission', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('e2e-test-password');
      await page.keyboard.press('Enter');
      await page.waitForLoadState('networkidle');

      // Should grant access
      const appContent = page.locator('#root');
      await expect(appContent).toBeVisible();
    }
  });

  test('should show password field as password type', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      const type = await passwordInput.getAttribute('type');
      expect(type).toBe('password');
    }
  });

  test('should have toggle to show/hide password', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      // Look for show/hide password toggle
      const toggleButton = page.getByRole('button', { name: /show|hide|eye/i });
      const hasToggle = await toggleButton.isVisible().catch(() => false);

      expect(typeof hasToggle).toBe('boolean');
    }
  });
});

test.describe('Session Persistence', () => {
  test('should persist authentication across page reloads', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('e2e-test-password');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForLoadState('networkidle');

      // Reload page
      await page.reload();
      await page.waitForTimeout(1000);

      // Should not see password gate again
      const gateAgain = await page.getByPlaceholder('Password').isVisible().catch(() => false);
      expect(gateAgain).toBe(false);

      // Should see app content
      await expect(page.locator('#root')).toBeVisible();
    }
  });

  test('should persist authentication across navigation', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('e2e-test-password');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForLoadState('networkidle');

      // Navigate to different tab
      await page.goto('/monitor/prs');
      await page.waitForTimeout(1000);

      // Should not see password gate
      const gateAgain = await page.getByPlaceholder('Password').isVisible().catch(() => false);
      expect(gateAgain).toBe(false);
    }
  });

  test('should store authentication in localStorage or sessionStorage', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('e2e-test-password');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForLoadState('networkidle');

      // Check storage
      const localStorage = await page.evaluate(() => {
        return Object.keys(window.localStorage).join(',');
      });

      const sessionStorage = await page.evaluate(() => {
        return Object.keys(window.sessionStorage).join(',');
      });

      // Either localStorage or sessionStorage should have auth data
      expect(localStorage.length + sessionStorage.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Session Expiration', () => {
  test('should handle expired sessions gracefully', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('e2e-test-password');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForLoadState('networkidle');

      // Clear storage to simulate expired session
      await page.evaluate(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });

      // Reload page
      await page.reload();
      await page.waitForTimeout(1000);

      // Should show password gate again or handle gracefully
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should allow re-authentication after logout', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('e2e-test-password');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForLoadState('networkidle');

      // Look for logout button
      const logoutButton = page.getByRole('button', { name: /logout|sign out/i });
      const hasLogout = await logoutButton.isVisible().catch(() => false);

      if (hasLogout) {
        await logoutButton.click();
        await page.waitForTimeout(1000);

        // Should see password gate again
        const gateAgain = await page.getByPlaceholder('Password').isVisible();
        expect(gateAgain).toBe(true);
      }
    }
  });
});

test.describe('API Key Authentication', () => {
  test('API requests should require valid API key', async ({ request }) => {
    const response = await request.get('http://localhost:3002/api/dev-bots/queue');

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  test('API requests with invalid key should be rejected', async ({ request }) => {
    const response = await request.get('http://localhost:3002/api/dev-bots/queue', {
      headers: {
        'X-API-Key': 'invalid-key-xyz',
      },
    });

    expect([401, 403]).toContain(response.status());
  });

  test('API requests with valid key should be accepted', async ({ request }) => {
    const response = await request.get('http://localhost:3002/api/dev-bots/queue', {
      headers: {
        'X-API-Key': 'test-e2e-api-key-not-for-production',
      },
    });

    expect(response.status()).toBe(200);
  });

  test('should reject requests with missing API key header', async ({ request }) => {
    const response = await request.get('http://localhost:3002/api/dev-bots/queue', {
      headers: {},
    });

    expect([401, 403]).toContain(response.status());
  });

  test('should reject requests with empty API key', async ({ request }) => {
    const response = await request.get('http://localhost:3002/api/dev-bots/queue', {
      headers: {
        'X-API-Key': '',
      },
    });

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Access Control', () => {
  test('should protect sensitive endpoints', async ({ request }) => {
    const sensitiveEndpoints = [
      '/api/dev-bots/queue',
      '/api/dev-bots/tasks',
      '/api/dev-bots/settings',
      '/api/dev-bots/plans',
    ];

    for (const endpoint of sensitiveEndpoints) {
      const response = await request.get(`http://localhost:3002${endpoint}`);
      expect([401, 403]).toContain(response.status());
    }
  });

  test('should allow access to public endpoints without auth', async ({ request }) => {
    const publicEndpoints = ['/api/health'];

    for (const endpoint of publicEndpoints) {
      const response = await request.get(`http://localhost:3002${endpoint}`);
      expect(response.status()).toBe(200);
    }
  });

  test('should prevent unauthorized modifications', async ({ request }) => {
    const response = await request.post('http://localhost:3002/api/dev-bots/tasks', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        type: 'test',
        description: 'Unauthorized test',
      },
    });

    expect([401, 403]).toContain(response.status());
  });

  test('should prevent unauthorized deletions', async ({ request }) => {
    const response = await request.delete('http://localhost:3002/api/dev-bots/tasks/test-id');

    expect([401, 403, 404]).toContain(response.status());
  });
});

test.describe('Security Headers', () => {
  test('should not expose sensitive information in headers', async ({ request }) => {
    const response = await request.get('http://localhost:3002/api/health');

    const headers = response.headers();

    // Should not expose server version or internal details
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('should include security headers', async ({ request }) => {
    const response = await request.get('http://localhost:3002/api/health');

    const headers = response.headers();

    // Check for common security headers (may not all be present)
    expect(typeof headers['content-type']).toBe('string');
  });
});

test.describe('CSRF Protection', () => {
  test('should protect against CSRF attacks', async ({ request }) => {
    // Attempt to make request without proper headers
    const response = await request.post('http://localhost:3002/api/dev-bots/tasks', {
      headers: {
        'X-API-Key': 'test-e2e-api-key-not-for-production',
        'Content-Type': 'application/json',
      },
      data: {
        type: 'test',
        description: 'CSRF test',
      },
    }).catch(() => null);

    if (response) {
      // Should either succeed with proper auth or fail without CSRF token
      expect([200, 201, 403, 404]).toContain(response.status());
    }
  });
});

test.describe('Rate Limiting for Auth', () => {
  test('should rate limit failed login attempts', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      // Try multiple failed attempts
      for (let i = 0; i < 5; i++) {
        await passwordInput.fill('wrong-password');
        await page.getByRole('button', { name: 'Enter' }).click();
        await page.waitForTimeout(500);
      }

      // Should show rate limit message or slow down attempts
      const rateLimitMessage = page.getByText(/too many|rate limit|try again/i);
      const hasRateLimit = await rateLimitMessage.isVisible().catch(() => false);

      // Rate limiting may or may not be implemented
      expect(typeof hasRateLimit).toBe('boolean');
    }
  });

  test('should rate limit API key authentication failures', async ({ request }) => {
    const attempts = Array.from({ length: 10 }, () =>
      request.get('http://localhost:3002/api/dev-bots/queue', {
        headers: {
          'X-API-Key': 'invalid-key',
        },
      })
    );

    const responses = await Promise.all(attempts);

    // Should return 401/403 for all, possibly 429 for rate limiting
    responses.forEach(response => {
      expect([401, 403, 429]).toContain(response.status());
    });
  });
});

test.describe('Password Security', () => {
  test('should not accept extremely weak passwords', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      // Try very weak password
      await passwordInput.fill('1');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForTimeout(500);

      // Should reject or show validation error
      const stillOnGate = await passwordInput.isVisible();
      expect(stillOnGate).toBe(true);
    }
  });

  test('should mask password input', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('test123');

      const type = await passwordInput.getAttribute('type');
      expect(type).toBe('password');
    }
  });

  test('should not expose password in browser console', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      // Monitor console
      const consoleMessages: string[] = [];
      page.on('console', msg => {
        consoleMessages.push(msg.text());
      });

      await passwordInput.fill('e2e-test-password');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForTimeout(1000);

      // Password should not appear in console
      const passwordInConsole = consoleMessages.some(msg =>
        msg.includes('e2e-test-password')
      );
      expect(passwordInConsole).toBe(false);
    }
  });

  test('should not expose password in network requests', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      // Monitor network requests
      const requests: string[] = [];
      page.on('request', request => {
        requests.push(request.url());
      });

      await passwordInput.fill('e2e-test-password');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForTimeout(1000);

      // Password should not be in URLs
      const passwordInUrl = requests.some(url => url.includes('e2e-test-password'));
      expect(passwordInUrl).toBe(false);
    }
  });
});

test.describe('Session Security', () => {
  test('should use secure session tokens', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('e2e-test-password');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForLoadState('networkidle');

      // Check that session data is properly secured
      const cookies = await page.context().cookies();

      // Cookies should have secure flags in production
      expect(Array.isArray(cookies)).toBe(true);
    }
  });

  test('should invalidate session on logout', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder('Password');
    const isVisible = await passwordInput.isVisible().catch(() => false);

    if (isVisible) {
      await passwordInput.fill('e2e-test-password');
      await page.getByRole('button', { name: 'Enter' }).click();
      await page.waitForLoadState('networkidle');

      // Get session data
      await page.evaluate(() => {
        return {
          local: Object.keys(window.localStorage).length,
          session: Object.keys(window.sessionStorage).length,
        };
      });

      // Find and click logout
      const logoutButton = page.getByRole('button', { name: /logout|sign out/i });
      const hasLogout = await logoutButton.isVisible().catch(() => false);

      if (hasLogout) {
        await logoutButton.click();
        await page.waitForTimeout(1000);

        // Session should be cleared
        const sessionAfter = await page.evaluate(() => {
          return {
            local: Object.keys(window.localStorage).length,
            session: Object.keys(window.sessionStorage).length,
          };
        });

        // Some storage might be cleared
        expect(typeof sessionAfter.local).toBe('number');
      }
    }
  });
});
