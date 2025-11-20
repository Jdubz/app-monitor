/**
 * Observability API Routes
 * 
 * Provides deep observability endpoints for autonomous agent debugging
 * and exploration of the phased task execution system.
 * 
 * Endpoints:
 * - GET /api/observability/tasks/:taskId/trace - Full execution timeline
 * - GET /api/observability/logs - Phase-specific log queries
 * - GET /api/observability/anomalies - Automated anomaly detection
 * - GET /api/observability/diagnostics - Available diagnostic queries
 * - GET /api/observability/diagnostics/:queryId - Execute diagnostic query
 */

import express, { Request, Response } from 'express';
import {
  ApiError,
  PhaseLogsQuery,
  TaskTraceResponse,
  PhaseLogsApiResponse,
  AnomalyDetectionResponse,
  DiagnosticQueriesResponse,
  DiagnosticQueryResultResponse,
} from '@app-monitor/api-contracts';
import { getPhaseObservabilityService, QueryNotFoundError } from '../services/phaseObservability.service.js';
import { getDatabase } from '../services/database.js';
import { logger } from '../utils/logger.js';
import { defineRoute } from './routeRegistry.js';

const router = express.Router();

// Initialize service using singleton pattern
const observabilityService = getPhaseObservabilityService(getDatabase().getDb());

/**
 * Helper to respond with success
 */
const respondSuccess = <T>(res: Response, data: T, status = 200) => {
  return res.status(status).json({
    success: true,
    data,
  });
};

/**
 * Helper to respond with error
 */
const respondError = (res: Response, status: number, error: string, message?: string) => {
  const payload: ApiError = {
    success: false,
    error,
    ...(message ? { message } : {}),
  };
  return res.status(status).json(payload);
};

/**
 * GET /api/observability/tasks/:taskId/trace
 * Get complete execution timeline for a specific task
 */
const taskTraceRoute = defineRoute({
  method: 'get',
  path: '/tasks/:taskId/trace',
  summary: 'Get Task Execution Trace',
  description: 'Get complete execution timeline for a specific task',
  tags: ['observability'],
  response: {
    body: {} as TaskTraceResponse
  },
  handler: async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;

      const timeline = observabilityService.getTaskTrace(taskId);

      if (!timeline) {
        return respondError(res, 404, 'TASK_NOT_FOUND', `Task ${taskId} not found`);
      }

      respondSuccess<TaskTraceResponse['data']>(res, timeline);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'task_trace_error',
        message: `Failed to get trace for task ${req.params.taskId}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      respondError(res, 500, 'FAILED_TO_GET_TASK_TRACE', 'Failed to retrieve task execution trace');
    }
  }
});
router[taskTraceRoute.method](taskTraceRoute.path, taskTraceRoute.handler);

/**
 * GET /api/observability/logs
 * Query phase-specific logs with flexible filtering
 */
const phaseLogsRoute = defineRoute({
  method: 'get',
  path: '/logs',
  summary: 'Query Phase Logs',
  description: 'Query phase-specific logs with flexible filtering (taskId, phaseIndex, level, category, time range)',
  tags: ['observability'],
  response: {
    body: {} as PhaseLogsApiResponse
  },
  handler: async (req: Request, res: Response) => {
    try {
      const query: PhaseLogsQuery = {
        taskId: req.query.taskId as string | undefined,
        phaseIndex: req.query.phaseIndex ? parseInt(req.query.phaseIndex as string, 10) : undefined,
        level: req.query.level as string | undefined,
        category: req.query.category as string | undefined,
        startTime: req.query.startTime as string | undefined,
        endTime: req.query.endTime as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const logsResponse = observabilityService.getPhaseLogs(query);

      respondSuccess<PhaseLogsApiResponse['data']>(res, logsResponse);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'phase_logs_error',
        message: 'Failed to query phase logs',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      respondError(res, 500, 'FAILED_TO_QUERY_LOGS', 'Failed to query phase logs');
    }
  }
});
router[phaseLogsRoute.method](phaseLogsRoute.path, phaseLogsRoute.handler);

/**
 * GET /api/observability/anomalies
 * Detect anomalies in task execution patterns
 */
const anomaliesRoute = defineRoute({
  method: 'get',
  path: '/anomalies',
  summary: 'Detect Execution Anomalies',
  description: 'Detect anomalies in task execution patterns (loops, slow phases, validation failures)',
  tags: ['observability'],
  response: {
    body: {} as AnomalyDetectionResponse
  },
  handler: async (req: Request, res: Response) => {
    try {
      const anomalies = observabilityService.detectAnomalies();

      respondSuccess<AnomalyDetectionResponse['data']>(res, anomalies);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'anomaly_detection_error',
        message: 'Failed to detect anomalies',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      respondError(res, 500, 'FAILED_TO_DETECT_ANOMALIES', 'Failed to detect execution anomalies');
    }
  }
});
router[anomaliesRoute.method](anomaliesRoute.path, anomaliesRoute.handler);

/**
 * GET /api/observability/diagnostics
 * List available pre-built diagnostic queries
 */
const diagnosticsListRoute = defineRoute({
  method: 'get',
  path: '/diagnostics',
  summary: 'List Diagnostic Queries',
  description: 'List available pre-built diagnostic queries',
  tags: ['observability'],
  response: {
    body: {} as DiagnosticQueriesResponse
  },
  handler: async (req: Request, res: Response) => {
    try {
      const queries = observabilityService.getDiagnosticQueries();

      respondSuccess<DiagnosticQueriesResponse['data']>(res, queries);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'diagnostics_list_error',
        message: 'Failed to list diagnostic queries',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      respondError(res, 500, 'FAILED_TO_LIST_DIAGNOSTICS', 'Failed to list diagnostic queries');
    }
  }
});
router[diagnosticsListRoute.method](diagnosticsListRoute.path, diagnosticsListRoute.handler);

/**
 * GET /api/observability/diagnostics/:queryId
 * Execute a specific diagnostic query
 */
const diagnosticExecuteRoute = defineRoute({
  method: 'get',
  path: '/diagnostics/:queryId',
  summary: 'Execute Diagnostic Query',
  description: 'Execute a specific diagnostic query (slow_phases, high_failure_phases, loop_iterations, etc.)',
  tags: ['observability'],
  response: {
    body: {} as DiagnosticQueryResultResponse
  },
  handler: async (req: Request, res: Response) => {
    try {
      const { queryId } = req.params;

      const result = observabilityService.executeDiagnosticQuery(queryId);

      respondSuccess<DiagnosticQueryResultResponse['data']>(res, result);
    } catch (error) {
      if (error instanceof QueryNotFoundError) {
        return respondError(res, 404, 'QUERY_NOT_FOUND', error.message);
      }

      logger.error({
        category: 'api',
        action: 'diagnostic_execution_error',
        message: `Failed to execute diagnostic query ${req.params.queryId}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      respondError(res, 500, 'FAILED_TO_EXECUTE_DIAGNOSTIC', 'Failed to execute diagnostic query');
    }
  }
});
router[diagnosticExecuteRoute.method](diagnosticExecuteRoute.path, diagnosticExecuteRoute.handler);

export default router;
