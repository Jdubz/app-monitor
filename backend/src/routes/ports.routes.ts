import { Router, Request, Response } from 'express';
import { getPortInfo, killPortProcess } from '../utils/portManager.js';
import { ServiceConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import type {
  PortStatusMap,
  PortStatusesResponse,
  PortKillApiResponse,
  ApiError,
} from '@app-monitor/api-contracts';

export interface PortsRoutesDependencies {
  services: Record<string, ServiceConfig>;
}

export function createPortsRoutes(deps: PortsRoutesDependencies): Router {
  const router = Router();
  const { services } = deps;
  const respondError = (res: Response, status: number, errorLabel: string, error: unknown) => {
    const payload: ApiError = {
      success: false,
      error: errorLabel,
      message: error instanceof Error ? error.message : String(error),
    };
    return res.status(status).json(payload);
  };

  // Get port status for all configured services
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const portStatuses: PortStatusMap = {};

      for (const [serviceName, serviceConfig] of Object.entries(services)) {
        if (serviceConfig.ports && serviceConfig.ports.length > 0) {
          const ports = await Promise.all(
            serviceConfig.ports.map(async (port: number) => {
              const info = await getPortInfo(port);
              return info;
            })
          );
          portStatuses[serviceName] = ports;
        }
      }

      const payload: PortStatusesResponse = { success: true, data: portStatuses };
      res.json(payload);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_port_statuses_error',
        message: `Error getting port statuses: ${error}`,
        error
      });
      respondError(res, 500, 'Failed to get port statuses', error);
    }
  });

  // Kill process on a specific port
  router.post('/:port/kill', async (req: Request, res: Response) => {
    try {
      const port = parseInt(req.params.port);

      if (isNaN(port) || port < 1 || port > 65535) {
        respondError(res, 400, 'Invalid port', new Error('Port must be a number between 1 and 65535'));
        return;
      }

      logger.info({
        category: 'api',
        action: 'api_killing_process_on_port_port',
        message: `API: Killing process on port ${port}`
      });
      const info = await getPortInfo(port);

      if (!info.inUse) {
        const payload: PortKillApiResponse = {
          success: true,
          data: {
            success: true,
            message: 'Port ' + port + ' is not in use',
            port,
            pid: info.pid ?? null,
            wasInUse: false,
          },
        };
        res.json(payload);
        return;
      }

      const killed = await killPortProcess(port);

      const payload: PortKillApiResponse = {
        success: true,
        data: {
          success: killed,
          message: killed
            ? 'Process on port ' + port + ' (PID: ' + info.pid + ') killed successfully'
            : 'Failed to kill process on port ' + port,
          port,
          pid: info.pid ?? null,
          wasInUse: true,
        },
      };

      res.json(payload);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_killing_process_on_port_req_params_port_error',
        message: `Error killing process on port ${req.params.port}: ${error}`,
        error
      });
      respondError(res, 500, 'Failed to kill port process', error);
    }
  });

  return router;
}
