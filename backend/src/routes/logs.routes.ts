import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { LogRotation } from '../services/logRotation.js';
import { CloudLogging } from '../services/cloudLogging.js';
import type { LogStreamer } from '../services/logStreamer.js';
import { ProcessManager } from '../services/processManager.js';
import { logSourceManager } from '../server.js';
import { logger } from '../utils/logger.js';
import type {
  ServiceLogsApiResponse,
  LogSourcesResponse,
  CloudLogsApiResponse,
  CloudLoggingStatusApiResponse,
  LogConfigResponse,
  LogReloadResponse,
  ApiError,
  CloudLogsQuery,
} from '@app-monitor/api-contracts';

const LOGS_DIR = path.join(process.cwd(), 'logs');

const cloudLogsRequestSchema = z.object({
  environment: z.string().min(1),
  service: z.string().min(1),
  severity: z.string().min(1).optional(),
  limit: z
    .string()
    .transform((value) => parseInt(value, 10))
    .pipe(z.number().int().positive().max(1000))
    .optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  customFilter: z.string().min(1).optional(),
}).refine(
  data => (data.startTime && data.endTime) || (!data.startTime && !data.endTime),
  {
    message: 'startTime and endTime must both be provided',
    path: ['startTime'],
  }
);

export interface LogsRoutesDependencies {
  logRotation: LogRotation;
  cloudLogging: CloudLogging;
  logStreamer: LogStreamer;
  processManager: ProcessManager;
}

export function createLogsRoutes(deps: LogsRoutesDependencies): Router {
  const router = Router();
  const { logRotation, cloudLogging, processManager } = deps;
  const respondError = (res: Response, status: number, errorLabel: string, error: unknown) => {
    const payload: ApiError = {
      success: false,
      error: errorLabel,
      message: error instanceof Error ? error.message : String(error),
    };
    return res.status(status).json(payload);
  };

  /**
   * GET /api/logs/sources
   * Get all configured log sources
   */
  router.get('/sources', async (req: Request, res: Response) => {
    try {
      const sources = logSourceManager.getEnabledSources();
      
      const payload: LogSourcesResponse = {
        success: true,
        data: sources.map(source => ({
          id: source.id,
          name: source.name,
          format: source.format,
          parser: source.parser,
          color: source.color,
          displayOrder: source.displayOrder,
          path: logSourceManager.resolveLogPath(source),
        })),
      };
      res.json(payload);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'get_log_sources_error',
        message: 'Failed to get log sources',
        error,
      });
      respondError(res, 500, 'Failed to get log sources', error);
    }
  });

  /**
   * GET /api/logs/config
   * Get log sources configuration including global settings
   */
  router.get('/config', async (req: Request, res: Response) => {
    try {
      const configJSON = logSourceManager.getConfigJSON();
      
      const payload: LogConfigResponse = {
        success: true,
        data: configJSON,
      };
      res.json(payload);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'get_log_config_error',
        message: 'Failed to get log configuration',
        error,
      });
      respondError(res, 500, 'Failed to get log configuration', error);
    }
  });

  /**
   * POST /api/logs/reload
   * Reload log sources configuration from disk
   */
  router.post('/reload', async (req: Request, res: Response) => {
    try {
      await logSourceManager.reloadConfig();
      
      const payload: LogReloadResponse = {
        success: true,
        data: { message: 'Log sources configuration reloaded' },
      };
      res.json(payload);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'reload_log_config_error',
        message: 'Failed to reload log configuration',
        error,
      });
      respondError(res, 500, 'Failed to reload log configuration', error);
    }
  });

  // Get logs for a specific service
  router.get('/services/:serviceName/logs', (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const lines = parseInt(req.query.lines as string) || 100;
      const logWatcher = processManager.getLogWatcher();
      if (!logWatcher) {
        return res.status(503).json({ error: 'Log watcher not available' });
      }
      const structuredLogs = logWatcher.getRecentLogs(serviceName, lines);
      const logLines = structuredLogs.map((entry) => {
        if (typeof entry.message === 'string' && entry.message.length > 0) {
          return entry.message;
        }
        if (entry.details && typeof entry.details.message === 'string') {
          return entry.details.message;
        }
        return JSON.stringify(entry);
      });
      const payload: ServiceLogsApiResponse = {
        success: true,
        data: { serviceName, logs: logLines },
      };
      res.json(payload);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_logs_for_req_params_servicename_error',
        message: `Error getting logs for ${req.params.serviceName}: ${error}`,
        error
      });
      respondError(res, 500, 'Failed to get logs', error);
    }
  });

  // Get cloud logs
  router.get('/cloud/:environment/:service', async (req: Request, res: Response) => {
    try {
      const { environment, service } = req.params;
      const parseResult = cloudLogsRequestSchema.safeParse({
        environment,
        service,
        severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
        limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
        startTime: typeof req.query.startTime === 'string' ? req.query.startTime : undefined,
        endTime: typeof req.query.endTime === 'string' ? req.query.endTime : undefined,
        customFilter: typeof req.query.customFilter === 'string' ? req.query.customFilter : undefined,
      });

      if (!parseResult.success) {
        const message = parseResult.error.issues.map((err: any) => err.message).join('; ');
        return respondError(res, 400, 'Invalid query parameters', new Error(message));
      }

      const {
        startTime: startISO,
        endTime: endISO,
        limit,
        ...rest
      } = parseResult.data;

      const query: CloudLogsQuery = {
        environment: rest.environment,
        service: rest.service,
        severity: rest.severity,
        limit: limit ?? 100,
        timeRange: startISO && endISO ? { start: new Date(startISO), end: new Date(endISO) } : undefined,
        customFilter: rest.customFilter,
      };

      const logs = await cloudLogging.getLogs(query);
      const payload: CloudLogsApiResponse = {
        success: true,
        data: {
          environment,
          service,
          count: logs.length,
          logs,
        },
      };
      res.json(payload);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_cloud_logs_error',
        message: `Error getting cloud logs: ${error}`,
        error
      });
      respondError(res, 500, 'Failed to get cloud logs', error);
    }
  });

  // Check if cloud logging is available
  router.get('/cloud/status', (_req: Request, res: Response) => {
    const available = cloudLogging.isAvailable();
    const payload: CloudLoggingStatusApiResponse = {
      success: true,
      data: {
        available,
        message: available
          ? 'Cloud Logging is available'
          : 'Cloud Logging is not available. Check credentials configuration.',
      },
    };
    res.json(payload);
  });

  // REMOVED: GET /sources/legacy endpoint (no longer used by any clients)

  // Frontend logging endpoint
  router.post('/frontend', (req: Request, res: Response) => {
    try {
      const logEntry = req.body;

      if (!logEntry.severity || !logEntry.message) {
        res.status(400).json({
          error: 'Invalid log entry',
          message: 'severity and message are required',
        });
        return;
      }

      let service = logEntry.service || 'frontend';
      let logFileName = 'frontend.log';

      if (service === 'frontend-browser') {
        logFileName = 'browser-console.log';
      } else {
        service = 'frontend';
        logEntry.service = service;
      }

      if (!logEntry.environment) {
        logEntry.environment = 'development';
      }

      if (!logEntry.timestamp) {
        logEntry.timestamp = new Date().toISOString();
      }

      const LOG_FILE = path.join(LOGS_DIR, logFileName);
      const logLine = JSON.stringify(logEntry) + '\n';

      const logDir = path.dirname(LOG_FILE);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      fs.appendFileSync(LOG_FILE, logLine);
      res.status(201).json({ success: true });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'log_failed',
        message: 'Failed to write frontend log',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      res.status(500).json({
        error: 'Failed to write log',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get log rotation status
  router.get('/rotation/status', (_req: Request, res: Response) => {
    try {
      const status = logRotation.getStatus();
      res.json({
        status,
        config: {
          maxSize: '10 MB',
          maxAge: '7 days',
          checkInterval: '1 minute',
          compress: true,
        },
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'rotation_status_failed',
        message: 'Failed to get log rotation status',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      res.status(500).json({
        error: 'Failed to get rotation status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
