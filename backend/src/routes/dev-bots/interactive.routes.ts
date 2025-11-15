// Temporarily disable broken routes until DevBotsManager interface is updated
import { Router, type Request, type Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { sendError } from '../helpers.js';

export function createInteractiveRoutes(_devBotsManager: DevBotsManager): Router {
  const router = Router();

  // TODO: Re-enable when DevBotsManager interface is updated with proper methods
  router.post('/interactive/input', (_req: Request, res: Response) => {
    sendError(res, 'not_implemented', 501, { message: 'Interactive routes temporarily disabled' });
  });

  router.post('/interactive/heartbeat', (_req: Request, res: Response) => {
    sendError(res, 'not_implemented', 501, { message: 'Interactive routes temporarily disabled' });
  });

  router.post('/interactive/interrupt', (_req: Request, res: Response) => {
    sendError(res, 'not_implemented', 501, { message: 'Interactive routes temporarily disabled' });
  });

  router.post('/interactive/session', (_req: Request, res: Response) => {
    sendError(res, 'not_implemented', 501, { message: 'Interactive routes temporarily disabled' });
  });

  router.delete('/interactive/session', (_req: Request, res: Response) => {
    sendError(res, 'not_implemented', 501, { message: 'Interactive routes temporarily disabled' });
  });

  return router;
}
