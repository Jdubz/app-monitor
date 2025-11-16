/**
 * Interactive Routes Tests
 * 
 * Tests to ensure all required HTTP methods are implemented:
 * - GET /interactive/session (fetch current session)
 * - POST /interactive/session (start new session)
 * - DELETE /interactive/session (end session)
 * - POST /interactive/input (send input)
 * - POST /interactive/heartbeat (keep-alive)
 * - POST /interactive/interrupt (send interrupt signal)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { createInteractiveRoutes } from '../interactive.routes.js';
import type { DevBotsManager } from '../../../services/devBotsManager.js';

describe('Interactive Routes', () => {
  let app: Express;
  let mockDevBotsManager: Partial<DevBotsManager>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock DevBotsManager with interactive methods
    mockDevBotsManager = {
      getActiveInteractiveSession: vi.fn(() => null),
      getInteractiveIdleTimeoutMs: vi.fn(() => 300000),
      getAllowedInteractiveModels: vi.fn(() => []),
      launchInteractiveSession: vi.fn(),
      endInteractiveSession: vi.fn(),
      sendInteractiveInput: vi.fn(),
      recordInteractiveActivity: vi.fn(),
      sendInteractiveSignal: vi.fn(),
    };
    
    const router = createInteractiveRoutes(mockDevBotsManager as DevBotsManager);
    app.use('/api/dev-bots', router);
  });

  const routes = [
    { method: 'get' as const, path: '/api/dev-bots/interactive/session', expectedNon404: true },
    { method: 'post' as const, path: '/api/dev-bots/interactive/session', body: { modelProvider: 'openai', modelName: 'gpt-4' }, expectedNon404: true },
    { method: 'post' as const, path: '/api/dev-bots/interactive/input?sessionId=test', body: { data: 'test' }, expectedNon404: true },
    { method: 'post' as const, path: '/api/dev-bots/interactive/heartbeat', body: { sessionId: 'test' }, expectedNon404: true },
    { method: 'post' as const, path: '/api/dev-bots/interactive/interrupt', body: { sessionId: 'test' }, expectedNon404: true },
  ];

  describe('Route Existence', () => {
    it.each(routes)('$method $path should exist (not 404)', async ({ method, path, body, expectedNon404 }) => {
      if (!expectedNon404) return; // Skip routes that may return 404 based on state
      
      const req = request(app)[method](path);
      if (body) req.send(body);
      const response = await req;
      
      expect(response.status).not.toBe(404);
    });
  });

  describe('Functional Routes', () => {
    it('GET /interactive/session should return session state', async () => {
      const response = await request(app)
        .get('/api/dev-bots/interactive/session');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('availableModels');
    });

    it('POST /interactive/session should validate required fields', async () => {
      const response = await request(app)
        .post('/api/dev-bots/interactive/session')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('DELETE /interactive/session should return 404 when no session active', async () => {
      const response = await request(app)
        .delete('/api/dev-bots/interactive/session');
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('POST /interactive/input should validate required fields', async () => {
      const response = await request(app)
        .post('/api/dev-bots/interactive/input')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('POST /interactive/heartbeat should validate sessionId', async () => {
      const response = await request(app)
        .post('/api/dev-bots/interactive/heartbeat')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('POST /interactive/interrupt should validate sessionId', async () => {
      const response = await request(app)
        .post('/api/dev-bots/interactive/interrupt')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
