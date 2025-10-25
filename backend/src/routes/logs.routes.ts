import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { LogRotation } from '../services/logRotation.js';
import { CloudLogging } from '../services/cloudLogging.js';
import { LogStreamer } from '../services/logStreamer.js';
import { ProcessManager } from '../services/processManager.js';
import { logSourceManager } from '../server.js';
import { logger } from '../utils/logger.js';

const LOGS_DIR = path.join(process.cwd(), 'logs');

export interface LogsRoutesDependencies {
  logRotation: LogRotation;
  cloudLogging: CloudLogging;
  logStreamer: LogStreamer;
  processManager: ProcessManager;
}

export function createLogsRoutes(deps: LogsRoutesDependencies): Router {
  const router = Router();
  const { logRotation, cloudLogging, logStreamer, processManager } = deps;

  /**
   * GET /api/logs/sources
   * Get all configured log sources
   */
  router.get('/sources', async (req: Request, res: Response) => {
    try {
      const sources = logSourceManager.getEnabledSources();
      
      res.json({
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
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'get_log_sources_error',
        message: 'Failed to get log sources',
        error,
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/logs/config
   * Get log sources configuration including global settings
   */
  router.get('/config', async (req: Request, res: Response) => {
    try {
      const configJSON = logSourceManager.getConfigJSON();
      
      res.json({
        success: true,
        data: configJSON,
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'get_log_config_error',
        message: 'Failed to get log configuration',
        error,
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/logs/reload
   * Reload log sources configuration from disk
   */
  router.post('/reload', async (req: Request, res: Response) => {
    try {
      await logSourceManager.reloadConfig();
      
      res.json({
        success: true,
        message: 'Log sources configuration reloaded',
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'reload_log_config_error',
        message: 'Failed to reload log configuration',
        error,
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get logs for a specific service
  router.get('/services/:serviceName/logs', (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const lines = parseInt(req.query.lines as string) || 100;
      const logWatcher = processManager.getLogWatcher();
      const logs = logWatcher.getRecentLogs(serviceName, lines);
      res.json({ serviceName, logs });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_logs_for_req_params_servicename_error',
        message: `Error getting logs for ${req.params.serviceName}: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get logs',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get cloud logs
  router.get('/cloud/:environment/:service', async (req: Request, res: Response) => {
    try {
      const { environment, service } = req.params;
      const { severity, limit, startTime, endTime } = req.query;

      const query = {
        environment,
        service,
        severity: severity as string,
        limit: limit ? parseInt(limit as string) : 100,
        timeRange: startTime && endTime ? {
          start: new Date(startTime as string),
          end: new Date(endTime as string),
        } : undefined,
      };

      const logs = await cloudLogging.getLogs(query);
      res.json({
        environment,
        service,
        count: logs.length,
        logs,
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_cloud_logs_error',
        message: `Error getting cloud logs: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get cloud logs',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Check if cloud logging is available
  router.get('/cloud/status', (_req: Request, res: Response) => {
    const available = cloudLogging.isAvailable();
    res.json({
      available,
      message: available
        ? 'Cloud Logging is available'
        : 'Cloud Logging is not available. Check credentials configuration.',
    });
  });

  // Get available log sources (legacy - kept for backwards compatibility)
  router.get('/sources/legacy', (_req: Request, res: Response) => {
    try {
      const logWatcher = logStreamer.getLogWatcher();
      const sources = logWatcher.getAvailableSources();
      res.json({
        count: sources.length,
        sources,
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'get_sources_failed',
        message: 'Failed to get log sources',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      res.status(500).json({
        error: 'Failed to get log sources',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

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
