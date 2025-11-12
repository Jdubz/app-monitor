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
   * GET /session
   * Get current interactive session state
   */
  router.get('/session', (_req: Request, res: Response) => {
    const payload: DevBotsInteractiveSessionStateResponse['data'] = buildInteractiveSessionState(devBotsManager);
    res.json({ success: true, data: payload });
  });

  /**
   * POST /session
   * Start new interactive session
   */
  router.post('/session', async (req: Request, res: Response) => {
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
      res.status(500).json({
        success: false,
        error: 'interactive_session_failed',
        message: error instanceof Error ? error.message : 'Failed to launch session',
      });
    }
  });

  /**
   * DELETE /session
   * End current interactive session
   */
  router.delete('/session', async (req: Request, res: Response) => {
    const session = devBotsManager.getActiveInteractiveSession();
    if (!session) {
      return res.status(404).json({ success: false, error: 'not_found', message: 'No active interactive session' });
    }
    await devBotsManager.endInteractiveSession(session.id, 'Operator ended session');
    const payload: DevBotsInteractiveSessionStateResponse['data'] = buildInteractiveSessionState(devBotsManager);
    res.json({ success: true, data: payload });
  });

  /**
   * POST /session/:sessionId/input
   * Send input to interactive session
   */
  router.post('/session/:sessionId/input', (req: Request, res: Response) => {
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
    res.json({ success: true, data: { accepted: true } });
  });

  /**
   * POST /heartbeat
   * Record heartbeat from client or agent
   */
  router.post('/heartbeat', (req: Request, res: Response) => {
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
    res.json({ success: true, data: { acknowledged: true } });
  });

  /**
   * POST /interrupt
   * Send interrupt signal to interactive session
   */
  router.post('/interrupt', (req: Request, res: Response) => {
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
