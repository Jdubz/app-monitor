/**
 * Admin Bot Chat Routes
 *
 * RESTful endpoints for managing admin bot chat sessions with Codex CLI.
 * Provides session management (start/stop), message sending, and SSE streaming.
 *
 * Routes:
 * - POST /start - Start a new chat session
 * - POST /message - Send a message to active session
 * - GET /stream - SSE stream for receiving responses
 * - POST /stop - Stop current session
 * - GET /status - Get current session status
 */

import { Router, Request, Response } from 'express';
import type { AdminBotService } from '../../services/AdminBotService.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';
import { logger } from '../../utils/logger.js';

export function createAdminBotChatRoutes(adminBotService: AdminBotService): Router {
  const router = Router();

  /**
   * POST /start
   * Start a new admin bot chat session
   *
   * Response: { sessionId: string }
   */
  router.post('/start', async (req: Request, res: Response) => {
    try {
      logger.info({
        category: 'admin_bot_chat',
        action: 'start_request',
        message: 'Received request to start admin bot session'
      });

      const sessionId = await adminBotService.startSession();

      sendSuccess(res, {
        sessionId,
        message: 'Admin bot session started successfully'
      });

    } catch (error) {
      logger.error({
        category: 'admin_bot_chat',
        action: 'start_error',
        message: 'Failed to start admin bot session',
        error: error instanceof Error ? error.message : String(error)
      });

      sendError(
        res,
        'failed_to_start_session',
        500,
        {
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      );
    }
  });

  /**
   * POST /message
   * Send a message to the active admin bot session
   *
   * Body: { message: string }
   * Response: { received: boolean }
   */
  router.post('/message', async (req: Request, res: Response) => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        sendError(res, 'invalid_message', 400, {
          message: 'Message is required and must be a string'
        });
        return;
      }

      // Validate message length (prevent DoS)
      const MAX_MESSAGE_LENGTH = 10000;
      if (message.length > MAX_MESSAGE_LENGTH) {
        sendError(res, 'message_too_large', 400, {
          message: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`
        });
        return;
      }

      // Sanitize message (remove control characters except newline/tab)
      const sanitized = message
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); // Remove ANSI escape sequences

      await adminBotService.sendMessage(sanitized);

      sendSuccess(res, {
        received: true,
        message: 'Message sent to admin bot'
      });

    } catch (error) {
      logger.error({
        category: 'admin_bot_chat',
        action: 'message_error',
        message: 'Failed to send message',
        error: error instanceof Error ? error.message : String(error)
      });

      sendError(
        res,
        'failed_to_send_message',
        500,
        {
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      );
    }
  });

  /**
   * GET /stream
   * Server-Sent Events stream for admin bot responses
   *
   * Streams output from Codex CLI in real-time.
   * Events: output, error, exit
   */
  router.get('/stream', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    logger.info({
      category: 'admin_bot_chat',
      action: 'stream_connected',
      message: 'Client connected to admin bot SSE stream'
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    // Stream output from admin bot
    const outputHandler = (data: string) => {
      res.write(`data: ${JSON.stringify({ type: 'output', content: data })}\n\n`);
    };

    const errorHandler = (error: string) => {
      res.write(`data: ${JSON.stringify({ type: 'error', content: error })}\n\n`);
    };

    const exitHandler = (code: number | null) => {
      res.write(`data: ${JSON.stringify({ type: 'exit', code })}\n\n`);
      res.end();
    };

    adminBotService.on('output', outputHandler);
    adminBotService.on('error', errorHandler);
    adminBotService.on('exit', exitHandler);

    // Clean up on client disconnect
    req.on('close', () => {
      logger.info({
        category: 'admin_bot_chat',
        action: 'stream_disconnected',
        message: 'Client disconnected from admin bot SSE stream'
      });

      adminBotService.off('output', outputHandler);
      adminBotService.off('error', errorHandler);
      adminBotService.off('exit', exitHandler);
      res.end();
    });
  });

  /**
   * POST /stop
   * Stop the current admin bot session
   *
   * Response: { stopped: boolean }
   */
  router.post('/stop', async (req: Request, res: Response) => {
    try {
      logger.info({
        category: 'admin_bot_chat',
        action: 'stop_request',
        message: 'Received request to stop admin bot session'
      });

      await adminBotService.stopSession();

      sendSuccess(res, {
        stopped: true,
        message: 'Admin bot session stopped'
      });

    } catch (error) {
      logger.error({
        category: 'admin_bot_chat',
        action: 'stop_error',
        message: 'Failed to stop admin bot session',
        error: error instanceof Error ? error.message : String(error)
      });

      sendError(
        res,
        'failed_to_stop_session',
        500,
        {
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      );
    }
  });

  /**
   * GET /status
   * Get current session status
   *
   * Response: { session: AdminBotSession | null, isRunning: boolean }
   */
  router.get('/status', (req: Request, res: Response) => {
    const session = adminBotService.getSession();

    sendSuccess(res, {
      session: session ? {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt,
        messageCount: session.messages.length
      } : null,
      isRunning: adminBotService.isSessionRunning()
    });
  });

  return router;
}
