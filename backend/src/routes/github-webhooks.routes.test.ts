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
      expect(response.body.event).toBe('pull_request');
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
      expect(response.body.event).toBe('push');
    });
  });

  describe('GET /api/github/webhooks/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/github/webhooks/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });
});
