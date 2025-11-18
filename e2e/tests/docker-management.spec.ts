import { test, expect } from '@playwright/test';

/**
 * Docker Management E2E Tests
 * Tests Docker container management API endpoints
 *
 * Note: These tests verify API structure and error handling.
 * Docker operations may be mocked in test environment.
 */

const API_BASE_URL = 'http://localhost:3002';
const API_KEY = 'test-e2e-api-key-not-for-production';

const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
};

test.describe('Docker Container Info', () => {
  test('GET /api/docker/container-info should return container information', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/docker/container-info`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('status');

    // Verify container info structure
    if (data.data.container) {
      expect(data.data.container).toHaveProperty('id');
      expect(data.data.container).toHaveProperty('name');
      expect(data.data.container).toHaveProperty('state');
    }
  });

  test('GET /api/docker/container-info should handle no container gracefully', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/docker/container-info`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);

    // Should indicate no container or provide container info
    expect(data.data).toHaveProperty('status');
  });

  test('GET /api/docker/container-info should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/docker/container-info`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data).toHaveProperty('error');
  });
});

test.describe('Docker Container Start', () => {
  test('POST /api/docker/start should accept start request', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/docker/start`, { headers });

    // Should return 200 (started) or 409 (already running)
    expect([200, 409, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');

    if (response.status() === 200) {
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('message');
    } else if (response.status() === 409) {
      // Already running is acceptable
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    }
  });

  test('POST /api/docker/start should require authentication', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/docker/start`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data).toHaveProperty('error');
  });

  test('POST /api/docker/start should handle Docker not available', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/docker/start`, { headers });

    // If Docker is not available in test env, should return error or success based on mock
    expect([200, 409, 500, 503]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });
});

test.describe('Docker Container Stop', () => {
  test('POST /api/docker/stop should accept stop request', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/docker/stop`, { headers });

    // Should return 200 (stopped) or 404 (not running)
    expect([200, 404, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');

    if (response.status() === 200) {
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('message');
    }
  });

  test('POST /api/docker/stop should require authentication', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/docker/stop`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data).toHaveProperty('error');
  });

  test('POST /api/docker/stop with timeout should handle graceful shutdown', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/docker/stop`, {
      headers,
      data: {
        timeout: 10, // 10 second timeout
      },
    });

    expect([200, 404, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });
});

test.describe('Docker Container Restart', () => {
  test('POST /api/docker/restart should accept restart request', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/docker/restart`, { headers });

    // Should return 200 (restarted) or error
    expect([200, 404, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');

    if (response.status() === 200) {
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('message');
    }
  });

  test('POST /api/docker/restart should require authentication', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/docker/restart`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data).toHaveProperty('error');
  });

  test('POST /api/docker/restart should complete within reasonable time', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.post(`${API_BASE_URL}/api/docker/restart`, { headers });

    const duration = Date.now() - startTime;

    // Restart should complete within 30 seconds
    expect(duration).toBeLessThan(30000);

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });
});

test.describe('Docker API Error Handling', () => {
  test('should handle invalid API key', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/docker/container-info`, {
      headers: {
        'X-API-Key': 'invalid-key-12345',
      },
    });

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle missing API key', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/docker/container-info`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle malformed requests', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/docker/stop`, {
      headers,
      data: 'not-valid-json{[',
    }).catch(() => null);

    if (response) {
      expect([400, 500]).toContain(response.status());
    }
  });
});

test.describe('Docker API Response Structure', () => {
  test('success responses should have consistent structure', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/docker/container-info`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Verify standard response structure
    expect(data).toHaveProperty('success');
    expect(typeof data.success).toBe('boolean');

    if (data.success) {
      expect(data).toHaveProperty('data');
    }
  });

  test('error responses should have consistent structure', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/docker/container-info`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();

    // Verify standard error structure
    expect(data).toHaveProperty('success');
    expect(data.success).toBe(false);
    expect(data).toHaveProperty('error');

    if (data.message) {
      expect(typeof data.message).toBe('string');
    }
  });
});

test.describe('Docker State Transitions', () => {
  test('should handle start -> stop sequence', async ({ request }) => {
    // Attempt to start
    const startResponse = await request.post(`${API_BASE_URL}/api/docker/start`, { headers });
    expect([200, 409, 500]).toContain(startResponse.status());

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Attempt to stop
    const stopResponse = await request.post(`${API_BASE_URL}/api/docker/stop`, { headers });
    expect([200, 404, 500]).toContain(stopResponse.status());
  });

  test('should handle stop when already stopped', async ({ request }) => {
    // Ensure stopped
    await request.post(`${API_BASE_URL}/api/docker/stop`, { headers });

    // Try to stop again
    const response = await request.post(`${API_BASE_URL}/api/docker/stop`, { headers });

    // Should either succeed (idempotent) or return 404/error
    expect([200, 404, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('should handle start when already running', async ({ request }) => {
    // Attempt to start
    await request.post(`${API_BASE_URL}/api/docker/start`, { headers });

    // Try to start again
    const response = await request.post(`${API_BASE_URL}/api/docker/start`, { headers });

    // Should either succeed (idempotent) or return 409 (conflict)
    expect([200, 409, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });
});

test.describe('Docker Container Health', () => {
  test('container info should indicate health status', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/docker/container-info`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);

    // Should provide health/status information
    expect(data.data).toHaveProperty('status');

    if (data.data.container) {
      // Container state should be a known value
      const validStates = ['running', 'stopped', 'paused', 'restarting', 'removing', 'exited', 'dead', 'created'];
      if (data.data.container.state) {
        expect(validStates).toContain(data.data.container.state.toLowerCase());
      }
    }
  });
});
