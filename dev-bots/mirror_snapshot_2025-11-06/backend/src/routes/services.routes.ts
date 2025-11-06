import { Router, Request, Response } from "express";
import { ProcessManager } from "../services/processManager.js";
import { logger } from "../utils/logger.js";

export function createServicesRouter(processManager: ProcessManager) {
  const router = Router();

  // Get status of all services
  router.get("/status", async (_req: Request, res: Response) => {
    try {
      const statuses = await processManager.getAllStatuses();
      res.json(statuses);
    } catch (error) {
      logger.error({
        category: "api",
        action: "get_all_statuses_failed",
        message: "Failed to get all service statuses",
        error,
      });
      res.status(500).json({
        error: "Failed to get service statuses",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get status of a specific service
  router.get("/:serviceName/status", async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const status = await processManager.getServiceStatus(serviceName);
      res.json(status);
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_getting_status_for_req_params_servicename_error",
        message: `Error getting status for ${req.params.serviceName}: ${error}`,
        error,
      });
      res.status(404).json({
        error: "Service not found",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Start a service
  router.post("/:serviceName/start", async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      logger.info({
        category: "api",
        action: "api_starting_service_servicename",
        message: `API: Starting service ${serviceName}`,
      });
      const status = await processManager.startService(serviceName);
      res.json(status);
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_starting_service_req_params_servicename_error",
        message: `Error starting service ${req.params.serviceName}: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to start service",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Stop a service (graceful or force)
  router.post("/:serviceName/stop", async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const graceful = req.query.graceful !== "false";
      logger.info({
        category: "api",
        action: "api_stopping_service_servicename_graceful_graceful",
        message: `API: Stopping service ${serviceName} (graceful: ${graceful})`,
      });
      const status = await processManager.stopService(serviceName, graceful);
      res.json(status);
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_stopping_service_req_params_servicename_error",
        message: `Error stopping service ${req.params.serviceName}: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to stop service",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Kill a service (force stop)
  router.post("/:serviceName/kill", async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      logger.info({
        category: "api",
        action: "api_killing_service_servicename",
        message: `API: Killing service ${serviceName}`,
      });
      const status = await processManager.killService(serviceName);
      res.json(status);
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_killing_service_req_params_servicename_error",
        message: `Error killing service ${req.params.serviceName}: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to kill service",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Restart a service
  router.post("/:serviceName/restart", async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const graceful = req.query.graceful !== "false";
      logger.info({
        category: "api",
        action: "api_restarting_service_servicename_graceful_graceful",
        message: `API: Restarting service ${serviceName} (graceful: ${graceful})`,
      });
      const status = await processManager.restartService(serviceName, graceful);
      res.json(status);
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_restarting_service_req_params_servicename_error",
        message: `Error restarting service ${req.params.serviceName}: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to restart service",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
