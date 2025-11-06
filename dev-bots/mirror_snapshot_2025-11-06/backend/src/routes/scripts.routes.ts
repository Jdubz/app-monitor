/**
 * Script Management Routes
 *
 * Handles script execution operations:
 * - List available scripts
 * - Execute scripts (non-blocking)
 * - Monitor script executions
 * - Kill running scripts
 * - Clear execution history
 *
 * Note: Script execution is non-blocking. Use Socket.IO events to monitor:
 * - script:started
 * - script:output
 * - script:completed
 * - script:failed
 */

import { Router, Request, Response } from "express";
import type { ScriptManager } from "../services/scriptManager.js";
import { logger } from "../utils/logger.js";

/**
 * Create script management router
 *
 * @param scriptManager - ScriptManager instance
 * @returns Express router with script endpoints
 */
export function createScriptsRouter(scriptManager: ScriptManager): Router {
  const router = Router();

  /**
   * GET /scripts
   * Get all available scripts
   */
  router.get("/", (_req: Request, res: Response) => {
    try {
      const allScripts = scriptManager.getScripts();
      res.json({
        count: allScripts.length,
        scripts: allScripts,
      });
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_getting_scripts_error",
        message: `Error getting scripts: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to get scripts",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /scripts/:scriptId/execute
   * Execute a script (non-blocking - returns immediately with 201)
   *
   * Use Socket.IO events to monitor progress:
   * - script:started
   * - script:output (line-by-line output)
   * - script:completed
   * - script:failed
   */
  router.post("/:scriptId/execute", (req: Request, res: Response) => {
    try {
      const { scriptId } = req.params;
      logger.info({
        category: "api",
        action: "starting_script_scriptid",
        message: `Starting script: ${scriptId}`,
      });

      // Start script asynchronously (returns immediately)
      const execution = scriptManager.startScript(scriptId);

      // Return 201 Created with execution ID
      // Client should listen to Socket.IO events for progress
      res.status(201).json({
        success: true,
        message:
          "Script started successfully. Monitor progress via Socket.IO events.",
        execution: {
          id: execution.id,
          scriptId: execution.scriptId,
          displayName: execution.config.displayName,
          status: execution.status,
          startTime: execution.startTime,
        },
      });
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_starting_script_req_params_scriptid_error",
        message: `Error starting script ${req.params.scriptId}: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to start script",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /scripts/executions
   * Get all script executions
   */
  router.get("/executions", (_req: Request, res: Response) => {
    try {
      const executions = scriptManager.getExecutions();
      res.json({
        count: executions.length,
        executions: executions.map((exec) => ({
          id: exec.id,
          scriptId: exec.scriptId,
          displayName: exec.config.displayName,
          status: exec.status,
          exitCode: exec.exitCode,
          startTime: exec.startTime,
          endTime: exec.endTime,
          outputLines: exec.output.length,
        })),
      });
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_getting_executions_error",
        message: `Error getting executions: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to get executions",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /scripts/executions/:executionId
   * Get a specific execution
   */
  router.get("/executions/:executionId", (req: Request, res: Response) => {
    try {
      const { executionId } = req.params;
      const execution = scriptManager.getExecution(executionId);

      if (!execution) {
        res.status(404).json({
          error: "Execution not found",
          message: `No execution found with ID: ${executionId}`,
        });
        return;
      }

      res.json(execution);
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_getting_execution_req_params_executionid_error",
        message: `Error getting execution ${req.params.executionId}: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to get execution",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /scripts/executions/:executionId/kill
   * Kill a running script
   */
  router.post(
    "/executions/:executionId/kill",
    (req: Request, res: Response) => {
      try {
        const { executionId } = req.params;
        const killed = scriptManager.killScript(executionId);

        if (!killed) {
          res.status(404).json({
            error: "Failed to kill script",
            message: "Script not found or already completed",
          });
          return;
        }

        res.json({
          success: true,
          message: "Script killed successfully",
        });
      } catch (error) {
        logger.error({
          category: "api",
          action: "error_killing_script_req_params_executionid_error",
          message: `Error killing script ${req.params.executionId}: ${error}`,
          error,
        });
        res.status(500).json({
          error: "Failed to kill script",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  /**
   * DELETE /scripts/executions
   * Clear execution history
   */
  router.delete("/executions", (_req: Request, res: Response) => {
    try {
      scriptManager.clearHistory();
      res.json({
        success: true,
        message: "Execution history cleared",
      });
    } catch (error) {
      logger.error({
        category: "api",
        action: "error_clearing_history_error",
        message: `Error clearing history: ${error}`,
        error,
      });
      res.status(500).json({
        error: "Failed to clear history",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
