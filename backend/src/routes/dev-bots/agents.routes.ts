/**
 * Agent Management Routes
 *
 * Endpoints for managing and querying DevBot agent personalities
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { logger } from '../../utils/logger.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';
import { defineRoute } from '../routeRegistry.js';

/**
 * Create agent management routes
 */
export function createAgentsRoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();

  const getAgentsRoute = defineRoute({
    method: 'get',
    path: '/agents',
    summary: 'Get Agent Personalities',
    description: 'Get all agent personalities with their configurations',
    tags: ['dev-bots', 'agents'],
    handler: (_req: Request, res: Response) => {
      try {
        const agents = devBotsManager.getAgentPersonalities();
        sendSuccess(res, { agents });
      } catch (error) {
        logger.error({
          category: 'api',
          action: 'error_getting_agent_personalities_error',
          message: `Error getting agent personalities: ${error}`,
          error
        });
        sendError(
          res,
          'Failed to get agent personalities',
          500,
          { message: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  });
  router[getAgentsRoute.method](getAgentsRoute.path, getAgentsRoute.handler);

  const getValidAgentsRoute = defineRoute({
    method: 'get',
    path: '/agents/valid',
    summary: 'Get Valid Agent IDs',
    description: 'Get list of valid agent IDs (names only)',
    tags: ['dev-bots', 'agents'],
    handler: (_req: Request, res: Response) => {
      try {
        const validAgents = devBotsManager.getValidAgents();
        sendSuccess(res, { validAgents });
      } catch (error) {
        logger.error({
          category: 'api',
          action: 'error_getting_valid_agents_error',
          message: `Error getting valid agents: ${error}`,
          error
        });
        sendError(
          res,
          'Failed to get valid agents',
          500,
          { message: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  });
  router[getValidAgentsRoute.method](getValidAgentsRoute.path, getValidAgentsRoute.handler);

  return router;
}
