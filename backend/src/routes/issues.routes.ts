/**
 * Issue Reporting API Routes
 *
 * POST /api/issues - Receive issue reports from frontend
 * GET /api/issues - Query issues (admin only, future)
 */

import express, { Request, Response } from 'express';
import { IssueStorageService } from '../services/issueStorageService.js';
import type { IssueReport } from '../services/issueStorageService.js';

const router = express.Router();
const issueStorage = new IssueStorageService();

/**
 * POST /api/issues
 * Receive and persist issue report
 */
router.post('/', (req: Request, res: Response) => {
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

    res.json({
      success: true,
      data: {
        issueId: issue.id,
        message: 'Issue recorded. Automated triage will run within 5 minutes.',
      },
    });
  } catch (error) {
    console.error('[IssuesAPI] Error processing issue report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process issue report',
    });
  }
});

export default router;
