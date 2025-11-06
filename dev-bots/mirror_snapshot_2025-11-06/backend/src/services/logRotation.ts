/**
 * LogRotation - Automatic log file rotation
 *
 * Monitors log file sizes and automatically rotates files when they exceed
 * the configured size limit. Rotated files are compressed and archived.
 *
 * Features:
 * - Automatic rotation based on file size
 * - Gzip compression of rotated files
 * - Automatic cleanup of old rotated files
 * - Configurable retention period
 * - No downtime during rotation
 */

import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve logs directory relative to this file (services -> src -> backend -> dev-monitor -> root -> logs)
const DEFAULT_LOG_DIR = path.resolve(__dirname, "../../../../logs");

interface LogRotationConfig {
  maxSize: number; // Max file size in bytes before rotation
  maxAge: number; // Max age of rotated files in days
  checkInterval: number; // How often to check file sizes in milliseconds
  compress: boolean; // Whether to compress rotated files
}

interface ManagedLogFile {
  filepath: string;
  service: string;
}

const DEFAULT_CONFIG: LogRotationConfig = {
  maxSize: 10 * 1024 * 1024, // 10MB
  maxAge: 7, // 7 days
  checkInterval: 60 * 1000, // 1 minute
  compress: true,
};

export class LogRotation {
  private config: LogRotationConfig;
  private logDir: string;
  private archivedDir: string;
  private managedFiles: ManagedLogFile[] = [];
  private checkTimer?: NodeJS.Timeout;

  constructor(logDir?: string, config?: Partial<LogRotationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logDir = logDir || DEFAULT_LOG_DIR;
    this.archivedDir = path.join(this.logDir, "archived");

    // Ensure archived directory exists
    if (!fs.existsSync(this.archivedDir)) {
      fs.mkdirSync(this.archivedDir, { recursive: true });
    }

    // Register log files to manage
    this.managedFiles = [
      { filepath: path.join(this.logDir, "backend.log"), service: "backend" },
      { filepath: path.join(this.logDir, "frontend.log"), service: "frontend" },
      { filepath: path.join(this.logDir, "worker.log"), service: "worker" },
      {
        filepath: path.join(this.logDir, "dev-monitor-backend.log"),
        service: "dev-monitor",
      },
    ];

    logger.info({
      category: "system",
      action: "initialized",
      message: "LogRotation initialized",
      details: {
        logDir: this.logDir,
        maxSize: this.config.maxSize,
        maxAge: this.config.maxAge,
      },
    });
  }

  /**
   * Start log rotation monitoring
   */
  public start(): void {
    if (this.checkTimer) {
      logger.warn({
        category: "system",
        action: "already_started",
        message: "LogRotation already started",
      });
      return;
    }

    // Perform initial cleanup
    this.cleanupOldFiles();

    // Start periodic checks
    this.checkTimer = setInterval(() => {
      this.checkAndRotateFiles();
      this.cleanupOldFiles();
    }, this.config.checkInterval);

    logger.info({
      category: "system",
      action: "started",
      message: "LogRotation monitoring started",
      details: { checkInterval: this.config.checkInterval },
    });
  }

  /**
   * Stop log rotation monitoring
   */
  public stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;

      logger.info({
        category: "system",
        action: "stopped",
        message: "LogRotation monitoring stopped",
      });
    }
  }

  /**
   * Check all managed files and rotate if needed
   */
  private checkAndRotateFiles(): void {
    for (const file of this.managedFiles) {
      if (!fs.existsSync(file.filepath)) {
        continue; // File doesn't exist yet
      }

      try {
        const stats = fs.statSync(file.filepath);

        if (stats.size >= this.config.maxSize) {
          this.rotateFile(file.filepath, file.service);
        }
      } catch (error) {
        logger.error({
          category: "system",
          action: "check_failed",
          message: `Failed to check file size: ${file.filepath}`,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }

  /**
   * Rotate a log file
   */
  private rotateFile(filepath: string, service: string): void {
    try {
      logger.info({
        category: "system",
        action: "rotating_file",
        message: `Rotating log file: ${filepath}`,
        details: { service },
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const basename = path.basename(filepath, ".log");
      const rotatedName = `${basename}-${timestamp}.log`;
      const rotatedPath = path.join(this.archivedDir, rotatedName);

      // Copy file to archived directory
      fs.copyFileSync(filepath, rotatedPath);

      // Truncate original file (preserves file descriptor for watchers)
      fs.truncateSync(filepath, 0);

      logger.info({
        category: "system",
        action: "file_rotated",
        message: `Log file rotated successfully`,
        details: { service, rotatedPath },
      });

      // Compress if enabled
      if (this.config.compress) {
        this.compressFile(rotatedPath);
      }
    } catch (error) {
      logger.error({
        category: "system",
        action: "rotation_failed",
        message: `Failed to rotate log file: ${filepath}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Compress a rotated log file with gzip
   */
  private compressFile(filepath: string): void {
    try {
      const gzipPath = `${filepath}.gz`;

      // Read file
      const input = fs.readFileSync(filepath);

      // Compress
      const compressed = zlib.gzipSync(input, { level: 9 });

      // Write compressed file
      fs.writeFileSync(gzipPath, compressed);

      // Delete original
      fs.unlinkSync(filepath);

      logger.info({
        category: "system",
        action: "file_compressed",
        message: `Log file compressed`,
        details: {
          original: filepath,
          compressed: gzipPath,
          originalSize: input.length,
          compressedSize: compressed.length,
          compressionRatio:
            ((1 - compressed.length / input.length) * 100).toFixed(1) + "%",
        },
      });
    } catch (error) {
      logger.error({
        category: "system",
        action: "compression_failed",
        message: `Failed to compress log file: ${filepath}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Clean up old rotated files beyond retention period
   */
  private cleanupOldFiles(): void {
    try {
      if (!fs.existsSync(this.archivedDir)) {
        return;
      }

      const files = fs.readdirSync(this.archivedDir);
      const now = Date.now();
      const maxAgeMs = this.config.maxAge * 24 * 60 * 60 * 1000;

      let deletedCount = 0;
      let freedSpace = 0;

      for (const file of files) {
        const filepath = path.join(this.archivedDir, file);

        try {
          const stats = fs.statSync(filepath);
          const age = now - stats.mtimeMs;

          if (age > maxAgeMs) {
            freedSpace += stats.size;
            fs.unlinkSync(filepath);
            deletedCount++;
          }
        } catch (error) {
          logger.error({
            category: "system",
            action: "cleanup_file_failed",
            message: `Failed to clean up file: ${filepath}`,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }

      if (deletedCount > 0) {
        logger.info({
          category: "system",
          action: "cleanup_completed",
          message: "Cleaned up old log files",
          details: {
            deletedCount,
            freedSpace: `${(freedSpace / 1024 / 1024).toFixed(2)} MB`,
          },
        });
      }
    } catch (error) {
      logger.error({
        category: "system",
        action: "cleanup_failed",
        message: "Failed to clean up old log files",
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Get rotation status for all managed files
   */
  public getStatus(): {
    file: string;
    service: string;
    size: number;
    sizeFormatted: string;
    percentFull: number;
    exists: boolean;
  }[] {
    return this.managedFiles.map((file) => {
      if (!fs.existsSync(file.filepath)) {
        return {
          file: path.basename(file.filepath),
          service: file.service,
          size: 0,
          sizeFormatted: "0 B",
          percentFull: 0,
          exists: false,
        };
      }

      const stats = fs.statSync(file.filepath);
      const size = stats.size;
      const percentFull = (size / this.config.maxSize) * 100;

      // Format size
      let sizeFormatted: string;
      if (size < 1024) {
        sizeFormatted = `${size} B`;
      } else if (size < 1024 * 1024) {
        sizeFormatted = `${(size / 1024).toFixed(2)} KB`;
      } else {
        sizeFormatted = `${(size / 1024 / 1024).toFixed(2)} MB`;
      }

      return {
        file: path.basename(file.filepath),
        service: file.service,
        size,
        sizeFormatted,
        percentFull: Math.round(percentFull),
        exists: true,
      };
    });
  }
}
