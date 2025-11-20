/**
 * STUB: Interactive Session Routes
 *
 * Temporary stub that returns "not implemented" for all endpoints
 * while we rebuild the terminal feature with tmux.
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { sendError } from '../../utils/apiResponse.js';
import { defineRoute } from '../routeRegistry.js';

export function createInteractiveRoutes(_devBotsManager: DevBotsManager): Router {
  const router = Router();

  const getSessionRoute = defineRoute({
    method: 'get',
    path: '/interactive/session',
    summary: 'Get Interactive Session',
    description: 'Get current interactive session status (temporarily disabled)',
    tags: ['dev-bots', 'interactive'],
    handler: (_req: Request, res: Response) => {
      sendError(res, 'not_implemented', 501, {
        message: 'Interactive sessions temporarily disabled - feature being rebuilt with tmux'
      });
    }
  });
  router[getSessionRoute.method](getSessionRoute.path, getSessionRoute.handler);

  const createSessionRoute = defineRoute({
    method: 'post',
    path: '/interactive/session',
    summary: 'Create Interactive Session',
    description: 'Create a new interactive session (temporarily disabled)',
    tags: ['dev-bots', 'interactive'],
    handler: (_req: Request, res: Response) => {
      sendError(res, 'not_implemented', 501, {
        message: 'Interactive sessions temporarily disabled - feature being rebuilt with tmux'
      });
    }
  });
  router[createSessionRoute.method](createSessionRoute.path, createSessionRoute.handler);

  const deleteSessionRoute = defineRoute({
    method: 'delete',
    path: '/interactive/session',
    summary: 'Delete Interactive Session',
    description: 'Delete current interactive session (temporarily disabled)',
    tags: ['dev-bots', 'interactive'],
    handler: (_req: Request, res: Response) => {
      sendError(res, 'not_implemented', 501, {
        message: 'Interactive sessions temporarily disabled - feature being rebuilt with tmux'
      });
    }
  });
  router[deleteSessionRoute.method](deleteSessionRoute.path, deleteSessionRoute.handler);

  const heartbeatRoute = defineRoute({
    method: 'post',
    path: '/interactive/heartbeat',
    summary: 'Interactive Session Heartbeat',
    description: 'Send heartbeat to keep interactive session alive (temporarily disabled)',
    tags: ['dev-bots', 'interactive'],
    handler: (_req: Request, res: Response) => {
      sendError(res, 'not_implemented', 501, {
        message: 'Interactive sessions temporarily disabled - feature being rebuilt with tmux'
      });
    }
  });
  router[heartbeatRoute.method](heartbeatRoute.path, heartbeatRoute.handler);

  return router;
}
