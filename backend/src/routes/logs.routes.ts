/**
 * Frontend Logs API Routes
 *
 * POST /api/logs/frontend - Receive batched logs from frontend
 */

import express, { Request, Response } from 'express';
import { LogWriter } from '../services/logWriter.js';

const router = express.Router();
const logWriter = new LogWriter();

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
      logWriter.writeSessionStart(batch.meta);
    }

    // Handle log batch
    if (batch.type === 'log_batch' && batch.logs) {
      logWriter.writeLogs(batch.logs as any);
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
