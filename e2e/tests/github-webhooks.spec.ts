import { test, expect } from '@playwright/test';
import crypto from 'crypto';

/**
 * GitHub Webhooks E2E Tests
 * Tests webhook endpoints for PR, push, check_suite, check_run, and pr_review events
 */

const API_BASE_URL = 'http://localhost:3002';

/**
 * Generate GitHub webhook signature for testing
 * @param payload - The webhook payload as string
 * @param secret - The webhook secret
 */
function generateWebhookSignature(payload: string, secret: string): string {
  if (!secret) {
    return ''; // No signature if no secret
  }
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

test.describe('GitHub Webhooks - Pull Request Events', () => {
  test('should accept valid PR opened webhook', async ({ request }) => {
    const payload = {
      action: 'opened',
      number: 123,
      pull_request: {
        number: 123,
        title: 'Test PR',
        state: 'open',
        user: {
          login: 'testuser',
        },
        head: {
          ref: 'feature-branch',
        },
        base: {
          ref: 'main',
        },
      },
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'test-delivery-123',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('message');
    expect(data.data.event).toBe('pull_request');
  });

  test('should accept PR closed webhook', async ({ request }) => {
    const payload = {
      action: 'closed',
      number: 124,
      pull_request: {
        number: 124,
        title: 'Closed PR',
        state: 'closed',
        merged: false,
        user: {
          login: 'testuser',
        },
        head: {
          ref: 'feature-branch',
        },
        base: {
          ref: 'main',
        },
      },
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'test-delivery-124',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should accept PR merged webhook', async ({ request }) => {
    const payload = {
      action: 'closed',
      number: 125,
      pull_request: {
        number: 125,
        title: 'Merged PR',
        state: 'closed',
        merged: true,
        user: {
          login: 'testuser',
        },
        head: {
          ref: 'feature-branch',
        },
        base: {
          ref: 'main',
        },
      },
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'test-delivery-125',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should accept PR synchronize webhook', async ({ request }) => {
    const payload = {
      action: 'synchronize',
      number: 126,
      pull_request: {
        number: 126,
        title: 'Updated PR',
        state: 'open',
        user: {
          login: 'testuser',
        },
        head: {
          ref: 'feature-branch',
          sha: 'abc123',
        },
        base: {
          ref: 'main',
        },
      },
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'test-delivery-126',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should reject webhook with wrong event type', async ({ request }) => {
    const payload = {
      action: 'opened',
      number: 127,
      pull_request: {
        number: 127,
        title: 'Test PR',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push', // Wrong event type
        'X-GitHub-Delivery': 'test-delivery-127',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_EVENT_TYPE');
  });

  test('should handle missing required fields gracefully', async ({ request }) => {
    const payload = {
      action: 'opened',
      // Missing pull_request and number fields
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'test-delivery-128',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    // Should still accept webhook but may log warnings
    expect([200, 400, 500]).toContain(response.status());
  });
});

test.describe('GitHub Webhooks - Push Events', () => {
  test('should accept valid push webhook', async ({ request }) => {
    const payload = {
      ref: 'refs/heads/main',
      before: 'abc123',
      after: 'def456',
      commits: [
        {
          id: 'def456',
          message: 'Test commit',
          author: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
      ],
      repository: {
        full_name: 'Jdubz/test-repo',
      },
      pusher: {
        name: 'testuser',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/push`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': 'test-delivery-push-1',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('message');
    expect(data.data.event).toBe('push');
  });

  test('should reject push webhook with wrong event type', async ({ request }) => {
    const payload = {
      ref: 'refs/heads/main',
      commits: [],
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/push`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request', // Wrong event type
        'X-GitHub-Delivery': 'test-delivery-push-2',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_EVENT_TYPE');
  });
});

test.describe('GitHub Webhooks - Check Suite Events', () => {
  test('should accept check_suite completed webhook', async ({ request }) => {
    const payload = {
      action: 'completed',
      check_suite: {
        id: 123456,
        status: 'completed',
        conclusion: 'success',
        head_branch: 'main',
        head_sha: 'abc123',
      },
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/check_suite`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'check_suite',
        'X-GitHub-Delivery': 'test-delivery-check-suite-1',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should accept check_suite requested webhook', async ({ request }) => {
    const payload = {
      action: 'requested',
      check_suite: {
        id: 123457,
        status: 'queued',
        head_branch: 'feature-branch',
        head_sha: 'def456',
      },
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/check_suite`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'check_suite',
        'X-GitHub-Delivery': 'test-delivery-check-suite-2',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

test.describe('GitHub Webhooks - Check Run Events', () => {
  test('should accept check_run completed webhook', async ({ request }) => {
    const payload = {
      action: 'completed',
      check_run: {
        id: 789012,
        name: 'CI Tests',
        status: 'completed',
        conclusion: 'success',
        head_sha: 'abc123',
      },
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/check_run`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'check_run',
        'X-GitHub-Delivery': 'test-delivery-check-run-1',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should accept check_run created webhook', async ({ request }) => {
    const payload = {
      action: 'created',
      check_run: {
        id: 789013,
        name: 'Linting',
        status: 'queued',
        head_sha: 'def456',
      },
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/check_run`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'check_run',
        'X-GitHub-Delivery': 'test-delivery-check-run-2',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

test.describe('GitHub Webhooks - PR Review Events', () => {
  test('should accept pull_request_review submitted webhook', async ({ request }) => {
    const payload = {
      action: 'submitted',
      review: {
        id: 456789,
        user: {
          login: 'reviewer',
        },
        body: 'LGTM',
        state: 'approved',
      },
      pull_request: {
        number: 130,
        title: 'Test PR for review',
      },
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr_review`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request_review',
        'X-GitHub-Delivery': 'test-delivery-review-1',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should accept pull_request_review dismissed webhook', async ({ request }) => {
    const payload = {
      action: 'dismissed',
      review: {
        id: 456790,
        user: {
          login: 'reviewer',
        },
        state: 'dismissed',
      },
      pull_request: {
        number: 131,
        title: 'Test PR with dismissed review',
      },
      repository: {
        full_name: 'Jdubz/test-repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, '');

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr_review`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request_review',
        'X-GitHub-Delivery': 'test-delivery-review-2',
        'X-Hub-Signature-256': signature,
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

test.describe('GitHub Webhooks - Health Check', () => {
  test('GET /api/github/webhooks/health should return ok', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/github/webhooks/health`);

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ok');
  });
});

test.describe('GitHub Webhooks - Error Handling', () => {
  test('should handle malformed JSON payload', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'test-delivery-error-1',
      },
      data: 'not-valid-json{[',
    }).catch(() => null);

    if (response) {
      expect([400, 500]).toContain(response.status());
    }
  });

  test('should handle missing headers', async ({ request }) => {
    const payload = {
      action: 'opened',
      number: 140,
      pull_request: {
        number: 140,
        title: 'Test PR',
      },
    };

    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr`, {
      headers: {
        'Content-Type': 'application/json',
        // Missing X-GitHub-Event header
      },
      data: payload,
    });

    // Should handle gracefully
    expect([200, 400]).toContain(response.status());
  });

  test('should handle empty payload', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/github/webhooks/pr`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'test-delivery-empty',
      },
      data: {},
    });

    // Should handle gracefully
    expect([200, 400, 500]).toContain(response.status());
  });
});
