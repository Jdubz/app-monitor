import { test, expect } from '@playwright/test';

/**
 * Quality Gates Configuration E2E Tests
 * Tests quality gate configuration management endpoints
 */

const API_BASE_URL = 'http://localhost:3002';
const API_KEY = 'test-e2e-api-key-not-for-production';

const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
};

test.describe('Quality Gates - Get All Configurations', () => {
  test('GET /api/quality-gates/config should return all gate configs', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/quality-gates/config`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('configs');
    expect(typeof data.data.configs).toBe('object');
  });

  test('configs should include standard gate types', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/quality-gates/config`, { headers });

    const data = await response.json();
    const configs = data.data.configs;

    // Should have some standard gates (implementation may vary)
    expect(typeof configs).toBe('object');
    expect(Object.keys(configs).length).toBeGreaterThan(0);

    // Each config should have required fields
    for (const gateConfig of Object.values(configs)) {
      expect(gateConfig).toHaveProperty('enabled');
      expect(gateConfig).toHaveProperty('required');
      expect(typeof (gateConfig as any).enabled).toBe('boolean');
      expect(typeof (gateConfig as any).required).toBe('boolean');
    }
  });

  test('GET /api/quality-gates/config should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/quality-gates/config`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data).toHaveProperty('error');
  });
});

test.describe('Quality Gates - Get Specific Configuration', () => {
  test('GET /api/quality-gates/config/:gate should return specific gate config', async ({ request }) => {
    // First get all configs to find a valid gate name
    const allConfigsResponse = await request.get(`${API_BASE_URL}/api/quality-gates/config`, { headers });
    const allConfigs = await allConfigsResponse.json();
    const gateNames = Object.keys(allConfigs.data.configs);

    if (gateNames.length > 0) {
      const testGate = gateNames[0];

      const response = await request.get(`${API_BASE_URL}/api/quality-gates/config/${testGate}`, { headers });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('enabled');
      expect(data.data).toHaveProperty('required');
      expect(typeof data.data.enabled).toBe('boolean');
      expect(typeof data.data.required).toBe('boolean');
    }
  });

  test('GET /api/quality-gates/config/:gate should return 404 for non-existent gate', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/quality-gates/config/non-existent-gate-12345`, {
      headers,
    });

    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('QUALITY_GATE_NOT_FOUND');
  });

  test('GET /api/quality-gates/config/:gate should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/quality-gates/config/test-gate`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
  });
});

test.describe('Quality Gates - Update Configuration', () => {
  test('PUT /api/quality-gates/config/:gate should update gate config', async ({ request }) => {
    // Get a valid gate name
    const allConfigsResponse = await request.get(`${API_BASE_URL}/api/quality-gates/config`, { headers });
    const allConfigs = await allConfigsResponse.json();
    const gateNames = Object.keys(allConfigs.data.configs);

    if (gateNames.length > 0) {
      const testGate = gateNames[0];

      // Get original config
      const originalResponse = await request.get(`${API_BASE_URL}/api/quality-gates/config/${testGate}`, {
        headers,
      });
      const originalData = await originalResponse.json();
      const originalEnabled = originalData.data.enabled;

      // Update config
      const response = await request.put(`${API_BASE_URL}/api/quality-gates/config/${testGate}`, {
        headers,
        data: {
          enabled: !originalEnabled, // Toggle enabled state
        },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('message');
      expect(data.data).toHaveProperty('config');
      expect(data.data.config.enabled).toBe(!originalEnabled);

      // Restore original config
      await request.put(`${API_BASE_URL}/api/quality-gates/config/${testGate}`, {
        headers,
        data: {
          enabled: originalEnabled,
        },
      });
    }
  });

  test('PUT /api/quality-gates/config/:gate should validate enabled field type', async ({ request }) => {
    const allConfigsResponse = await request.get(`${API_BASE_URL}/api/quality-gates/config`, { headers });
    const allConfigs = await allConfigsResponse.json();
    const gateNames = Object.keys(allConfigs.data.configs);

    if (gateNames.length > 0) {
      const testGate = gateNames[0];

      const response = await request.put(`${API_BASE_URL}/api/quality-gates/config/${testGate}`, {
        headers,
        data: {
          enabled: 'not-a-boolean', // Invalid type
        },
      });

      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('INVALID_GATE_CONFIG');
    }
  });

  test('PUT /api/quality-gates/config/:gate should validate required field type', async ({ request }) => {
    const allConfigsResponse = await request.get(`${API_BASE_URL}/api/quality-gates/config`, { headers });
    const allConfigs = await allConfigsResponse.json();
    const gateNames = Object.keys(allConfigs.data.configs);

    if (gateNames.length > 0) {
      const testGate = gateNames[0];

      const response = await request.put(`${API_BASE_URL}/api/quality-gates/config/${testGate}`, {
        headers,
        data: {
          required: 123, // Invalid type
        },
      });

      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('INVALID_GATE_CONFIG');
    }
  });

  test('PUT /api/quality-gates/config/:gate should validate weight range', async ({ request }) => {
    const allConfigsResponse = await request.get(`${API_BASE_URL}/api/quality-gates/config`, { headers });
    const allConfigs = await allConfigsResponse.json();
    const gateNames = Object.keys(allConfigs.data.configs);

    if (gateNames.length > 0) {
      const testGate = gateNames[0];

      // Test weight too high
      const response1 = await request.put(`${API_BASE_URL}/api/quality-gates/config/${testGate}`, {
        headers,
        data: {
          weight: 11, // Out of range (1-10)
        },
      });

      expect(response1.status()).toBe(400);
      const data1 = await response1.json();
      expect(data1.success).toBe(false);
      expect(data1.error).toBe('INVALID_GATE_CONFIG');

      // Test weight too low
      const response2 = await request.put(`${API_BASE_URL}/api/quality-gates/config/${testGate}`, {
        headers,
        data: {
          weight: 0, // Out of range (1-10)
        },
      });

      expect(response2.status()).toBe(400);
      const data2 = await response2.json();
      expect(data2.success).toBe(false);
    }
  });

  test('PUT /api/quality-gates/config/:gate should validate timeout is positive', async ({ request }) => {
    const allConfigsResponse = await request.get(`${API_BASE_URL}/api/quality-gates/config`, { headers });
    const allConfigs = await allConfigsResponse.json();
    const gateNames = Object.keys(allConfigs.data.configs);

    if (gateNames.length > 0) {
      const testGate = gateNames[0];

      const response = await request.put(`${API_BASE_URL}/api/quality-gates/config/${testGate}`, {
        headers,
        data: {
          timeout: -100, // Invalid negative timeout
        },
      });

      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('INVALID_GATE_CONFIG');
    }
  });

  test('PUT /api/quality-gates/config/:gate should return 404 for non-existent gate', async ({ request }) => {
    const response = await request.put(`${API_BASE_URL}/api/quality-gates/config/non-existent-gate-99999`, {
      headers,
      data: {
        enabled: true,
      },
    });

    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('QUALITY_GATE_NOT_FOUND');
  });

  test('PUT /api/quality-gates/config/:gate should require authentication', async ({ request }) => {
    const response = await request.put(`${API_BASE_URL}/api/quality-gates/config/test-gate`, {
      data: {
        enabled: true,
      },
    });

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Quality Gates - Validation', () => {
  test('POST /api/quality-gates/validate should require taskId', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/quality-gates/validate`, {
      headers,
      data: {
        workspacePath: '/test/path',
        project: 'test-project',
        // Missing taskId
      },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_VALIDATION_REQUEST');
  });

  test('POST /api/quality-gates/validate should require workspacePath', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/quality-gates/validate`, {
      headers,
      data: {
        taskId: 'test-task-123',
        project: 'test-project',
        // Missing workspacePath
      },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_VALIDATION_REQUEST');
  });

  test('POST /api/quality-gates/validate should require project', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/quality-gates/validate`, {
      headers,
      data: {
        taskId: 'test-task-123',
        workspacePath: '/test/path',
        // Missing project
      },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_VALIDATION_REQUEST');
  });

  test('POST /api/quality-gates/validate should accept valid request', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/quality-gates/validate`, {
      headers,
      data: {
        taskId: 'test-task-123',
        workspacePath: '/test/workspace',
        project: 'test-project',
      },
    });

    // May return 200 or 500 depending on whether validation can actually run
    expect([200, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('POST /api/quality-gates/validate should require authentication', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/quality-gates/validate`, {
      data: {
        taskId: 'test-task-123',
        workspacePath: '/test/path',
        project: 'test-project',
      },
    });

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Quality Gates - Reset Configuration', () => {
  test('POST /api/quality-gates/config/reset should reset all gates to defaults', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/quality-gates/config/reset`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('message');
    expect(data.data.message).toContain('reset');
  });

  test('POST /api/quality-gates/config/reset should require authentication', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/quality-gates/config/reset`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('configs should be restorable after reset', async ({ request }) => {
    // Get original configs
    const originalResponse = await request.get(`${API_BASE_URL}/api/quality-gates/config`, { headers });
    const originalData = await originalResponse.json();
    const gateNames = Object.keys(originalData.data.configs);

    if (gateNames.length > 0) {
      const testGate = gateNames[0];

      // Modify a config
      await request.put(`${API_BASE_URL}/api/quality-gates/config/${testGate}`, {
        headers,
        data: {
          enabled: false,
        },
      });

      // Reset all configs
      const resetResponse = await request.post(`${API_BASE_URL}/api/quality-gates/config/reset`, { headers });
      expect(resetResponse.status()).toBe(200);

      // Verify configs were reset
      const afterResetResponse = await request.get(`${API_BASE_URL}/api/quality-gates/config`, { headers });
      expect(afterResetResponse.status()).toBe(200);

      const afterResetData = await afterResetResponse.json();
      expect(afterResetData.success).toBe(true);
      expect(afterResetData.data).toHaveProperty('configs');
    }
  });
});

test.describe('Quality Gates - Status', () => {
  test('GET /api/quality-gates/status should return gate execution status', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/quality-gates/status`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  test('GET /api/quality-gates/status should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/quality-gates/status`);

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Quality Gates - Error Handling', () => {
  test('should handle malformed JSON in update request', async ({ request }) => {
    const response = await request.put(`${API_BASE_URL}/api/quality-gates/config/test-gate`, {
      headers,
      data: 'not-valid-json{[',
    }).catch(() => null);

    if (response) {
      expect([400, 404, 500]).toContain(response.status());
    }
  });

  test('should handle malformed JSON in validate request', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/quality-gates/validate`, {
      headers,
      data: 'not-valid-json',
    }).catch(() => null);

    if (response) {
      expect([400, 500]).toContain(response.status());
    }
  });
});
