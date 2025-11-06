/**
 * Script Execution History Routes
 *
 * Provides historical data and analytics for script executions:
 * - Recent execution history
 * - Per-script execution history
 * - Script execution summaries
 * - Overall statistics
 * - Cleanup old executions
 */

import { Router, Request, Response } from "express";
import type { ScriptExecutionHistory } from "../services/scriptExecutionHistory.js";
import { logger } from "../utils/logger.js";

/**
 * Create script history router
 *
 * @param scriptExecutionHistory - ScriptExecutionHistory instance
 * @returns Express router with script history endpoints
 */
export function createScriptHistoryRouter(
  scriptExecutionHistory: ScriptExecutionHistory,
): Router {
  const router = Router();

  /**
   * GET /scripts/history
   * Get recent script execution history
   *
   * Query params:
   * - limit: Number of recent executions to return (default: 50)
   */
  router.get("/history", (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const executions = scriptExecutionHistory.getRecentExecutions(limit);

      res.json({
        success: true,
        executions,
        count: executions.length,
      });
    } catch (error) {
      logger.error({
        category: "scripts",
        action: "get_history_error",
        message: "Failed to get script history",
        error,
      });
      res.status(500).json({
        error: "Failed to get script history",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /scripts/:scriptId/history
   * Get execution history for a specific script
   */
  router.get("/:scriptId/history", (req: Request, res: Response) => {
    try {
      const { scriptId } = req.params;

      const executions = scriptExecutionHistory.getExecutionsByScript(scriptId);

      res.json({
        success: true,
        scriptId,
        executions,
        count: executions.length,
      });
    } catch (error) {
      logger.error({
        category: "scripts",
        action: "get_script_history_error",
        message: `Failed to get history for script ${req.params.scriptId}`,
        error,
      });
      res.status(500).json({
        error: "Failed to get script history",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /scripts/:scriptId/summary
   * Get execution summary for a specific script
   *
   * Includes statistics like:
   * - Total executions
   * - Success rate
   * - Average duration
   * - Recent failures
   */
  router.get("/:scriptId/summary", (req: Request, res: Response) => {
    try {
      const { scriptId } = req.params;

      const summary = scriptExecutionHistory.getScriptSummary(scriptId);

      res.json({
        success: true,
        summary,
      });
    } catch (error) {
      logger.error({
        category: "scripts",
        action: "get_script_summary_error",
        message: `Failed to get summary for script ${req.params.scriptId}`,
        error,
      });
      res.status(500).json({
        error: "Failed to get script summary",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /scripts/stats/overall
   * Get overall script execution statistics
   *
   * Includes:
   * - Total executions
   * - Success/failure counts
   * - Most/least used scripts
   * - Performance metrics
   */
  router.get("/stats/overall", (_req: Request, res: Response) => {
    try {
      const stats = scriptExecutionHistory.getStats();

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      logger.error({
        category: "scripts",
        action: "get_stats_error",
        message: "Failed to get script statistics",
        error,
      });
      res.status(500).json({
        error: "Failed to get script statistics",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /scripts/history/old
   * Delete old script execution records
   *
   * Query params:
   * - days: Number of days to keep (default: 30)
   */
  router.delete("/history/old", (req: Request, res: Response) => {
    try {
      const daysToKeep = req.query.days
        ? parseInt(req.query.days as string)
        : 30;

      const deleted = scriptExecutionHistory.deleteOldExecutions(daysToKeep);

      res.json({
        success: true,
        message: `Deleted ${deleted} old executions`,
        deleted,
        daysToKeep,
      });
    } catch (error) {
      logger.error({
        category: "scripts",
        action: "delete_old_history_error",
        message: "Failed to delete old script history",
        error,
      });
      res.status(500).json({
        error: "Failed to delete old history",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
