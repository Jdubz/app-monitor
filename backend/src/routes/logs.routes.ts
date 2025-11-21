/**
 * Frontend Logs API Routes
 *
 * POST /api/logs/frontend - Receive batched logs from frontend
 */

import express, { Request, Response } from 'express';
import { LogWriter } from '../services/logWriter.js';
import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { defineRoute } from './routeRegistry.js';
import type {
  FrontendLogBatchRequest,
  FrontendLogEntry,
  FrontendLogIngestResponse
} from '@app-monitor/api-contracts';

const router = express.Router();

// LogWriter will be initialized with database
let logWriter: LogWriter;

export function initializeLogsRoutes(db: Database.Database): typeof router {
  logWriter = new LogWriter(db);
  return router;
}

/**
 * POST /api/logs/frontend
 * Receive and persist frontend logs
 */
const ingestFrontendLogsRoute = defineRoute({
  method: 'post',
  path: '/frontend',
  summary: 'Ingest Frontend Logs',
  description: 'Receive batched frontend logs and session metadata for observability.',
  tags: ['logs'],
  request: {
    body: {} as FrontendLogBatchRequest
  },
  response: {
    body: {} as FrontendLogIngestResponse
  },
  handler: (req: Request, res: Response) => {
    try {
      // Check if logWriter is initialized
      if (!logWriter) {
        res.status(503).json({
          success: false,
        error: 'Log writer not initialized',
      });
      return;
    }

    const batch = req.body as FrontendLogBatchRequest;

    // Validate batch with detailed error logging
    if (!batch.type || !batch.sessionId) {
      logger.warn({
        category: 'api',
        action: 'invalid_log_batch',
        message: 'Received invalid log batch format',
        details: {
          hasType: !!batch.type,
          hasSessionId: !!batch.sessionId,
          type: batch.type,
          sessionId: batch.sessionId,
          bodyKeys: Object.keys(req.body || {}),
        }
      });
      res.status(400).json({
        success: false,
        error: 'Invalid batch format: missing type or sessionId',
        details: {
          hasType: !!batch.type,
          hasSessionId: !!batch.sessionId,
        }
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
        logger.warn({
          category: 'api',
          action: 'write_session_metadata_failed',
          message: 'Failed to write session metadata (table may not exist yet)',
          error
        });
      }
    }

    // Handle log batch
    if (batch.type === 'log_batch' && batch.logs) {
      try {
        logWriter.writeLogs(batch.logs as FrontendLogEntry[]);
      } catch (error) {
        // If frontend_logs table doesn't exist, silently continue
        // Migration will be applied on next server restart
        logger.warn({
          category: 'api',
          action: 'write_logs_failed',
          message: 'Failed to write logs (table may not exist yet)',
          error
        });
      }
    }

    const responsePayload: FrontendLogIngestResponse = {
      success: true,
      data: {
        message: 'Logs received',
      },
    };

    res.json(responsePayload);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'process_logs_failed',
      message: 'Error processing logs',
      error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to process logs',
    });
  }
  }
});

router[ingestFrontendLogsRoute.method](
  ingestFrontendLogsRoute.path,
  ingestFrontendLogsRoute.handler
);

export default router;
