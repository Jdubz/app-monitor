/**
 * Worker Log Service
 * 
 * Manages worker log file creation and stream management extracted from EphemeralWorkerService.
 * Handles log initialization, stream lifecycle, and cleanup.
 * 
 * Part of P1 refactoring plan - Week 2: Extract Log Management
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface WorkerLogConfig {
  logsDirectory: string;
  consolidatedLogPath?: string;
}

export interface WorkerInfo {
  id: string;
  agentId: string;
  taskId: string;
  taskTitle?: string;
}

/**
 * Service for managing worker log files and streams
 */
export class WorkerLogService {
  private logStreams = new Map<string, fs.WriteStream>();
  private readonly config: WorkerLogConfig;

  constructor(config: WorkerLogConfig) {
    this.config = config;
    this.ensureLogDirectory();
  }

  /**
   * Ensure log directory exists and is writable
   */
  private ensureLogDirectory(): void {
    const logDir = this.config.logsDirectory;
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      logger.info({
        category: 'process',
        action: 'created_log_directory',
        message: `Created log directory: ${logDir}`
      });
    }

    // Verify directory is writable
    try {
      fs.accessSync(logDir, fs.constants.W_OK);
    } catch (err) {
      logger.error({
        category: 'process',
        action: 'log_directory_not_writable',
        message: `Log directory not writable: ${logDir}`,
        error: err,
        details: {
          logDir,
          cwd: process.cwd(),
          user: process.env.USER,
          uid: typeof process.getuid === 'function' ? process.getuid() : 'unknown',
          gid: typeof process.getgid === 'function' ? process.getgid() : 'unknown'
        }
      });
      throw err;
    }
  }

  /**
   * Initialize a worker log file with header
   * 
   * @param workerId Worker ID (will be sanitized for filesystem)
   */
  async initializeWorkerLogFile(workerId: string): Promise<void> {
    try {
      const sanitizedId = workerId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const logFilePath = path.join(this.config.logsDirectory, `${sanitizedId}.log`);

      const timestamp = new Date().toISOString();
      const header = `=== Dev-Bot Worker Log ===\nWorker ID: ${workerId}\nInitialized: ${timestamp}\n===========================\n\n`;

      fs.writeFileSync(logFilePath, header, 'utf8');

      logger.info({
        category: 'process',
        action: 'initialized_worker_log_file',
        message: `Initialized log file for worker ${workerId}`,
        details: {
          path: logFilePath,
          size: header.length,
          logDir: this.config.logsDirectory
        }
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_initialize_worker_log_file',
        message: `Failed to initialize log file for worker ${workerId}`,
        error: { message: (error as Error).message }
      });
      throw error;
    }
  }

  /**
   * Create a log stream for a worker
   * 
   * Creates an append stream to the consolidated log file (if configured)
   * or to individual worker log file.
   * 
   * @param worker Worker information
   * @returns WriteStream for logging
   */
  createLogStream(worker: WorkerInfo): fs.WriteStream {
    const logPath = this.config.consolidatedLogPath || 
                    path.join(this.config.logsDirectory, `${worker.id.replace(/[^a-zA-Z0-9-_]/g, '_')}.log`);

    // Create header for consolidated log
    const separator = '='.repeat(80);
    const header = [
      separator,
      `Worker ID: ${worker.id}`,
      `Agent: ${worker.agentId}`,
      `Task ID: ${worker.taskId}`,
      worker.taskTitle ? `Task: ${worker.taskTitle}` : '',
      `Started: ${new Date().toISOString()}`,
      separator + '\n'
    ].filter(line => line).join('\n');

    // Create append stream
    const stream = fs.createWriteStream(logPath, { flags: 'a' });
    
    // Add error handler for write failures
    stream.on('error', (error) => {
      logger.error({
        category: 'process',
        action: 'log_stream_error',
        message: `Failed to write to log stream for worker ${worker.id}`,
        error,
        details: { logPath, workerId: worker.id }
      });
    });
    
    // Write header
    stream.write(header);

    // Store stream for cleanup
    this.logStreams.set(worker.id, stream);
    
    // Remove stream from map when closed to prevent memory leak
    stream.on('close', () => {
      this.logStreams.delete(worker.id);
    });

    logger.info({
      category: 'process',
      action: 'log_stream_created',
      message: `Created log stream for worker ${worker.id}`,
      details: { logPath, workerId: worker.id }
    });

    return stream;
  }

  /**
   * Close a log stream for a worker
   * 
   * @param workerId Worker ID
   */
  async closeLogStream(workerId: string): Promise<void> {
    const stream = this.logStreams.get(workerId);
    if (!stream) return;

    return new Promise((resolve, reject) => {
      stream.end((error: Error | undefined) => {
        if (error) {
          logger.warn({
            category: 'process',
            action: 'log_stream_close_error',
            message: `Error closing log stream for worker ${workerId}`,
            error: { message: error.message }
          });
          reject(error);
        } else {
          this.logStreams.delete(workerId);
          logger.debug({
            category: 'process',
            action: 'log_stream_closed',
            message: `Closed log stream for worker ${workerId}`
          });
          resolve();
        }
      });
    });
  }

  /**
   * Get the log stream for a worker
   * 
   * @param workerId Worker ID
   * @returns WriteStream if exists, undefined otherwise
   */
  getLogStream(workerId: string): fs.WriteStream | undefined {
    return this.logStreams.get(workerId);
  }

  /**
   * Get number of active log streams
   */
  getActiveStreamCount(): number {
    return this.logStreams.size;
  }

  /**
   * Get path to worker log file
   * 
   * @param workerId Worker ID
   * @returns Path to log file
   */
  getWorkerLogPath(workerId: string): string {
    const sanitizedId = workerId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.config.logsDirectory, `${sanitizedId}.log`);
  }

  /**
   * Clean up old log files
   * 
   * @param retentionDays Number of days to retain logs
   * @returns Number of files deleted
   */
  async cleanupOldLogs(retentionDays: number): Promise<number> {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    try {
      const files = fs.readdirSync(this.config.logsDirectory);
      
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        
        const filePath = path.join(this.config.logsDirectory, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
          logger.info({
            category: 'process',
            action: 'old_log_deleted',
            message: `Deleted old log file: ${file}`,
            details: { 
              file, 
              ageInDays: Math.floor((Date.now() - stats.mtimeMs) / (24 * 60 * 60 * 1000))
            }
          });
        }
      }

      if (deletedCount > 0) {
        logger.info({
          category: 'process',
          action: 'log_cleanup_completed',
          message: `Cleaned up ${deletedCount} old log files`,
          details: { retentionDays, deletedCount }
        });
      }
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'log_cleanup_failed',
        message: 'Failed to clean up old log files',
        error: { message: (error as Error).message }
      });
    }

    return deletedCount;
  }

  /**
   * Shutdown service and close all log streams
   * 
   * Called on process termination to ensure no resource leaks
   */
  async shutdown(): Promise<void> {
    logger.info({
      category: 'process',
      action: 'worker_log_service_shutdown',
      message: `Shutting down WorkerLogService (${this.logStreams.size} log streams)`
    });

    // Close all log streams
    const streamClosePromises: Promise<void>[] = [];
    for (const [workerId] of this.logStreams.entries()) {
      streamClosePromises.push(
        this.closeLogStream(workerId).catch(error => {
          logger.error({
            category: 'process',
            action: 'log_stream_cleanup_failed',
            message: `Failed to close log stream for worker ${workerId}`,
            error: { message: error.message }
          });
        })
      );
    }

    await Promise.all(streamClosePromises);

    logger.info({
      category: 'process',
      action: 'worker_log_service_shutdown_complete',
      message: 'WorkerLogService shutdown complete'
    });
  }
}
