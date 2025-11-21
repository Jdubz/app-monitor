/**
 * Log Writer Service
 *
 * Writes logs to SQLite (for fast queries) and JSONL files (for backup/grep).
 * SQLite is the source of truth for log querying (used by issue triage).
 * JSONL is append-only backup for recovery.
 */

import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import type {
  FrontendLogEntry,
  FrontendSessionMetadata
} from '@app-monitor/api-contracts';
import { MS_PER_DAY } from '../constants/timeouts.js';
import { resolveLogsDir } from '../utils/repoPaths.js';

export class LogWriter {
  private logsDirectory: string;
  private db: Database.Database;

  constructor(db: Database.Database, logsDirectory?: string) {
    this.db = db;
    this.logsDirectory = logsDirectory || path.join(resolveLogsDir(), 'frontend');
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

  writeSessionStart(meta: FrontendSessionMetadata): void {
    const entry = {
      type: 'session_start',
      ...meta,
    };

    // Store in database
    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO session_metadata (
          session_id, user_agent, viewport_width, viewport_height, start_time
        ) VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        meta.sessionId,
        meta.userAgent,
        meta.viewport.width,
        meta.viewport.height,
        meta.timestamp
      );
    } catch (error) {
      console.error('[LogWriter] Failed to write session metadata to database:', error);
    }

    this.appendToJSONL(entry);
  }

  writeLogs(logs: FrontendLogEntry[]): void {
    // Write to SQLite (source of truth for queries)
    const stmt = this.db.prepare(`
      INSERT INTO frontend_logs (
        id, timestamp, level, message, scope, traceId, sessionId, route, userId,
        data, errorName, errorMessage, errorStack
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((logEntries: FrontendLogEntry[]) => {
      for (const log of logEntries) {
        stmt.run(
          log.id,
          log.timestamp,
          log.level,
          log.message,
          log.scope || null,
          log.traceId || null,
          log.sessionId,
          log.route || null,
          log.userId || null,
          log.data ? JSON.stringify(log.data) : null,
          log.error?.name || null,
          log.error?.message || null,
          log.error?.stack || null
        );
      }
    });

    try {
      transaction(logs);
    } catch (error) {
      console.error('[LogWriter] Failed to write logs to database:', error);
      // Continue to JSONL backup even if DB fails
    }

    // Write to JSONL (backup for grep/recovery)
    for (const log of logs) {
      this.appendToJSONL(log as unknown as Record<string, unknown>);
    }
  }

  private appendToJSONL(entry: Record<string, unknown>): void {
    const filePath = this.getLogFilePath();
    const line = JSON.stringify(entry) + '\n';

    try {
      fs.appendFileSync(filePath, line, 'utf8');
    } catch (error) {
      console.error('[LogWriter] Failed to write to JSONL:', error);
      // Don't throw - we don't want logging failures to break the API
    }
  }

  /**
   * Clean up old log files (optional maintenance)
   */
  cleanupOldLogs(retentionDays: number = 30): void {
    const files = fs.readdirSync(this.logsDirectory);
    const now = Date.now();
    const retentionMs = retentionDays * MS_PER_DAY;

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
