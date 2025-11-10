import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import githubWebhooksRoutes from './github-webhooks.routes.js';

describe('GitHub Webhooks Routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/github/webhooks', githubWebhooksRoutes);

  describe('POST /api/github/webhooks/pr', () => {
    it('should handle pull request webhook', async () => {
      const mockPrPayload = {
        action: 'opened',
        pull_request: {
          number: 123,
          title: 'Test PR',
          state: 'open',
          user: { login: 'testuser' },
          base: { ref: 'main' },
          head: { ref: 'feature-branch' }
        },
        repository: {
          full_name: 'owner/repo'
        }
      };

      const response = await request(app)
        .post('/api/github/webhooks/pr')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'test-delivery-id')
        .send(mockPrPayload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.event).toBe('pull_request');
    });

    it('should reject non-pull_request events', async () => {
      const response = await request(app)
        .post('/api/github/webhooks/pr')
        .set('x-github-event', 'push')
        .set('x-github-delivery', 'test-delivery-id')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('INVALID_EVENT_TYPE');
    });

    it('should handle errors gracefully', async () => {
      const response = await request(app)
        .post('/api/github/webhooks/pr')
        .set('x-github-event', 'pull_request')
        .send({}); // Incomplete payload

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/github/webhooks/push', () => {
    it('should handle push webhook', async () => {
      const mockPushPayload = {
        ref: 'refs/heads/main',
        commits: [
          { message: 'Test commit' }
        ],
        repository: {
          full_name: 'owner/repo'
        },
        pusher: {
          name: 'testuser'
        }
      };

      const response = await request(app)
        .post('/api/github/webhooks/push')
        .set('x-github-event', 'push')
        .set('x-github-delivery', 'test-delivery-id')
        .send(mockPushPayload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.event).toBe('push');
    });

    it('should reject non-push events', async () => {
      const response = await request(app)
        .post('/api/github/webhooks/push')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'test-delivery-id')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('INVALID_EVENT_TYPE');
    });
  });

  describe('GET /api/github/webhooks/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/github/webhooks/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('healthy');
      expect(response.body.data.timestamp).toBeDefined();
    });
  });

  describe('Webhook signature verification', () => {
    it('should accept webhooks without signature when secret is not configured', async () => {
      // Default config has empty secret, so verification is disabled
      const mockPrPayload = {
        action: 'opened',
        pull_request: {
          number: 123,
          title: 'Test PR',
          state: 'open',
          user: { login: 'testuser' },
          base: { ref: 'main' },
          head: { ref: 'feature-branch' }
        },
        repository: {
          full_name: 'owner/repo'
        }
      };

      const response = await request(app)
        .post('/api/github/webhooks/pr')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'test-delivery-id')
        // No x-hub-signature-256 header
        .send(mockPrPayload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    // Note: Testing with a configured secret would require mocking the config
    // or setting environment variables, which is more complex.
    // The utility function tests cover the signature verification logic thoroughly.
  });
});
