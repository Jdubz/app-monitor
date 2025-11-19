/**
 * STUB: Interactive Session Routes
 *
 * Temporary stub that returns "not implemented" for all endpoints
 * while we rebuild the terminal feature with tmux.
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { sendError } from '../../utils/apiResponse.js';

export function createInteractiveRoutes(_devBotsManager: DevBotsManager): Router {
  const router = Router();

  router.get('/interactive/session', (_req: Request, res: Response) => {
    sendError(res, 'not_implemented', 501, {
      message: 'Interactive sessions temporarily disabled - feature being rebuilt with tmux'
    });
  });

  router.post('/interactive/session', (_req: Request, res: Response) => {
    sendError(res, 'not_implemented', 501, {
      message: 'Interactive sessions temporarily disabled - feature being rebuilt with tmux'
    });
  });

  router.delete('/interactive/session', (_req: Request, res: Response) => {
    sendError(res, 'not_implemented', 501, {
      message: 'Interactive sessions temporarily disabled - feature being rebuilt with tmux'
    });
  });

  router.post('/interactive/heartbeat', (_req: Request, res: Response) => {
    sendError(res, 'not_implemented', 501, {
      message: 'Interactive sessions temporarily disabled - feature being rebuilt with tmux'
    });
  });

  return router;
}
