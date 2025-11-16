/**
 * Interactive Terminal Routes - Integration Tests
 *
 * Tests all REST API endpoints for interactive terminal session management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createInteractiveTerminalRoutes } from '../interactive-terminal.routes.js';
import type { InteractiveTerminalService } from '../../../services/interactiveTerminal.service.js';

// Mock Terminal Service
const createMockTerminalService = (): InteractiveTerminalService => {
  const mockSession = {
    id: 'session-123',
    ownerEmail: 'test@example.com',
    modelProvider: 'none',
    modelName: 'terminal',
    status: 'running' as const,
    containerId: 'container-123',
    startedAt: new Date().toISOString(),
    lastUserActivityAt: null,
    lastAgentActivityAt: null,
    endedAt: null,
    terminationReason: null,
    contextSnapshot: null,
    logPath: null,
    metadata: null,
  };

  return {
    startSession: vi.fn().mockResolvedValue({
      sessionId: mockSession.id,
      containerId: mockSession.containerId,
      session: mockSession,
    }),
    stopSession: vi.fn().mockResolvedValue(undefined),
    resetSession: vi.fn().mockResolvedValue({
      sessionId: mockSession.id,
      containerId: 'container-456',
      session: { ...mockSession, containerId: 'container-456' },
    }),
    getSession: vi.fn().mockReturnValue(mockSession),
    getActiveSession: vi.fn().mockReturnValue(mockSession),
    listSessions: vi.fn().mockReturnValue([mockSession]),
    recordActivity: vi.fn(),
  } as unknown as InteractiveTerminalService;
};

describe('Interactive Terminal Routes', () => {
  let app: Express;
  let mockTerminalService: InteractiveTerminalService;

  beforeEach(() => {
    mockTerminalService = createMockTerminalService();

    app = express();
    app.use(express.json());
    app.use('/', createInteractiveTerminalRoutes({ terminalService: mockTerminalService }));
  });

  describe('POST /interactive/start', () => {
    it('should start a new session', async () => {
      const response = await request(app).post('/interactive/start').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          sessionId: 'session-123',
          containerId: 'container-123',
          session: expect.objectContaining({
            id: 'session-123',
            status: 'running',
          }),
        },
      });
    });

    it('should call startSession with default email', async () => {
      await request(app).post('/interactive/start').expect(200);

      expect(mockTerminalService.startSession).toHaveBeenCalledWith({
        ownerEmail: 'developer@localhost',
      });
    });

    it('should handle startSession errors', async () => {
      (mockTerminalService.startSession as any).mockRejectedValueOnce(
        new Error('Container failed')
      );

      const response = await request(app).post('/interactive/start').expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Failed to start'),
      });
    });
  });

  describe('POST /interactive/:id/stop', () => {
    it('should stop a session', async () => {
      const response = await request(app)
        .post('/interactive/session-123/stop')
        .send({ reason: 'User requested' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
      });
    });

    it('should call stopSession with sessionId and reason', async () => {
      await request(app)
        .post('/interactive/session-123/stop')
        .send({ reason: 'Test cleanup' })
        .expect(200);

      expect(mockTerminalService.stopSession).toHaveBeenCalledWith(
        'session-123',
        'Test cleanup'
      );
    });

    it('should use default reason if not provided', async () => {
      await request(app).post('/interactive/session-123/stop').expect(200);

      expect(mockTerminalService.stopSession).toHaveBeenCalledWith(
        'session-123',
        'User requested'
      );
    });

    it('should handle stopSession errors', async () => {
      (mockTerminalService.stopSession as any).mockRejectedValueOnce(
        new Error('Session not found')
      );

      const response = await request(app)
        .post('/interactive/session-123/stop')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Failed to stop'),
      });
    });
  });

  describe('POST /interactive/:id/reset', () => {
    it('should reset a session', async () => {
      const response = await request(app).post('/interactive/session-123/reset').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          sessionId: 'session-123',
          containerId: 'container-456',
          session: expect.objectContaining({
            id: 'session-123',
            containerId: 'container-456',
          }),
        },
      });
    });

    it('should call resetSession with sessionId', async () => {
      await request(app).post('/interactive/session-123/reset').expect(200);

      expect(mockTerminalService.resetSession).toHaveBeenCalledWith('session-123');
    });

    it('should handle resetSession errors', async () => {
      (mockTerminalService.resetSession as any).mockRejectedValueOnce(
        new Error('Container creation failed')
      );

      const response = await request(app)
        .post('/interactive/session-123/reset')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Failed to reset'),
      });
    });
  });

  describe('GET /interactive/:id', () => {
    it('should get session details', async () => {
      const response = await request(app).get('/interactive/session-123').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          id: 'session-123',
          status: 'running',
        }),
      });
    });

    it('should return 404 for nonexistent session', async () => {
      (mockTerminalService.getSession as any).mockReturnValueOnce(null);

      const response = await request(app).get('/interactive/nonexistent').expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Session not found',
      });
    });
  });

  describe('GET /interactive/active', () => {
    it('should get active session', async () => {
      const response = await request(app).get('/interactive/active').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          id: 'session-123',
          status: 'running',
        }),
      });
    });

    it('should return null when no active session', async () => {
      (mockTerminalService.getActiveSession as any).mockReturnValueOnce(null);

      const response = await request(app).get('/interactive/active').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: null,
      });
    });
  });

  describe('GET /interactive/sessions', () => {
    it('should list sessions with default limit', async () => {
      const response = await request(app).get('/interactive/sessions').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          sessions: expect.arrayContaining([
            expect.objectContaining({
              id: 'session-123',
            }),
          ]),
        },
      });
    });

    it('should use custom limit from query', async () => {
      (mockTerminalService.listSessions as any).mockClear();

      await request(app).get('/interactive/sessions?limit=5').expect(200);

      expect(mockTerminalService.listSessions).toHaveBeenCalledWith(5);
    });

    it('should use default limit for invalid values', async () => {
      (mockTerminalService.listSessions as any).mockClear();

      await request(app).get('/interactive/sessions?limit=invalid').expect(200);

      expect(mockTerminalService.listSessions).toHaveBeenCalledWith(20);
    });

    it('should cap limit at 100', async () => {
      (mockTerminalService.listSessions as any).mockClear();

      await request(app).get('/interactive/sessions?limit=500').expect(200);

      expect(mockTerminalService.listSessions).toHaveBeenCalledWith(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      (mockTerminalService.startSession as any).mockRejectedValueOnce(
        new Error('Unexpected error')
      );

      const response = await request(app).post('/interactive/start').expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/interactive/session-123/stop')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);

      // Express built-in error handling
    });
  });

  describe('Request Validation', () => {
    it('should accept valid session IDs', async () => {
      await request(app).get('/interactive/valid-session-123').expect(200);
    });

    it('should handle special characters in session IDs', async () => {
      const sessionId = 'session-abc-123-xyz';
      (mockTerminalService.getSession as any).mockReturnValueOnce({
        id: sessionId,
        status: 'running',
      });

      await request(app).get(`/interactive/${sessionId}`).expect(200);
    });
  });
});
