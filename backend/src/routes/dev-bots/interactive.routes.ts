/**
 * Interactive Session Routes
 *
 * Endpoints for managing interactive DevBot sessions
 * - Session lifecycle (start, stop, status)
 * - Input/output streaming via WebSocket gateway
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
  type DevBotsInteractiveSessionInputPayload,
  type DevBotsInteractiveHeartbeatPayload,
  type DevBotsInteractiveInterruptPayload,
} from './shared.js';
import type { DevBotsInteractiveSessionStartPayload } from '@app-monitor/api-contracts';

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
      logger.error({
        category: 'api',
        action: 'get_interactive_session_failed',
        message: 'Failed to fetch interactive session state',
        error
      });
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

      if (!payload.modelProvider || !payload.modelName) {
        return sendError(res, 'invalid_params', 400, { message: 'modelProvider and modelName are required' });
      }

      const sessionRecord = await devBotsManager.launchInteractiveSession({
        modelProvider: payload.modelProvider,
        modelName: payload.modelName,
        ownerEmail,
        metadata: payload.metadata
      });

      const state = buildInteractiveSessionState(devBotsManager);
      
      logger.info({
        category: 'api',
        action: 'interactive_session_started',
        message: 'Interactive session started',
        details: { sessionId: sessionRecord.id, modelProvider: payload.modelProvider, modelName: payload.modelName }
      });

      sendSuccess(res, state, 201);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'start_interactive_session_failed',
        message: 'Failed to start interactive session',
        error
      });
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
  router.delete('/interactive/session', async (req: Request, res: Response) => {
    try {
      const activeSession = devBotsManager.getActiveInteractiveSession();
      
      if (!activeSession) {
        return sendError(res, 'not_found', 404, { message: 'No active interactive session' });
      }

      await devBotsManager.endInteractiveSession(activeSession.id, 'user_requested');
      
      const state = buildInteractiveSessionState(devBotsManager);
      
      logger.info({
        category: 'api',
        action: 'interactive_session_ended',
        message: 'Interactive session ended',
        details: { sessionId: activeSession.id }
      });

      sendSuccess(res, state);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'end_interactive_session_failed',
        message: 'Failed to stop interactive session',
        error
      });
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
    const { data } = req.body as DevBotsInteractiveSessionInputPayload;
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      return sendError(res, 'invalid_params', 400, { message: 'sessionId is required' });
    }

    if (!data) {
      return sendError(res, 'invalid_payload', 400, { message: 'input data is required' });
    }

    // Note: Input is now sent directly via Socket.IO (terminal:input event)
    // This REST endpoint is deprecated - clients should use Socket.IO
    sendError(res, 'deprecated', 410, {
      message: 'This endpoint is deprecated. Use Socket.IO terminal:input event instead.'
    });
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

    try {
      devBotsManager.recordInteractiveActivity(sessionId, 'user');
      sendSuccess(res, { acknowledged: true });
    } catch (error) {
      logger.warn({
        category: 'api',
        action: 'interactive_heartbeat_failed',
        message: `Heartbeat for non-existent session: ${sessionId}`,
        error,
      });
      sendError(res, 'not_found', 404, { message: `Session ${sessionId} not found` });
    }
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

    // Note: Signals are now sent directly via Socket.IO (terminal:signal event)
    // This REST endpoint is deprecated - clients should use Socket.IO
    sendError(res, 'deprecated', 410, {
      message: 'This endpoint is deprecated. Use Socket.IO terminal:signal event instead.'
    });
  });

  return router;
}
