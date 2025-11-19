/**
 * Terminal Routes - REST API for terminal session management
 */

import { Router, Request, Response } from 'express';
import type { TerminalService } from '../services/TerminalService.js';
import { sendSuccess, sendError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

export function createTerminalRoutes(terminalService: TerminalService): Router {
  const router = Router();

  /**
   * GET /api/terminal/sessions
   * List all active terminal sessions
   */
  router.get('/sessions', (_req: Request, res: Response) => {
    try {
      const sessions = terminalService.getSessions().map(session => ({
        id: session.id,
        tmuxSessionName: session.tmuxSessionName,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        connectedClients: session.connectedClients.size,
      }));

      sendSuccess(res, { sessions });
    } catch (error) {
      logger.error('Failed to list terminal sessions', { error });
      sendError(res, 'Failed to list terminal sessions', 500);
    }
  });

  /**
   * GET /api/terminal/sessions/:id
   * Get details of a specific terminal session
   */
  router.get('/sessions/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = terminalService.getSession(id);

      if (!session) {
        sendError(res, 'Session not found', 404);
        return;
      }

      sendSuccess(res, {
        session: {
          id: session.id,
          tmuxSessionName: session.tmuxSessionName,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          connectedClients: session.connectedClients.size,
        }
      });
    } catch (error) {
      logger.error('Failed to get terminal session', { error });
      sendError(res, 'Failed to get terminal session', 500);
    }
  });

  /**
   * DELETE /api/terminal/sessions/:id
   * Kill a terminal session
   */
  router.delete('/sessions/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = terminalService.getSession(id);

      if (!session) {
        sendError(res, 'Session not found', 404);
        return;
      }

      await terminalService.killSession(id);
      sendSuccess(res, { message: 'Session killed' });
    } catch (error) {
      logger.error('Failed to kill terminal session', { error });
      sendError(res, 'Failed to kill terminal session', 500);
    }
  });

  return router;
}
