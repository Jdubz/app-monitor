/**
 * Interactive Routes Tests
 * 
 * Regression tests to ensure all required HTTP methods are implemented:
 * - GET /interactive/session (fetch current session)
 * - POST /interactive/session (start new session)
 * - DELETE /interactive/session (end session)
 * - POST /interactive/input (send input)
 * - POST /interactive/heartbeat (keep-alive)
 * - POST /interactive/interrupt (send interrupt signal)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { createInteractiveRoutes } from '../interactive.routes.js';
import type { DevBotsManager } from '../../../services/devBotsManager.js';

describe('Interactive Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    const mockDevBotsManager = {} as DevBotsManager;
    const router = createInteractiveRoutes(mockDevBotsManager);
    app.use('/api/dev-bots', router);
  });

  const routes = [
    { method: 'get' as const, path: '/api/dev-bots/interactive/session' },
    { method: 'post' as const, path: '/api/dev-bots/interactive/session', body: { modelProvider: 'openai', modelName: 'gpt-4' } },
    { method: 'delete' as const, path: '/api/dev-bots/interactive/session' },
    { method: 'post' as const, path: '/api/dev-bots/interactive/input', body: { data: 'test' } },
    { method: 'post' as const, path: '/api/dev-bots/interactive/heartbeat', body: { source: 'user' } },
    { method: 'post' as const, path: '/api/dev-bots/interactive/interrupt' },
  ];

  describe('Route Existence', () => {
    it.each(routes)('$method $path should exist (not 404)', async ({ method, path, body }) => {
      const req = request(app)[method](path);
      if (body) req.send(body);
      const response = await req;
      
      expect(response.status).not.toBe(404);
    });
  });

  describe('Temporary Disabled State', () => {
    it.each(routes)('$method $path should return 501', async ({ method, path, body }) => {
      const req = request(app)[method](path);
      if (body) req.send(body);
      const response = await req;
      
      expect(response.status).toBe(501);
      expect(response.body).toMatchObject({
        success: false,
        error: 'not_implemented',
      });
    });
  });
});
