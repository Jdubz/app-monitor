/**
 * Script Execution History
 *
 * Tracks and persists script execution history
 */

import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";
import type { ScriptExecution } from "./scriptManager.js";

export interface ScriptExecutionSummary {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  lastExecution?: Date;
  scriptId: string;
}

export interface ScriptHistoryStats {
  totalScripts: number;
  totalExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  recentExecutions: ScriptExecution[];
}

export class ScriptExecutionHistory {
  private historyDir: string;
  private maxHistorySize: number;
  private executions: ScriptExecution[] = [];

  constructor(
    historyDir: string = "./logs/script-history",
    maxHistorySize: number = 1000,
  ) {
    this.historyDir = historyDir;
    this.maxHistorySize = maxHistorySize;
    this.ensureHistoryDir();
    this.loadHistory();
  }

  /**
   * Ensure history directory exists
   */
  private ensureHistoryDir(): void {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
      logger.info({
        category: "scripts",
        action: "history_dir_created",
        message: `Created script history directory: ${this.historyDir}`,
      });
    }
  }

  /**
   * Load execution history from disk
   */
  private loadHistory(): void {
    try {
      const historyFile = path.join(this.historyDir, "executions.json");

      if (fs.existsSync(historyFile)) {
        const data = fs.readFileSync(historyFile, "utf-8");
        const parsed = JSON.parse(data) as Array<
          Omit<ScriptExecution, "startTime" | "endTime"> & {
            startTime: string;
            endTime?: string;
          }
        >;

        // Convert date strings back to Date objects
        this.executions = parsed.map((exec) => ({
          ...exec,
          startTime: new Date(exec.startTime),
          endTime: exec.endTime ? new Date(exec.endTime) : undefined,
        }));

        logger.info({
          category: "scripts",
          action: "history_loaded",
          message: `Loaded ${this.executions.length} script executions from history`,
        });
      }
    } catch (error) {
      logger.error({
        category: "scripts",
        action: "history_load_error",
        message: "Failed to load script execution history",
        error,
      });
    }
  }

  /**
   * Save execution history to disk
   */
  private saveHistory(): void {
    try {
      const historyFile = path.join(this.historyDir, "executions.json");

      // Keep only the most recent executions
      const toSave = this.executions.slice(-this.maxHistorySize);

      fs.writeFileSync(historyFile, JSON.stringify(toSave, null, 2));

      logger.debug({
        category: "scripts",
        action: "history_saved",
        message: `Saved ${toSave.length} script executions to history`,
      });
    } catch (error) {
      logger.error({
        category: "scripts",
        action: "history_save_error",
        message: "Failed to save script execution history",
        error,
      });
    }
  }

  /**
   * Add execution to history
   */
  addExecution(execution: ScriptExecution): void {
    this.executions.push(execution);

    // Trim if exceeding max size
    if (this.executions.length > this.maxHistorySize) {
      this.executions = this.executions.slice(-this.maxHistorySize);
    }

    this.saveHistory();
  }

  /**
   * Get all executions
   */
  getAllExecutions(): ScriptExecution[] {
    return [...this.executions];
  }

  /**
   * Get executions by script ID
   */
  getExecutionsByScript(scriptId: string): ScriptExecution[] {
    return this.executions.filter((exec) => exec.scriptId === scriptId);
  }

  /**
   * Get recent executions (last N)
   */
  getRecentExecutions(limit: number = 10): ScriptExecution[] {
    return this.executions.slice(-limit).reverse();
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): ScriptExecution | undefined {
    return this.executions.find((exec) => exec.id === executionId);
  }

  /**
   * Get summary for a specific script
   */
  getScriptSummary(scriptId: string): ScriptExecutionSummary {
    const executions = this.getExecutionsByScript(scriptId);

    const successful = executions.filter((e) => e.status === "completed");
    const failed = executions.filter((e) => e.status === "failed");

    const totalDuration = executions
      .filter((e) => e.endTime)
      .reduce((sum, exec) => {
        const duration = exec.endTime!.getTime() - exec.startTime.getTime();
        return sum + duration;
      }, 0);

    const avgDuration =
      executions.length > 0 ? totalDuration / executions.length : 0;

    const lastExecution =
      executions.length > 0
        ? executions[executions.length - 1].startTime
        : undefined;

    return {
      scriptId,
      totalExecutions: executions.length,
      successfulExecutions: successful.length,
      failedExecutions: failed.length,
      averageDuration: avgDuration,
      lastExecution,
    };
  }

  /**
   * Get overall statistics
   */
  getStats(): ScriptHistoryStats {
    const scripts = new Set(this.executions.map((e) => e.scriptId));
    const successful = this.executions.filter(
      (e) => e.status === "completed",
    ).length;
    const total = this.executions.length;

    const totalDuration = this.executions
      .filter((e) => e.endTime)
      .reduce((sum, exec) => {
        const duration = exec.endTime!.getTime() - exec.startTime.getTime();
        return sum + duration;
      }, 0);

    const avgExecutionTime =
      this.executions.length > 0 ? totalDuration / this.executions.length : 0;

    return {
      totalScripts: scripts.size,
      totalExecutions: total,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      averageExecutionTime: avgExecutionTime,
      recentExecutions: this.getRecentExecutions(10),
    };
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.executions = [];
    this.saveHistory();

    logger.info({
      category: "scripts",
      action: "history_cleared",
      message: "Cleared all script execution history",
    });
  }

  /**
   * Delete old executions (older than specified days)
   */
  deleteOldExecutions(daysToKeep: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const initialCount = this.executions.length;
    this.executions = this.executions.filter(
      (exec) => exec.startTime >= cutoffDate,
    );

    const deleted = initialCount - this.executions.length;

    if (deleted > 0) {
      this.saveHistory();

      logger.info({
        category: "scripts",
        action: "old_executions_deleted",
        message: `Deleted ${deleted} old script executions`,
        details: { daysToKeep, deleted },
      });
    }

    return deleted;
  }

  /**
   * Export history to JSON
   */
  exportHistory(filePath: string): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(this.executions, null, 2));

      logger.info({
        category: "scripts",
        action: "history_exported",
        message: `Exported script history to ${filePath}`,
        details: { count: this.executions.length },
      });
    } catch (error) {
      logger.error({
        category: "scripts",
        action: "history_export_error",
        message: "Failed to export script history",
        error,
      });
      throw error;
    }
  }
}
