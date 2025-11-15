// Temporarily disable broken routes until DevBotsManager interface is updated
import { Router, type Request, type Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { sendSuccess, sendError } from '../helpers/responseHelpers.js';
import type {
  DevBotsInteractiveSessionInputPayload,
  DevBotsInteractiveHeartbeatPayload,
  DevBotsInteractiveInterruptPayload,
} from '@app-monitor/api-contracts';

export function createInteractiveRoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();

  // TODO: Re-enable when DevBotsManager interface is updated
  // These routes need: startInteractiveSession, hasActiveInteractiveSession, stopInteractiveSession methods
  
  router.post('/interactive/input', (req: Request, res: Response) => {
    const { sessionId, input } = req.body as DevBotsInteractiveSessionInputPayload;

    if (!sessionId || !input) {
      return sendError(res, 'invalid_params', 400, { message: 'sessionId and input are required' });
    }

    if (!devBotsManager.sendInteractiveInput(sessionId, input)) {
      return sendError(res, 'not_found', 404, { message: 'Session not found or already ended' });
    }

    sendSuccess(res, { accepted: true });
  });

  router.post('/interactive/heartbeat', (req: Request, res: Response) => {
    const { sessionId } = req.body as DevBotsInteractiveHeartbeatPayload;

    if (!sessionId) {
      return sendError(res, 'invalid_params', 400, { message: 'sessionId is required' });
    }

    devBotsManager.recordInteractiveHeartbeat?.(sessionId);
    sendSuccess(res, { acknowledged: true });
  });

  router.post('/interactive/interrupt', (req: Request, res: Response) => {
    const { sessionId } = req.body as DevBotsInteractiveInterruptPayload;

    if (!sessionId) {
      return sendError(res, 'invalid_payload', 400, { message: 'sessionId is required' });
    }

    const interrupted = devBotsManager.interruptExecution?.(sessionId) ?? false;
    if (!interrupted) {
      return sendError(res, 'not_found', 404, { message: `Interactive session ${sessionId} not found or not running` });
    }

    sendSuccess(res, { interrupted: true });
  });

  return router;
}
