/**
 * Issue Reporting API Routes
 *
 * POST /api/issues - Receive issue reports from frontend (triggers immediate triage)
 * GET /api/issues - Query issues (admin only, future)
 *
 * SECURITY: Rate limited to prevent abuse (10 reports/hour per session)
 */

import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { IssueStorageService } from '../services/issueStorageService.js';
import { IssueTriageService } from '../services/issueTriageService.js';
import type { IssueReport } from '../services/issueStorageService.js';
import type { TaskQueueService } from '../services/taskQueue.sqlite.js';
import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { MS_PER_HOUR, MS_PER_MINUTE } from '../constants/timeouts.js';

const router = express.Router();

// Issue storage and triage will be initialized with database
let issueStorage: IssueStorageService;
let triageService: IssueTriageService;

// Rate limiter: Prevent abuse of unauthenticated endpoint
const issueReportLimiter = rateLimit({
  windowMs: MS_PER_HOUR, // 1 hour window
  max: 10, // Max 10 requests per hour
  message: { success: false, error: 'Too many issue reports. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // Don't count failed requests (validation errors) toward rate limit
  keyGenerator: (req) => {
    // Rate limit by sessionId from request body
    const body = req.body as IssueReport;
    return body?.sessionId ||  'no-session';
  },
  handler: (req, res) => {
    logger.warn({
      category: 'issue-triage',
      action: 'rate_limit_exceeded',
      message: 'Issue report rate limit exceeded',
      details: {
        sessionId: (req.body as IssueReport)?.sessionId,
        ip: req.ip,
      },
    });
    res.status(429).json({
      success: false,
      error: 'Too many issue reports. Please try again in an hour.',
    });
  },
});

export function initializeIssuesRoutes(
  db: Database.Database,
  taskQueue: TaskQueueService
): typeof router {
  issueStorage = new IssueStorageService(db);
  triageService = new IssueTriageService(issueStorage, taskQueue);
  return router;
}

/**
 * POST /api/issues
 * Receive issue report, persist it, and immediately trigger triage
 *
 * SECURITY: Rate limited to 10 reports/hour per session
 */
router.post('/', issueReportLimiter, async (req: Request, res: Response) => {
  try {
    const report = req.body as IssueReport;

    // Comprehensive input validation
    // 1. Required fields
    if (!report.timestamp || !report.sessionId || !report.route || !report.userAgent) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: timestamp, sessionId, route, userAgent',
      });
      return;
    }

    // 2. Validate timestamp format
    const timestamp = new Date(report.timestamp);
    if (isNaN(timestamp.getTime())) {
      res.status(400).json({
        success: false,
        error: 'Invalid timestamp format',
      });
      return;
    }

    // 3. Validate timestamp is not in future (allow 5 minute clock skew)
    const now = Date.now();
    const maxFuture = now + 5 * MS_PER_MINUTE;
    if (timestamp.getTime() > maxFuture) {
      res.status(400).json({
        success: false,
        error: 'Timestamp cannot be in the future',
      });
      return;
    }

    // 4. Validate sessionId format
    if (typeof report.sessionId !== 'string' || !/^session-\d+-[a-z0-9]+$/.test(report.sessionId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid sessionId format (expected: session-{timestamp}-{random})',
      });
      return;
    }

    // 5. Validate route format (must start with /, no path traversal)
    if (typeof report.route !== 'string' || !report.route.startsWith('/') || report.route.includes('..')) {
      res.status(400).json({
        success: false,
        error: 'Invalid route format (must start with / and contain no ..)',
      });
      return;
    }

    // 6. Validate route length
    if (report.route.length > 500) {
      res.status(400).json({
        success: false,
        error: 'Route too long (max 500 characters)',
      });
      return;
    }

    // 7. Validate traceId format (if provided)
    if (report.traceId && (typeof report.traceId !== 'string' || !/^trace-\d+-[a-z0-9]+$/.test(report.traceId))) {
      res.status(400).json({
        success: false,
        error: 'Invalid traceId format (expected: trace-{timestamp}-{random})',
      });
      return;
    }

    // 8. Validate description length (if provided)
    if (report.description && report.description.length > 5000) {
      res.status(400).json({
        success: false,
        error: 'Description too long (max 5000 characters)',
      });
      return;
    }

    // 9. Validate userAgent length
    if (report.userAgent.length > 1000) {
      res.status(400).json({
        success: false,
        error: 'User agent too long (max 1000 characters)',
      });
      return;
    }

    // Store issue
    const issue = issueStorage.storeIssue(report);

    logger.info({
      category: 'issue-triage',
      action: 'issue_received',
      message: 'Issue report received, triggering immediate triage',
      details: { issueId: issue.id, route: report.route },
    });

    // Respond immediately to frontend
    res.json({
      success: true,
      data: {
        issueId: issue.id,
        message: 'Issue recorded and triage started.',
      },
    });

    // Trigger triage asynchronously (don't block response)
    void triageService.triagePendingIssues().catch((error) => {
      logger.error({
        category: 'issue-triage',
        action: 'triage_failed',
        message: 'Failed to triage issue',
        error,
        details: { issueId: issue.id },
      });
    });
  } catch (error) {
    logger.error({
      category: 'issue-triage',
      action: 'issue_submission_failed',
      message: 'Failed to process issue report',
      error,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to process issue report',
    });
  }
});

export default router;
