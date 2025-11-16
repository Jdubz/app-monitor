/**
 * Interactive Terminal Routes - V0
 *
 * Simple, clean REST API for interactive terminal sessions.
 * All state is database-backed for deployment safety.
 *
 * Endpoints:
 * - POST   /interactive/start       - Start a new session
 * - POST   /interactive/:id/stop    - Stop a session
 * - POST   /interactive/:id/reset   - Reset a session
 * - GET    /interactive/:id         - Get session details
 * - GET    /interactive/active      - Get active session (single-session mode)
 * - GET    /interactive/sessions    - List recent sessions
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger.js';
import * as ErrorResponses from '../../utils/errorResponses.js';
import { getRequestUserEmail, DEFAULT_INTERACTIVE_OWNER_EMAIL } from './shared.js';
import type { InteractiveTerminalService } from '../../services/interactiveTerminal.service.js';

export interface CreateInteractiveTerminalRoutesOptions {
  terminalService: InteractiveTerminalService;
}

/**
 * Create interactive terminal routes
 */
export function createInteractiveTerminalRoutes(
  options: CreateInteractiveTerminalRoutesOptions
): Router {
  const router = Router();
  const { terminalService } = options;

  /**
   * POST /interactive/start
   * Start a new interactive terminal session
   *
   * Response:
   * {
   *   success: true,
   *   data: {
   *     sessionId: string,
   *     containerId: string,
   *     session: InteractiveSessionRecord
   *   }
   * }
   */
  router.post('/interactive/start', async (req: Request, res: Response) => {
    try {
      const ownerEmail = getRequestUserEmail(req) ?? DEFAULT_INTERACTIVE_OWNER_EMAIL;

      logger.info({
        category: 'interactive_terminal',
        action: 'start_requested',
        message: 'Interactive terminal start requested',
        details: { ownerEmail },
      });

      const result = await terminalService.startSession({ ownerEmail });

      logger.info({
        category: 'interactive_terminal',
        action: 'start_success',
        message: 'Interactive terminal session started',
        details: {
          sessionId: result.sessionId,
          containerId: result.containerId,
        },
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return ErrorResponses.internalError(
        res,
        'Failed to start interactive terminal session',
        {
          category: 'interactive_terminal',
          action: 'start_failed',
        },
        error
      );
    }
  });

  /**
   * POST /interactive/:id/stop
   * Stop an interactive terminal session
   *
   * Body (optional):
   * {
   *   reason?: string
   * }
   *
   * Response:
   * {
   *   success: true,
   *   data: { sessionId: string }
   * }
   */
  router.post('/interactive/:id/stop', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id;
      const reason = req.body?.reason ?? 'User requested';

      logger.info({
        category: 'interactive_terminal',
        action: 'stop_requested',
        message: 'Interactive terminal stop requested',
        details: { sessionId, reason },
      });

      await terminalService.stopSession(sessionId, reason);

      logger.info({
        category: 'interactive_terminal',
        action: 'stop_success',
        message: 'Interactive terminal session stopped',
        details: { sessionId },
      });

      res.json({
        success: true,
        data: { sessionId },
      });
    } catch (error) {
      return ErrorResponses.internalError(
        res,
        'Failed to stop interactive terminal session',
        {
          category: 'interactive_terminal',
          action: 'stop_failed',
        },
        error
      );
    }
  });

  /**
   * POST /interactive/:id/reset
   * Reset an interactive terminal session
   * Stops the old container and starts a fresh one with the same session ID
   *
   * Response:
   * {
   *   success: true,
   *   data: {
   *     sessionId: string,
   *     containerId: string,
   *     session: InteractiveSessionRecord
   *   }
   * }
   */
  router.post('/interactive/:id/reset', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id;

      logger.info({
        category: 'interactive_terminal',
        action: 'reset_requested',
        message: 'Interactive terminal reset requested',
        details: { sessionId },
      });

      const result = await terminalService.resetSession(sessionId);

      logger.info({
        category: 'interactive_terminal',
        action: 'reset_success',
        message: 'Interactive terminal session reset',
        details: {
          sessionId: result.sessionId,
          newContainerId: result.containerId,
        },
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return ErrorResponses.internalError(
        res,
        'Failed to reset interactive terminal session',
        {
          category: 'interactive_terminal',
          action: 'reset_failed',
        },
        error
      );
    }
  });

  /**
   * GET /interactive/:id
   * Get interactive terminal session details
   *
   * Response:
   * {
   *   success: true,
   *   data: InteractiveSessionRecord | null
   * }
   */
  router.get('/interactive/:id', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id;

      const session = terminalService.getSession(sessionId);

      if (!session) {
        return ErrorResponses.notFound(res, 'Session not found', {
          category: 'interactive_terminal',
          action: 'session_not_found',
        });
      }

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      return ErrorResponses.internalError(
        res,
        'Failed to get interactive terminal session',
        {
          category: 'interactive_terminal',
          action: 'get_session_failed',
        },
        error
      );
    }
  });

  /**
   * GET /interactive/active
   * Get the currently active interactive terminal session (single-session mode)
   *
   * Response:
   * {
   *   success: true,
   *   data: InteractiveSessionRecord | null
   * }
   */
  router.get('/interactive/active', async (_req: Request, res: Response) => {
    try {
      const session = terminalService.getActiveSession();

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      return ErrorResponses.internalError(
        res,
        'Failed to get active interactive terminal session',
        {
          category: 'interactive_terminal',
          action: 'get_active_failed',
        },
        error
      );
    }
  });

  /**
   * GET /interactive/sessions
   * List recent interactive terminal sessions
   *
   * Query params:
   * - limit?: number (default: 20)
   *
   * Response:
   * {
   *   success: true,
   *   data: InteractiveSessionRecord[]
   * }
   */
  router.get('/interactive/sessions', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const sessions = terminalService.listSessions(limit);

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      return ErrorResponses.internalError(
        res,
        'Failed to list interactive terminal sessions',
        {
          category: 'interactive_terminal',
          action: 'list_sessions_failed',
        },
        error
      );
    }
  });

  return router;
}
