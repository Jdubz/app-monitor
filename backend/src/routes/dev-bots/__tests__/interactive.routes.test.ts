
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, Router } from 'express';
import { createInteractiveRoutes } from '../interactive.routes.js';
import type { DevBotsManager } from '../../../services/devBotsManager.js';

// Mock the logger
vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Interactive Routes', () => {
  let mockDevBotsManager: Partial<DevBotsManager>;
  let router: Router;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: any;

  beforeEach(() => {
    vi.clearAllMocks();
    responseJson = {};

    mockDevBotsManager = {
      getInteractiveSession: vi.fn().mockReturnValue({ id: 'session-123', status: 'active' }),
      sendInteractiveInput: vi.fn(),
      recordInteractiveActivity: vi.fn(),
      recordInteractiveHeartbeat: vi.fn(),
      interruptExecution: vi.fn(),
      endInteractiveSession: vi.fn(),
    };

    router = createInteractiveRoutes(mockDevBotsManager as DevBotsManager);

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn((data) => {
        responseJson = data;
        return mockResponse as Response;
      }),
    };
  });

  describe('POST /interactive/input', () => {
    it('should accept input and return { accepted: true }', async () => {
      mockRequest = {
        body: { sessionId: 'session-123', input: 'user input' },
      };

      const route = router.stack.find(
        (l) => l.route && l.route.path === '/interactive/input' && l.route.methods.post,
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockDevBotsManager.sendInteractiveInput).toHaveBeenCalledWith('session-123', 'user input');
      expect(responseJson).toEqual({ success: true, data: { accepted: true } });
    });
  });

  describe('POST /interactive/heartbeat', () => {
    it('should acknowledge heartbeat and return { acknowledged: true }', async () => {
      mockRequest = {
        body: { sessionId: 'session-123', source: 'user' },
      };

      const route = router.stack.find(
        (l) => l.route && l.route.path === '/interactive/heartbeat' && l.route.methods.post,
      );
      await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);

      expect(mockDevBotsManager.recordInteractiveHeartbeat).toHaveBeenCalledWith('session-123', 'user');
      expect(responseJson).toEqual({ success: true, data: { acknowledged: true } });
    });
  });
});
