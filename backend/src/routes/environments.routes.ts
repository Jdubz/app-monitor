import { Router, Request, Response } from 'express';
import { CloudLogging } from '../services/cloudLogging.js';
import { logger } from '../utils/logger.js';
import type {
  EnvironmentsResponse,
  EnvironmentServicesResponse,
  EnvironmentsApiResponse,
  EnvironmentServicesApiResponse,
  ApiError,
} from '@app-monitor/api-contracts';

export interface EnvironmentsRoutesDependencies {
  cloudLogging: CloudLogging;
}

export function createEnvironmentsRoutes(deps: EnvironmentsRoutesDependencies): Router {
  const router = Router();
  const { cloudLogging } = deps;
  const respondError = (res: Response, status: number, errorLabel: string, error: unknown) => {
    const payload: ApiError = {
      success: false,
      error: errorLabel,
      message: error instanceof Error ? error.message : String(error),
    };
    return res.status(status).json(payload);
  };

  // Get available environments
  router.get('/', (_req: Request, res: Response) => {
    try {
      const environments: EnvironmentsResponse = cloudLogging.getEnvironments();
      const payload: EnvironmentsApiResponse = { success: true, data: environments };
      res.json(payload);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_environments_error',
        message: `Error getting environments: ${error}`,
        error
      });
      respondError(res, 500, 'Failed to get environments', error);
    }
  });

  // Get services for an environment
  router.get('/:environment/services', (req: Request, res: Response) => {
    try {
      const { environment } = req.params;
      const services: EnvironmentServicesResponse = cloudLogging.getServicesForEnvironment(environment);
      const payload: EnvironmentServicesApiResponse = { success: true, data: services };
      res.json(payload);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_services_for_req_params_environment_error',
        message: `Error getting services for ${req.params.environment}: ${error}`,
        error
      });
      respondError(res, 404, 'Environment not found', error);
    }
  });

  return router;
}
