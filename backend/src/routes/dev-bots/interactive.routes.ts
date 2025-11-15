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
      res.json({ success: true, data: payload });
    } catch (error) {
      logger.error('Failed to fetch interactive session state', { error });
      res.status(500).json({
        success: false,
        error: 'fetch_failed',
        message: error instanceof Error ? error.message : 'Failed to fetch interactive session state',
      });
    }
  });

  /**
   * POST /interactive/session
   * Start new interactive session
   */
  router.post('/interactive/session', async (req: Request, res: Response) => {
    const payload = req.body as DevBotsInteractiveSessionStartPayload | undefined;
    if (!payload || typeof payload.modelProvider !== 'string' || typeof payload.modelName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'invalid_payload',
        message: 'modelProvider and modelName are required',
      });
    }
    try {
      await devBotsManager.launchInteractiveSession({
        ownerEmail: getRequestUserEmail(req) ?? DEFAULT_INTERACTIVE_OWNER_EMAIL,
        modelProvider: payload.modelProvider,
        modelName: payload.modelName,
        metadata: payload.metadata,
      });
      const state = buildInteractiveSessionState(devBotsManager);
      res.status(201).json({ success: true, data: state });
    } catch (error) {
      logger.error('Failed to start interactive session', { error, payload });
      res.status(500).json({
        success: false,
        error: 'interactive_session_failed',
        message: error instanceof Error ? error.message : 'Failed to launch session',
      });
    }
  });

  /**
   * DELETE /interactive/session
   * End current interactive session
   */
  router.delete('/interactive/session', async (req: Request, res: Response) => {
    let sessionId: string | undefined;
    try {
      const session = devBotsManager.getActiveInteractiveSession();
      if (!session) {
        return res.status(404).json({ success: false, error: 'not_found', message: 'No active interactive session' });
      }
      sessionId = session.id;
      await devBotsManager.endInteractiveSession(sessionId, 'Operator ended session');
      const payload: DevBotsInteractiveSessionStateResponse['data'] = buildInteractiveSessionState(devBotsManager);
      res.json({ success: true, data: payload });
    } catch (error) {
      logger.error('Failed to end interactive session', { error, sessionId });
      res.status(500).json({
        success: false,
        error: 'end_session_failed',
        message: error instanceof Error ? error.message : 'Failed to end interactive session',
      });
    }
  });

  /**
   * POST /interactive/session/:sessionId/input
   * Send input to interactive session
   */
  router.post('/interactive/session/:sessionId/input', (req: Request, res: Response) => {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'invalid_params', message: 'sessionId is required' });
    }
    const payload = req.body as DevBotsInteractiveSessionInputPayload | undefined;
    if (!payload || typeof payload.data !== 'string' || payload.data.length === 0) {
      return res.status(400).json({ success: false, error: 'invalid_payload', message: 'input data is required' });
    }
    const session = devBotsManager.getInteractiveSession(sessionId);
    if (!session || session.status === 'ended') {
      return res.status(404).json({ success: false, error: 'not_found', message: 'Session not found or already ended' });
    }
    devBotsManager.sendInteractiveInput(sessionId, payload.data);
    res.json({ data: { success: true, data: { accepted: true } }});
  });

  /**
   * POST /interactive/heartbeat
   * Record heartbeat from client or agent
   */
  router.post('/interactive/heartbeat', (req: Request, res: Response) => {
    const payload = req.body as DevBotsInteractiveHeartbeatPayload | undefined;
    if (!payload || typeof payload.sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'invalid_payload', message: 'sessionId is required' });
    }
    const session = devBotsManager.getInteractiveSession(payload.sessionId);
    if (!session || session.status === 'ended') {
      return res.status(404).json({ success: false, error: 'not_found', message: 'Session not found' });
    }
    const source = payload.source === 'agent' ? 'agent' : 'user';
    devBotsManager.recordInteractiveActivity(payload.sessionId, source);
    res.json({ data: { success: true, data: { acknowledged: true } }});
  });

  /**
   * POST /interactive/interrupt
   * Send interrupt signal to interactive session
   */
  router.post('/interactive/interrupt', (req: Request, res: Response) => {
    const payload = req.body as DevBotsInteractiveInterruptPayload | undefined;
    if (!payload || typeof payload.sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'invalid_payload', message: 'sessionId is required' });
    }
    const session = devBotsManager.getInteractiveSession(payload.sessionId);
    if (!session || session.status === 'ended') {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Session not found or already ended',
      });
    }
    devBotsManager.sendInteractiveSignal(payload.sessionId, 'interrupt');
    res.json({ success: true, data: { message: 'Interrupt signal sent' } });
  });

  return router;
}
