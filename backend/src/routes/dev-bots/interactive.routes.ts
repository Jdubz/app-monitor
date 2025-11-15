/**
 * Interactive Session Routes
 *
 * Endpoints for managing interactive DevBot sessions
 * - Session lifecycle (start, stop, status)
 * - Input/output streaming
 * - Heartbeat and activity tracking
 * - Interrupt signaling
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { logger } from '../../utils/logger.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';
import {
  buildInteractiveSessionState,
  getRequestUserEmail,
  DEFAULT_INTERACTIVE_OWNER_EMAIL,
  type DevBotsInteractiveSessionStateResponse,
  type DevBotsInteractiveSessionStartPayload,
  type DevBotsInteractiveSessionInputPayload,
  type DevBotsInteractiveHeartbeatPayload,
  type DevBotsInteractiveInterruptPayload,
} from './shared.js';

/**
 * Create interactive session routes
 */
export function createInteractiveRoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();

  /**
   * GET /interactive/session
   * Get current interactive session state
   */
  router.get('/interactive/session', (_req: Request, res: Response) => {
    try {
      const payload: DevBotsInteractiveSessionStateResponse['data'] = buildInteractiveSessionState(devBotsManager);
      sendSuccess(res, payload);
    } catch (error) {
      logger.error('Failed to fetch interactive session state', { error });
      sendError(
        res,
        'fetch_failed',
        500,
        { message: error instanceof Error ? error.message : 'Failed to fetch interactive session state' }
      );
    }
  });

  /**
   * POST /interactive/session
   * Start a new interactive session
   */
  router.post('/interactive/session', async (req: Request, res: Response) => {
    try {
      const payload = req.body as DevBotsInteractiveSessionStartPayload;
      const ownerEmail = getRequestUserEmail(req) ?? DEFAULT_INTERACTIVE_OWNER_EMAIL;

      if (!payload.modelOption) {
        return sendError(res, 'invalid_params', 400, { message: 'modelOption is required' });
      }

      const state = await devBotsManager.startInteractiveSession({
        modelOption: payload.modelOption,
        ownerEmail,
      });

      sendSuccess(res, state, 201);
    } catch (error) {
      sendError(
        res,
        'session_start_failed',
        500,
        { message: error instanceof Error ? error.message : 'Failed to start interactive session' }
      );
    }
  });

  /**
   * DELETE /interactive/session
   * Stop the current interactive session
   */
  router.delete('/interactive/session', (_req: Request, res: Response) => {
    try {
      if (!devBotsManager.hasActiveInteractiveSession()) {
        return sendError(res, 'not_found', 404, { message: 'No active interactive session' });
      }

      devBotsManager.stopInteractiveSession();
      const payload: DevBotsInteractiveSessionStateResponse['data'] = buildInteractiveSessionState(devBotsManager);
      sendSuccess(res, payload);
    } catch (error) {
      sendError(
        res,
        'session_stop_failed',
        500,
        { message: error instanceof Error ? error.message : 'Failed to stop interactive session' }
      );
    }
  });

  /**
   * POST /interactive/input
   * Send input to an active interactive session
   */
  router.post('/interactive/input', (req: Request, res: Response) => {
    const { sessionId, input } = req.body as DevBotsInteractiveSessionInputPayload;

    if (!sessionId) {
      return sendError(res, 'invalid_params', 400, { message: 'sessionId is required' });
    }

    if (!input) {
      return sendError(res, 'invalid_payload', 400, { message: 'input data is required' });
    }

    if (!devBotsManager.sendInteractiveInput(sessionId, input)) {
      return sendError(res, 'not_found', 404, { message: 'Session not found or already ended' });
    }

    sendSuccess(res, { accepted: true });
  });

  /**
   * POST /interactive/heartbeat
   * Send heartbeat to keep session alive
   */
  router.post('/interactive/heartbeat', (req: Request, res: Response) => {
    const { sessionId } = req.body as DevBotsInteractiveHeartbeatPayload;

    if (!sessionId) {
      return sendError(res, 'invalid_payload', 400, { message: 'sessionId is required' });
    }

    if (!devBotsManager.recordInteractiveHeartbeat(sessionId)) {
      return sendError(res, 'not_found', 404, { message: 'Session not found' });
    }

    sendSuccess(res, { acknowledged: true });
  });

  /**
   * POST /interactive/interrupt
   * Send interrupt signal to running interactive session
   */
  router.post('/interactive/interrupt', (req: Request, res: Response) => {
    const { sessionId } = req.body as DevBotsInteractiveInterruptPayload;

    if (!sessionId) {
      return sendError(res, 'invalid_payload', 400, { message: 'sessionId is required' });
    }

    if (!devBotsManager.interruptInteractiveSession(sessionId)) {
      return sendError(
        res,
        'not_found',
        404,
        { message: `Interactive session ${sessionId} not found or not running` }
      );
    }

    sendSuccess(res, { message: 'Interrupt signal sent' });
  });

  return router;
}
