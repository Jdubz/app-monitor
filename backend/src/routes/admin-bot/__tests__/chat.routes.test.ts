/**
 * Admin Bot Chat Routes Integration Tests
 *
 * Tests for admin bot chat API endpoints.
 * Covers session management, message sending, SSE streaming, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { createAdminBotChatRoutes } from '../chat.routes';
import { AdminBotService } from '../../../services/AdminBotService';
import { EventEmitter } from 'events';

// Mock AdminBotService
vi.mock('../../../services/AdminBotService');

// Mock logger
vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Admin Bot Chat Routes', () => {
  let app: Express;
  let mockAdminBotService: AdminBotService;

  beforeEach(() => {
    // Create mock service
    mockAdminBotService = new EventEmitter() as any;
    mockAdminBotService.startSession = vi.fn();
    mockAdminBotService.stopSession = vi.fn();
    mockAdminBotService.sendMessage = vi.fn();
    mockAdminBotService.getSession = vi.fn();
    mockAdminBotService.isSessionRunning = vi.fn();
    mockAdminBotService.on = vi.fn().mockReturnThis();
    mockAdminBotService.off = vi.fn().mockReturnThis();

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/admin-bot/chat', createAdminBotChatRoutes(mockAdminBotService));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /start', () => {
    it('should start a new session successfully', async () => {
      (mockAdminBotService.startSession as Mock).mockResolvedValue('test-session-123');

      const response = await request(app)
        .post('/api/admin-bot/chat/start')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBe('test-session-123');
      expect(mockAdminBotService.startSession).toHaveBeenCalledTimes(1);
    });

    it('should return error when session already running', async () => {
      (mockAdminBotService.startSession as Mock).mockRejectedValue(
        new Error('Session already running. Stop current session before starting a new one.')
      );

      const response = await request(app)
        .post('/api/admin-bot/chat/start')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('failed_to_start_session');
    });

    it('should handle service errors gracefully', async () => {
      (mockAdminBotService.startSession as Mock).mockRejectedValue(
        new Error('Codex CLI not found')
      );

      const response = await request(app)
        .post('/api/admin-bot/chat/start')
        .expect(500);

      expect(response.body.success).toBe(false);
      // Error details may be in different field depending on sendError structure
      const errorMessage = response.body.details?.message || response.body.message;
      expect(errorMessage).toContain('Codex CLI not found');
    });
  });

  describe('POST /message', () => {
    it('should send message successfully', async () => {
      (mockAdminBotService.sendMessage as Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/admin-bot/chat/message')
        .send({ message: 'test message' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.received).toBe(true);
      expect(mockAdminBotService.sendMessage).toHaveBeenCalledWith('test message');
    });

    it('should validate message is required', async () => {
      const response = await request(app)
        .post('/api/admin-bot/chat/message')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('invalid_message');
      expect(mockAdminBotService.sendMessage).not.toHaveBeenCalled();
    });

    it('should validate message is a string', async () => {
      const response = await request(app)
        .post('/api/admin-bot/chat/message')
        .send({ message: 123 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('invalid_message');
      expect(mockAdminBotService.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle empty string message', async () => {
      const response = await request(app)
        .post('/api/admin-bot/chat/message')
        .send({ message: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(mockAdminBotService.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle service errors when sending message', async () => {
      (mockAdminBotService.sendMessage as Mock).mockRejectedValue(
        new Error('No active session')
      );

      const response = await request(app)
        .post('/api/admin-bot/chat/message')
        .send({ message: 'test' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('failed_to_send_message');
    });

    it('should handle multiline messages', async () => {
      (mockAdminBotService.sendMessage as Mock).mockResolvedValue(undefined);

      const multilineMessage = 'line 1\nline 2\nline 3';

      const response = await request(app)
        .post('/api/admin-bot/chat/message')
        .send({ message: multilineMessage })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockAdminBotService.sendMessage).toHaveBeenCalledWith(multilineMessage);
    });
  });

  describe('POST /stop', () => {
    it('should stop session successfully', async () => {
      (mockAdminBotService.stopSession as Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/admin-bot/chat/stop')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.stopped).toBe(true);
      expect(mockAdminBotService.stopSession).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when stopping session', async () => {
      (mockAdminBotService.stopSession as Mock).mockRejectedValue(
        new Error('Failed to stop process')
      );

      const response = await request(app)
        .post('/api/admin-bot/chat/stop')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('failed_to_stop_session');
    });

    it('should succeed even if no session exists', async () => {
      (mockAdminBotService.stopSession as Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/admin-bot/chat/stop')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /status', () => {
    it('should return status with active session', async () => {
      const mockSession = {
        id: 'test-session-123',
        status: 'running' as const,
        startedAt: new Date(),
        messages: [
          { id: '1', role: 'user' as const, content: 'test', timestamp: new Date() },
        ],
      };

      (mockAdminBotService.getSession as Mock).mockReturnValue(mockSession);
      (mockAdminBotService.isSessionRunning as Mock).mockReturnValue(true);

      const response = await request(app)
        .get('/api/admin-bot/chat/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session).toBeDefined();
      expect(response.body.data.session.id).toBe('test-session-123');
      expect(response.body.data.session.status).toBe('running');
      expect(response.body.data.session.messageCount).toBe(1);
      expect(response.body.data.isRunning).toBe(true);
    });

    it('should return status with no session', async () => {
      (mockAdminBotService.getSession as Mock).mockReturnValue(null);
      (mockAdminBotService.isSessionRunning as Mock).mockReturnValue(false);

      const response = await request(app)
        .get('/api/admin-bot/chat/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session).toBeNull();
      expect(response.body.data.isRunning).toBe(false);
    });

    it('should not expose full message content in status', async () => {
      const mockSession = {
        id: 'test-session-123',
        status: 'running' as const,
        startedAt: new Date(),
        messages: [
          {
            id: '1',
            role: 'user' as const,
            content: 'sensitive data',
            timestamp: new Date(),
          },
        ],
      };

      (mockAdminBotService.getSession as Mock).mockReturnValue(mockSession);
      (mockAdminBotService.isSessionRunning as Mock).mockReturnValue(true);

      const response = await request(app)
        .get('/api/admin-bot/chat/status')
        .expect(200);

      // Should only have messageCount, not full messages
      expect(response.body.data.session.messages).toBeUndefined();
      expect(response.body.data.session.messageCount).toBe(1);
    });
  });

  describe('GET /stream (SSE)', () => {
    it('should set correct SSE headers', (done) => {
      request(app)
        .get('/api/admin-bot/chat/stream')
        .expect('Content-Type', /text\/event-stream/)
        .expect('Cache-Control', 'no-cache')
        .expect('Connection', 'keep-alive')
        .end((err) => {
          if (err) return done(err);
          done();
        });
    });

    it('should send connected event on connection', (done) => {
      const req = request(app).get('/api/admin-bot/chat/stream');

      let receivedData = '';

      req.on('data', (chunk) => {
        receivedData += chunk.toString();

        if (receivedData.includes('connected')) {
          expect(receivedData).toContain('data:');
          expect(receivedData).toContain('"type":"connected"');
          req.abort();
          done();
        }
      });

      req.on('error', (err: any) => {
        // Ignore abort errors
        if (err.code !== 'ECONNRESET') {
          done(err);
        }
      });
    });

    it('should register event handlers on AdminBotService', (done) => {
      const req = request(app).get('/api/admin-bot/chat/stream');

      // Give time for handlers to be registered
      setTimeout(() => {
        expect(mockAdminBotService.on).toHaveBeenCalledWith('output', expect.any(Function));
        expect(mockAdminBotService.on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(mockAdminBotService.on).toHaveBeenCalledWith('exit', expect.any(Function));
        req.abort();
        done();
      }, 50);

      req.on('error', (err: any) => {
        if (err.code !== 'ECONNRESET') {
          done(err);
        }
      });
    });

    it('should clean up handlers on client disconnect', (done) => {
      const req = request(app).get('/api/admin-bot/chat/stream');

      // Give time for handlers to be registered
      setTimeout(() => {
        req.abort();

        // Give time for cleanup
        setTimeout(() => {
          expect(mockAdminBotService.off).toHaveBeenCalled();
          done();
        }, 50);
      }, 50);

      req.on('error', (err: any) => {
        if (err.code !== 'ECONNRESET') {
          done(err);
        }
      });
    });
  });

  describe('error handling', () => {
    it('should handle malformed JSON in message request', async () => {
      const response = await request(app)
        .post('/api/admin-bot/chat/message')
        .set('Content-Type', 'application/json')
        .send('{"message": invalid json}');

      // Malformed JSON should result in 400 error
      expect(response.status).toBe(400);
    });

    it('should handle service exceptions gracefully', async () => {
      (mockAdminBotService.sendMessage as Mock).mockRejectedValue(
        new Error('Unexpected error')
      );

      const response = await request(app)
        .post('/api/admin-bot/chat/message')
        .send({ message: 'test' })
        .expect(500);

      expect(response.body.success).toBe(false);
      const errorMessage = response.body.details?.message || response.body.message;
      expect(errorMessage).toBe('Unexpected error');
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple start requests', async () => {
      (mockAdminBotService.startSession as Mock)
        .mockResolvedValueOnce('session-1')
        .mockRejectedValueOnce(new Error('Session already running'));

      const [response1, response2] = await Promise.all([
        request(app).post('/api/admin-bot/chat/start'),
        request(app).post('/api/admin-bot/chat/start'),
      ]);

      // One should succeed, one should fail
      const successCount = [response1, response2].filter((r) => r.body.success).length;
      const errorCount = [response1, response2].filter((r) => !r.body.success).length;

      expect(successCount).toBe(1);
      expect(errorCount).toBe(1);
    });

    it('should handle concurrent message sends', async () => {
      (mockAdminBotService.sendMessage as Mock).mockResolvedValue(undefined);

      const messages = ['msg1', 'msg2', 'msg3'];
      const responses = await Promise.all(
        messages.map((msg) =>
          request(app).post('/api/admin-bot/chat/message').send({ message: msg })
        )
      );

      // All should succeed
      responses.forEach((response) => {
        expect(response.body.success).toBe(true);
      });

      expect(mockAdminBotService.sendMessage).toHaveBeenCalledTimes(3);
    });
  });
});
