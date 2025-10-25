import { Router, Request, Response } from 'express';
import { CloudLogging } from '../services/cloudLogging.js';
import { logger } from '../utils/logger.js';

export interface EnvironmentsRoutesDependencies {
  cloudLogging: CloudLogging;
}

export function createEnvironmentsRoutes(deps: EnvironmentsRoutesDependencies): Router {
  const router = Router();
  const { cloudLogging } = deps;

  // Get available environments
  router.get('/', (_req: Request, res: Response) => {
    try {
      const environments = cloudLogging.getEnvironments();
      res.json(environments);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_environments_error',
        message: `Error getting environments: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get environments',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get services for an environment
  router.get('/:environment/services', (req: Request, res: Response) => {
    try {
      const { environment } = req.params;
      const services = cloudLogging.getServicesForEnvironment(environment);
      res.json(services);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_services_for_req_params_environment_error',
        message: `Error getting services for ${req.params.environment}: ${error}`,
        error
      });
      res.status(404).json({
        error: 'Environment not found',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
