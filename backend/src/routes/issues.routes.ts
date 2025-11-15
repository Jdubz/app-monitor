/**
 * Issue Reporting API Routes
 *
 * POST /api/issues - Receive issue reports from frontend (triggers immediate triage)
 * GET /api/issues - Query issues (admin only, future)
 */

import express, { Request, Response } from 'express';
import { IssueStorageService } from '../services/issueStorageService.js';
import { IssueTriageService } from '../services/issueTriageService.js';
import type { IssueReport } from '../services/issueStorageService.js';
import type { TaskQueueService } from '../services/taskQueue.sqlite.js';
import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Issue storage and triage will be initialized with database
let issueStorage: IssueStorageService;
let triageService: IssueTriageService;

export function initializeIssuesRoutes(
  db: Database.Database,
  taskQueue: TaskQueueService
): typeof router {
  issueStorage = new IssueStorageService(db);
  triageService = new IssueTriageService(issueStorage, undefined, taskQueue);
  return router;
}

/**
 * POST /api/issues
 * Receive issue report, persist it, and immediately trigger triage
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const report = req.body as IssueReport;

    // Validate required fields
    if (!report.timestamp || !report.sessionId || !report.route) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: timestamp, sessionId, route',
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
