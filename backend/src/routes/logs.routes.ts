/**
 * Frontend Logs API Routes
 *
 * POST /api/logs/frontend - Receive batched logs from frontend
 */

import express, { Request, Response } from 'express';
import { LogWriter, type LogEntry } from '../services/logWriter.js';
import type Database from 'better-sqlite3';

const router = express.Router();

// LogWriter will be initialized with database
let logWriter: LogWriter;

export function initializeLogsRoutes(db: Database.Database): typeof router {
  logWriter = new LogWriter(db);
  return router;
}

interface LogBatch {
  type: 'session_start' | 'log_batch';
  sessionId: string;
  meta?: {
    sessionId: string;
    userAgent: string;
    viewport: { width: number; height: number };
    timestamp: string;
  };
  logs?: Array<{
    id: string;
    timestamp: string;
    level: string;
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
  }>;
}

/**
 * POST /api/logs/frontend
 * Receive and persist frontend logs
 */
router.post('/frontend', (req: Request, res: Response) => {
  try {
    // Check if logWriter is initialized
    if (!logWriter) {
      res.status(503).json({
        success: false,
        error: 'Log writer not initialized',
      });
      return;
    }

    const batch = req.body as LogBatch;

    // Validate batch
    if (!batch.type || !batch.sessionId) {
      res.status(400).json({
        success: false,
        error: 'Invalid batch format',
      });
      return;
    }

    // Handle session start
    if (batch.type === 'session_start' && batch.meta) {
      try {
        logWriter.writeSessionStart(batch.meta);
      } catch (error) {
        // If session_metadata table doesn't exist, silently continue
        // Migration will be applied on next server restart
        console.warn('[LogsAPI] Failed to write session metadata (table may not exist yet):', error);
      }
    }

    // Handle log batch
    if (batch.type === 'log_batch' && batch.logs) {
      try {
        logWriter.writeLogs(batch.logs as LogEntry[]);
      } catch (error) {
        // If frontend_logs table doesn't exist, silently continue
        // Migration will be applied on next server restart
        console.warn('[LogsAPI] Failed to write logs (table may not exist yet):', error);
      }
    }

    res.json({
      success: true,
      message: 'Logs received',
    });
  } catch (error) {
    console.error('[LogsAPI] Error processing logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process logs',
    });
  }
});

export default router;
