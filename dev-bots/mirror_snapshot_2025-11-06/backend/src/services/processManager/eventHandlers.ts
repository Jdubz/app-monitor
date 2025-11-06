/**
 * Process event handler management with proper cleanup
 */

import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as fs from "fs";
import { logger } from "../../utils/logger.js";

export interface ProcessEventHandlers {
  onStdout: (data: Buffer) => void;
  onStderr: (data: Buffer) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  onError: (error: Error) => void;
}

export class ProcessEventManager {
  private handlers = new Map<string, ProcessEventHandlers>();
  private abortControllers = new Map<string, AbortController>();

  /**
   * Attach event handlers to a process
   */
  attach(
    serviceName: string,
    childProcess: ChildProcess,
    logFileStream: fs.WriteStream | undefined,
    logs: string[],
    maxLogLines: number,
    emitter: EventEmitter,
  ): void {
    // Remove existing handlers if any
    this.detach(serviceName);

    // Create abort controller for cleanup
    const abortController = new AbortController();
    this.abortControllers.set(serviceName, abortController);

    const handlers: ProcessEventHandlers = {
      onStdout: (data: Buffer) => {
        const lines = data
          .toString()
          .split("\n")
          .filter((line) => line.trim());
        logs.push(...lines);

        // Keep only last N lines
        if (logs.length > maxLogLines) {
          logs.splice(0, logs.length - maxLogLines);
        }

        // Write to log file
        if (logFileStream) {
          lines.forEach((line) => {
            logFileStream.write(line + "\n");
          });
        }

        // Emit log event
        emitter.emit("log", { serviceName, lines });
      },

      onStderr: (data: Buffer) => {
        const lines = data
          .toString()
          .split("\n")
          .filter((line) => line.trim());
        logs.push(...lines);

        if (logs.length > maxLogLines) {
          logs.splice(0, logs.length - maxLogLines);
        }

        // Write to log file
        if (logFileStream) {
          lines.forEach((line) => {
            logFileStream.write(line + "\n");
          });
        }

        // Emit log event
        emitter.emit("log", { serviceName, lines });
      },

      onExit: (code: number | null, signal: NodeJS.Signals | null) => {
        logger.info({
          category: "process",
          action: "exit",
          message: `Service "${serviceName}" exited`,
          details: { code, signal },
        });

        // Close log file stream
        if (logFileStream) {
          logFileStream.end();
        }

        // Emit exit event
        emitter.emit("exit", { serviceName, code, signal });

        // Cleanup handlers
        this.detach(serviceName);
      },

      onError: (error: Error) => {
        logger.error({
          category: "process",
          action: "error",
          message: `Service "${serviceName}" error`,
          error,
        });

        // Emit error event
        emitter.emit("process_error", { serviceName, error: error.message });
      },
    };

    // Store handlers for cleanup
    this.handlers.set(serviceName, handlers);

    // Attach handlers
    childProcess.stdout?.on("data", handlers.onStdout);
    childProcess.stderr?.on("data", handlers.onStderr);
    childProcess.on("exit", handlers.onExit);
    childProcess.on("error", handlers.onError);
  }

  /**
   * Detach and cleanup event handlers for a process
   */
  detach(serviceName: string): void {
    const handlers = this.handlers.get(serviceName);
    const abortController = this.abortControllers.get(serviceName);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(serviceName);
    }

    if (handlers) {
      this.handlers.delete(serviceName);
    }
  }

  /**
   * Cleanup all handlers
   */
  cleanupAll(): void {
    for (const serviceName of this.handlers.keys()) {
      this.detach(serviceName);
    }
  }
}
