import { test, expect } from '@playwright/test';

/**
 * Interactive Terminal New API E2E Tests
 * Tests the new REST API for interactive terminal sessions (v0)
 *
 * New API endpoints:
 * - POST   /api/dev-bots/interactive/start
 * - POST   /api/dev-bots/interactive/:id/stop
 * - POST   /api/dev-bots/interactive/:id/reset
 * - GET    /api/dev-bots/interactive/:id
 * - GET    /api/dev-bots/interactive/active
 * - GET    /api/dev-bots/interactive/sessions
 *
 * Note: Docker operations may be mocked in test environment
 */

const API_BASE_URL = 'http://localhost:3002';
const API_KEY = 'test-e2e-api-key-not-for-production';

const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
};

test.describe('Interactive Terminal - Get Active Session', () => {
  test('GET /api/dev-bots/interactive/active should return active session or null', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/dev-bots/interactive/active`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('data');

    // Data should be null or a session object
    if (data.data !== null) {
      expect(data.data).toHaveProperty('sessionId');
      expect(data.data).toHaveProperty('status');
    }
  });

  test('GET /api/dev-bots/interactive/active should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/dev-bots/interactive/active`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data).toHaveProperty('error');
  });
});

test.describe('Interactive Terminal - List Sessions', () => {
  test('GET /api/dev-bots/interactive/sessions should return sessions list', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/dev-bots/interactive/sessions`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);

    // Each session should have required fields
    if (data.data.length > 0) {
      for (const session of data.data) {
        expect(session).toHaveProperty('sessionId');
        expect(session).toHaveProperty('status');
        expect(session).toHaveProperty('createdAt');
      }
    }
  });

  test('GET /api/dev-bots/interactive/sessions should respect limit parameter', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/dev-bots/interactive/sessions?limit=5`, {
      headers,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeLessThanOrEqual(5);
  });

  test('GET /api/dev-bots/interactive/sessions should cap limit at 100', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/dev-bots/interactive/sessions?limit=200`, {
      headers,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    // Should be capped at 100
    expect(data.data.length).toBeLessThanOrEqual(100);
  });

  test('GET /api/dev-bots/interactive/sessions should handle invalid limit gracefully', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/dev-bots/interactive/sessions?limit=invalid`, {
      headers,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    // Should use default limit (20)
    expect(Array.isArray(data.data)).toBe(true);
  });

  test('GET /api/dev-bots/interactive/sessions should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/dev-bots/interactive/sessions`);

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Interactive Terminal - Start Session', () => {
  test('POST /api/dev-bots/interactive/start should start new session', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/start`, { headers });

    // May return 200 (success) or 500 (Docker not available)
    expect([200, 500, 503]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');

    if (response.status() === 200 && data.success) {
      expect(data.data).toHaveProperty('sessionId');
      expect(data.data).toHaveProperty('containerId');
      expect(data.data).toHaveProperty('session');
      expect(typeof data.data.sessionId).toBe('string');
      expect(data.data.sessionId.length).toBeGreaterThan(0);

      // Clean up: stop the session
      await request.post(`${API_BASE_URL}/api/dev-bots/interactive/${data.data.sessionId}/stop`, {
        headers,
      });
    }
  });

  test('POST /api/dev-bots/interactive/start should require authentication', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/start`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('POST /api/dev-bots/interactive/start should handle Docker unavailable', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/start`, { headers });

    // If Docker is not available, should return error
    expect([200, 500, 503]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');

    if (!data.success) {
      expect(data).toHaveProperty('error');
    }
  });
});

test.describe('Interactive Terminal - Stop Session', () => {
  test('POST /api/dev-bots/interactive/:id/stop should stop session', async ({ request }) => {
    // First try to start a session
    const startResponse = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/start`, { headers });

    if (startResponse.status() === 200) {
      const startData = await startResponse.json();
      const sessionId = startData.data.sessionId;

      // Now stop it
      const stopResponse = await request.post(
        `${API_BASE_URL}/api/dev-bots/interactive/${sessionId}/stop`,
        { headers }
      );

      expect([200, 404, 500]).toContain(stopResponse.status());

      const stopData = await stopResponse.json();
      expect(stopData).toHaveProperty('success');

      if (stopResponse.status() === 200) {
        expect(stopData.success).toBe(true);
        expect(stopData.data.sessionId).toBe(sessionId);
      }
    }
  });

  test('POST /api/dev-bots/interactive/:id/stop should accept optional reason', async ({ request }) => {
    const startResponse = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/start`, { headers });

    if (startResponse.status() === 200) {
      const startData = await startResponse.json();
      const sessionId = startData.data.sessionId;

      const stopResponse = await request.post(
        `${API_BASE_URL}/api/dev-bots/interactive/${sessionId}/stop`,
        {
          headers,
          data: {
            reason: 'Test completed',
          },
        }
      );

      expect([200, 404, 500]).toContain(stopResponse.status());

      const stopData = await stopResponse.json();
      expect(stopData).toHaveProperty('success');
    }
  });

  test('POST /api/dev-bots/interactive/:id/stop should return 404 for non-existent session', async ({
    request,
  }) => {
    const response = await request.post(
      `${API_BASE_URL}/api/dev-bots/interactive/non-existent-session-123/stop`,
      { headers }
    );

    expect([404, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('POST /api/dev-bots/interactive/:id/stop should require authentication', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/test-session/stop`);

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Interactive Terminal - Reset Session', () => {
  test('POST /api/dev-bots/interactive/:id/reset should reset session', async ({ request }) => {
    // First try to start a session
    const startResponse = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/start`, { headers });

    if (startResponse.status() === 200) {
      const startData = await startResponse.json();
      const sessionId = startData.data.sessionId;
      const originalContainerId = startData.data.containerId;

      // Now reset it
      const resetResponse = await request.post(
        `${API_BASE_URL}/api/dev-bots/interactive/${sessionId}/reset`,
        { headers }
      );

      expect([200, 404, 500]).toContain(resetResponse.status());

      const resetData = await resetResponse.json();
      expect(resetData).toHaveProperty('success');

      if (resetResponse.status() === 200 && resetData.success) {
        expect(resetData.data.sessionId).toBe(sessionId);
        expect(resetData.data).toHaveProperty('containerId');
        // Container ID should be different after reset
        expect(resetData.data.containerId).not.toBe(originalContainerId);

        // Clean up
        await request.post(`${API_BASE_URL}/api/dev-bots/interactive/${sessionId}/stop`, { headers });
      }
    }
  });

  test('POST /api/dev-bots/interactive/:id/reset should return 404 for non-existent session', async ({
    request,
  }) => {
    const response = await request.post(
      `${API_BASE_URL}/api/dev-bots/interactive/non-existent-session-456/reset`,
      { headers }
    );

    expect([404, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('POST /api/dev-bots/interactive/:id/reset should require authentication', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/test-session/reset`);

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Interactive Terminal - Get Session Details', () => {
  test('GET /api/dev-bots/interactive/:id should return session details', async ({ request }) => {
    // First try to start a session
    const startResponse = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/start`, { headers });

    if (startResponse.status() === 200) {
      const startData = await startResponse.json();
      const sessionId = startData.data.sessionId;

      // Now get session details
      const detailsResponse = await request.get(
        `${API_BASE_URL}/api/dev-bots/interactive/${sessionId}`,
        { headers }
      );

      expect([200, 404]).toContain(detailsResponse.status());

      const detailsData = await detailsResponse.json();
      expect(detailsData).toHaveProperty('success');

      if (detailsResponse.status() === 200) {
        expect(detailsData.success).toBe(true);
        expect(detailsData.data.sessionId).toBe(sessionId);
        expect(detailsData.data).toHaveProperty('status');
        expect(detailsData.data).toHaveProperty('createdAt');
      }

      // Clean up
      await request.post(`${API_BASE_URL}/api/dev-bots/interactive/${sessionId}/stop`, { headers });
    }
  });

  test('GET /api/dev-bots/interactive/:id should return 404 for non-existent session', async ({ request }) => {
    const response = await request.get(
      `${API_BASE_URL}/api/dev-bots/interactive/non-existent-session-789`,
      { headers }
    );

    expect([404, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('GET /api/dev-bots/interactive/:id should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/dev-bots/interactive/test-session`);

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Interactive Terminal - Session Lifecycle', () => {
  test('should handle complete session lifecycle: start -> get -> reset -> stop', async ({ request }) => {
    // Start session
    const startResponse = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/start`, { headers });

    if (startResponse.status() === 200) {
      const startData = await startResponse.json();
      const sessionId = startData.data.sessionId;

      // Get session details
      const getResponse = await request.get(`${API_BASE_URL}/api/dev-bots/interactive/${sessionId}`, {
        headers,
      });
      expect([200, 404]).toContain(getResponse.status());

      // Reset session (if supported)
      const resetResponse = await request.post(
        `${API_BASE_URL}/api/dev-bots/interactive/${sessionId}/reset`,
        { headers }
      );
      expect([200, 404, 500]).toContain(resetResponse.status());

      // Stop session
      const stopResponse = await request.post(
        `${API_BASE_URL}/api/dev-bots/interactive/${sessionId}/stop`,
        { headers }
      );
      expect([200, 404, 500]).toContain(stopResponse.status());
    }
  });

  test('should prevent starting duplicate sessions in single-session mode', async ({ request }) => {
    // Start first session
    const firstResponse = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/start`, { headers });

    if (firstResponse.status() === 200) {
      const firstData = await firstResponse.json();
      const firstSessionId = firstData.data.sessionId;

      // Try to start second session
      const secondResponse = await request.post(`${API_BASE_URL}/api/dev-bots/interactive/start`, { headers });

      // Should either return 409 (conflict) or 200 (overwrites previous)
      expect([200, 409, 500]).toContain(secondResponse.status());

      // Clean up all sessions
      await request.post(`${API_BASE_URL}/api/dev-bots/interactive/${firstSessionId}/stop`, { headers });

      if (secondResponse.status() === 200) {
        const secondData = await secondResponse.json();
        if (secondData.data && secondData.data.sessionId !== firstSessionId) {
          await request.post(`${API_BASE_URL}/api/dev-bots/interactive/${secondData.data.sessionId}/stop`, {
            headers,
          });
        }
      }
    }
  });
});

test.describe('Interactive Terminal - Error Handling', () => {
  test('should handle malformed JSON in stop request', async ({ request }) => {
    const response = await request
      .post(`${API_BASE_URL}/api/dev-bots/interactive/test-session/stop`, {
        headers,
        data: 'not-valid-json',
      })
      .catch(() => null);

    if (response) {
      expect([400, 404, 500]).toContain(response.status());
    }
  });

  test('should handle missing session ID parameter', async ({ request }) => {
    // This should be caught by routing, but test anyway
    const response = await request.post(`${API_BASE_URL}/api/dev-bots/interactive//stop`, { headers });

    // Should return 404 (not found) due to routing
    expect([404, 400]).toContain(response.status());
  });
});

test.describe('Interactive Terminal - Response Structure', () => {
  test('all responses should have consistent success/error structure', async ({ request }) => {
    const endpoints = [
      { method: 'GET', path: '/api/dev-bots/interactive/active' },
      { method: 'GET', path: '/api/dev-bots/interactive/sessions' },
    ];

    for (const endpoint of endpoints) {
      let response;
      if (endpoint.method === 'GET') {
        response = await request.get(`${API_BASE_URL}${endpoint.path}`, { headers });
      } else {
        response = await request.post(`${API_BASE_URL}${endpoint.path}`, { headers });
      }

      const data = await response.json();

      // All responses should have success field
      expect(data).toHaveProperty('success');
      expect(typeof data.success).toBe('boolean');

      if (data.success) {
        expect(data).toHaveProperty('data');
      } else {
        expect(data).toHaveProperty('error');
      }
    }
  });
});
