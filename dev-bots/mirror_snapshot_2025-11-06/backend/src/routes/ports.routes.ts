import { Router, Request, Response } from "express";
import {
  getPortInfo,
  killPortProcess,
  PortInfo,
} from "../utils/portManager.js";
import { ServiceConfig } from "../config.js";
import { logger } from "../utils/logger.js";

export interface PortsRoutesDependencies {
  services: Record<string, ServiceConfig>;
}

export function createPortsRoutes(deps: PortsRoutesDependencies): Router {
  const router = Router();
  const { services } = deps;

  // Get port status for all configured services
  router.get("/status", async (_req: Request, res: Response) => {
    try {
      const portStatuses: Record<string, PortInfo[]> = {};

      for (const [serviceName, serviceConfig] of Object.entries(services)) {
        if (serviceConfig.ports && serviceConfig.ports.length > 0) {
          const ports = await Promise.all(
            serviceConfig.ports.map(async (port: number) => {
              const info = await getPortInfo(port);
              return info;
            }),
          );
          portStatuses[serviceName] = ports;
        }
      }

      res.json(portStatuses);
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_getting_port_statuses_error",
        message: `Error getting port statuses: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to get port statuses",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Kill process on a specific port
  router.post("/:port/kill", async (req: Request, res: Response) => {
    try {
      const port = parseInt(req.params.port);

      if (isNaN(port) || port < 1 || port > 65535) {
        res.status(400).json({
          error: "Invalid port",
          message: "Port must be a number between 1 and 65535",
        });
        return;
      }

      logger.info({
        category: "api",
        action: "api_killing_process_on_port_port",
        message: `API: Killing process on port ${port}`,
      });
      const info = await getPortInfo(port);

      if (!info.inUse) {
        res.json({
          success: true,
          message: `Port ${port} is not in use`,
          port,
          wasInUse: false,
        });
        return;
      }

      const killed = await killPortProcess(port);

      res.json({
        success: killed,
        message: killed
          ? `Process on port ${port} (PID: ${info.pid}) killed successfully`
          : `Failed to kill process on port ${port}`,
        port,
        pid: info.pid,
        wasInUse: true,
      });
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_killing_process_on_port_req_params_port_error",
        message: `Error killing process on port ${req.params.port}: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to kill port process",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
