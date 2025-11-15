/**
 * JSONL Log Writer Service
 *
 * Writes logs to daily-rotated JSONL files.
 * Format: One JSON object per line, easy to grep.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  scope: string;
  traceId?: string;
  sessionId: string;
  route: string;
  userId?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    cause?: unknown;
  };
}

export interface SessionMetadata {
  sessionId: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  timestamp: string;
}

export class LogWriter {
  private logsDirectory: string;

  constructor(logsDirectory?: string) {
    this.logsDirectory = logsDirectory || path.join(process.cwd(), 'logs', 'frontend');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logsDirectory)) {
      fs.mkdirSync(this.logsDirectory, { recursive: true });
    }
  }

  private getLogFilePath(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const filename = `${year}-${month}-${day}.jsonl`;
    return path.join(this.logsDirectory, filename);
  }

  writeSessionStart(meta: SessionMetadata): void {
    const entry = {
      type: 'session_start',
      ...meta,
    };

    this.appendToLog(entry);
  }

  writeLogs(logs: LogEntry[]): void {
    for (const log of logs) {
      this.appendToLog(log);
    }
  }

  private appendToLog(entry: Record<string, unknown>): void {
    const filePath = this.getLogFilePath();
    const line = JSON.stringify(entry) + '\n';

    try {
      fs.appendFileSync(filePath, line, 'utf8');
    } catch (error) {
      console.error('[LogWriter] Failed to write log:', error);
      // Don't throw - we don't want logging failures to break the API
    }
  }

  /**
   * Clean up old log files (optional maintenance)
   */
  cleanupOldLogs(retentionDays: number = 30): void {
    const files = fs.readdirSync(this.logsDirectory);
    const now = Date.now();
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.endsWith('.jsonl')) {
        continue;
      }

      const filePath = path.join(this.logsDirectory, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > retentionMs) {
        try {
          fs.unlinkSync(filePath);
          console.log(`[LogWriter] Deleted old log file: ${file}`);
        } catch (error) {
          console.error(`[LogWriter] Failed to delete ${file}:`, error);
        }
      }
    }
  }
}
