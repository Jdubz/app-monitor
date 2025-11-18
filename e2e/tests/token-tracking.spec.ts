import { test, expect } from '@playwright/test';

/**
 * Token Tracking E2E Tests
 * Tests token usage tracking and budget management endpoints
 */

const API_BASE_URL = 'http://localhost:3002';
const API_KEY = 'test-e2e-api-key-not-for-production';

const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
};

test.describe('Token Tracking - Usage Summary', () => {
  test('GET /api/token-tracking/summary should return all provider summaries', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/summary`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('summaries');
    expect(typeof data.data.summaries).toBe('object');
  });

  test('GET /api/token-tracking/summary should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/summary`);

    expect([401, 403]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data).toHaveProperty('error');
  });
});

test.describe('Token Tracking - Provider Summary', () => {
  test('GET /api/token-tracking/summary/:provider should return provider summary', async ({ request }) => {
    const providers = ['anthropic', 'openai', 'google'];

    for (const provider of providers) {
      const response = await request.get(`${API_BASE_URL}/api/token-tracking/summary/${provider}`, {
        headers,
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('provider');
      expect(data.data).toHaveProperty('date');
      expect(data.data).toHaveProperty('totalTokens');
      expect(typeof data.data.totalTokens).toBe('number');
    }
  });

  test('GET /api/token-tracking/summary/:provider should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/summary/anthropic`);

    expect([401, 403]).toContain(response.status());
  });

  test('GET /api/token-tracking/summary/:provider should handle unknown providers', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/summary/unknown-provider-123`, {
      headers,
    });

    expect([200, 404]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });
});

test.describe('Token Tracking - Budget Management', () => {
  test('GET /api/token-tracking/budget/:provider should return budget config', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/budget/anthropic`, { headers });

    // May return 200 (budget exists) or 404 (no budget configured)
    expect([200, 404]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');

    if (response.status() === 200) {
      expect(data.data).toHaveProperty('provider');
      expect(data.data).toHaveProperty('dailyLimit');
      expect(typeof data.data.dailyLimit).toBe('number');
      expect(data.data.dailyLimit).toBeGreaterThan(0);
    }
  });

  test('GET /api/token-tracking/budget/:provider should return 404 for unconfigured provider', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/budget/nonexistent-provider-999`, {
      headers,
    });

    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('TOKEN_BUDGET_NOT_FOUND');
  });

  test('GET /api/token-tracking/budget/:provider should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/budget/anthropic`);

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Token Tracking - Budget Updates', () => {
  test('PUT /api/token-tracking/budget should update budget', async ({ request }) => {
    const testBudget = {
      provider: 'test-provider',
      dailyLimit: 1000000,
      warningThreshold: 0.8,
    };

    const response = await request.put(`${API_BASE_URL}/api/token-tracking/budget`, {
      headers,
      data: testBudget,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('message');
    expect(data.data).toHaveProperty('budget');
    expect(data.data.budget.provider).toBe('test-provider');
    expect(data.data.budget.dailyLimit).toBe(1000000);
  });

  test('PUT /api/token-tracking/budget should require provider', async ({ request }) => {
    const invalidBudget = {
      dailyLimit: 1000000,
      // Missing provider
    };

    const response = await request.put(`${API_BASE_URL}/api/token-tracking/budget`, {
      headers,
      data: invalidBudget,
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_BUDGET');
  });

  test('PUT /api/token-tracking/budget should validate dailyLimit is positive', async ({ request }) => {
    const invalidBudget = {
      provider: 'test-provider',
      dailyLimit: -100, // Invalid negative limit
    };

    const response = await request.put(`${API_BASE_URL}/api/token-tracking/budget`, {
      headers,
      data: invalidBudget,
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_BUDGET');
  });

  test('PUT /api/token-tracking/budget should validate dailyLimit is a number', async ({ request }) => {
    const invalidBudget = {
      provider: 'test-provider',
      dailyLimit: 'not-a-number',
    };

    const response = await request.put(`${API_BASE_URL}/api/token-tracking/budget`, {
      headers,
      data: invalidBudget,
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_BUDGET');
  });

  test('PUT /api/token-tracking/budget should validate warningThreshold range', async ({ request }) => {
    const invalidBudget = {
      provider: 'test-provider',
      dailyLimit: 1000000,
      warningThreshold: 1.5, // Out of range (0-1)
    };

    const response = await request.put(`${API_BASE_URL}/api/token-tracking/budget`, {
      headers,
      data: invalidBudget,
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_BUDGET');
  });

  test('PUT /api/token-tracking/budget should require authentication', async ({ request }) => {
    const response = await request.put(`${API_BASE_URL}/api/token-tracking/budget`, {
      data: {
        provider: 'test',
        dailyLimit: 1000,
      },
    });

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Token Tracking - Budget Check', () => {
  test('GET /api/token-tracking/can-use/:provider should return usage status', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/can-use/anthropic`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('canUse');
    expect(typeof data.data.canUse).toBe('boolean');
    expect(data.data).toHaveProperty('reason');
  });

  test('GET /api/token-tracking/can-use/:provider should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/can-use/anthropic`);

    expect([401, 403]).toContain(response.status());
  });

  test('GET /api/token-tracking/can-use/:provider should handle unknown providers', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/can-use/unknown-provider`, {
      headers,
    });

    expect([200, 404]).toContain(response.status());
  });
});

test.describe('Token Tracking - Remaining Budget', () => {
  test('GET /api/token-tracking/remaining/:provider should return remaining tokens', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/remaining/anthropic`, { headers });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('remaining');
    expect(typeof data.data.remaining).toBe('number');
    expect(data.data).toHaveProperty('percentUsed');
    expect(typeof data.data.percentUsed).toBe('number');
  });

  test('GET /api/token-tracking/remaining/:provider should require authentication', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/remaining/anthropic`);

    expect([401, 403]).toContain(response.status());
  });

  test('remaining tokens should be within valid range', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/token-tracking/remaining/anthropic`, { headers });

    if (response.status() === 200) {
      const data = await response.json();

      // Remaining should not be negative
      expect(data.data.remaining).toBeGreaterThanOrEqual(0);

      // Percent used should be 0-100
      expect(data.data.percentUsed).toBeGreaterThanOrEqual(0);
      expect(data.data.percentUsed).toBeLessThanOrEqual(100);
    }
  });
});

test.describe('Token Tracking - Reset', () => {
  test('POST /api/token-tracking/reset should reset usage for provider', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/token-tracking/reset`, {
      headers,
      data: {
        provider: 'test-provider',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('message');
    expect(data.data.message).toContain('reset');
  });

  test('POST /api/token-tracking/reset should reset all providers when none specified', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/token-tracking/reset`, {
      headers,
      data: {},
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('message');
  });

  test('POST /api/token-tracking/reset should require authentication', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/token-tracking/reset`, {
      data: {
        provider: 'test',
      },
    });

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Token Tracking - Budget Lifecycle', () => {
  test('should handle complete budget lifecycle', async ({ request }) => {
    const testProvider = 'e2e-test-provider';

    // 1. Set budget
    const setBudgetResponse = await request.put(`${API_BASE_URL}/api/token-tracking/budget`, {
      headers,
      data: {
        provider: testProvider,
        dailyLimit: 500000,
        warningThreshold: 0.75,
      },
    });
    expect(setBudgetResponse.status()).toBe(200);

    // 2. Get budget
    const getBudgetResponse = await request.get(`${API_BASE_URL}/api/token-tracking/budget/${testProvider}`, {
      headers,
    });
    expect(getBudgetResponse.status()).toBe(200);
    const budgetData = await getBudgetResponse.json();
    expect(budgetData.data.dailyLimit).toBe(500000);

    // 3. Check if can use
    const canUseResponse = await request.get(`${API_BASE_URL}/api/token-tracking/can-use/${testProvider}`, {
      headers,
    });
    expect(canUseResponse.status()).toBe(200);

    // 4. Get remaining
    const remainingResponse = await request.get(`${API_BASE_URL}/api/token-tracking/remaining/${testProvider}`, {
      headers,
    });
    expect(remainingResponse.status()).toBe(200);

    // 5. Reset
    const resetResponse = await request.post(`${API_BASE_URL}/api/token-tracking/reset`, {
      headers,
      data: {
        provider: testProvider,
      },
    });
    expect(resetResponse.status()).toBe(200);
  });
});

test.describe('Token Tracking - Error Handling', () => {
  test('should handle malformed JSON in budget update', async ({ request }) => {
    const response = await request
      .put(`${API_BASE_URL}/api/token-tracking/budget`, {
        headers,
        data: 'not-valid-json',
      })
      .catch(() => null);

    if (response) {
      expect([400, 500]).toContain(response.status());
    }
  });

  test('should handle malformed JSON in reset', async ({ request }) => {
    const response = await request
      .post(`${API_BASE_URL}/api/token-tracking/reset`, {
        headers,
        data: 'not-valid-json',
      })
      .catch(() => null);

    if (response) {
      expect([400, 500]).toContain(response.status());
    }
  });
});

test.describe('Token Tracking - Response Structure', () => {
  test('all responses should have consistent structure', async ({ request }) => {
    const endpoints = [
      { method: 'GET', path: '/api/token-tracking/summary' },
      { method: 'GET', path: '/api/token-tracking/summary/anthropic' },
      { method: 'GET', path: '/api/token-tracking/can-use/anthropic' },
      { method: 'GET', path: '/api/token-tracking/remaining/anthropic' },
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(`${API_BASE_URL}${endpoint.path}`, { headers });

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
