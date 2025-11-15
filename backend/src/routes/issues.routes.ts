/**
 * Issue Reporting API Routes
 *
 * POST /api/issues - Receive issue reports from frontend
 * GET /api/issues - Query issues (admin only, future)
 */

import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const router = express.Router();

interface IssueReport {
  timestamp: string;
  traceId?: string;
  sessionId: string;
  route: string;
  userAgent: string;
  description?: string;
}

interface StoredIssue extends IssueReport {
  id: string;
  status: 'pending' | 'triaged' | 'assigned' | 'resolved' | 'wont_fix';
  created: string;
  taskId?: string;
  resolution?: string;
}

class IssueStorage {
  private issuesDirectory: string;

  constructor() {
    this.issuesDirectory = path.join(process.cwd(), 'logs', 'issues');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.issuesDirectory)) {
      fs.mkdirSync(this.issuesDirectory, { recursive: true });
    }
  }

  private getIssueFilePath(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const filename = `${year}-${month}-${day}.jsonl`;
    return path.join(this.issuesDirectory, filename);
  }

  private generateIssueId(): string {
    return `issue-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  storeIssue(report: IssueReport): StoredIssue {
    const issue: StoredIssue = {
      id: this.generateIssueId(),
      ...report,
      status: 'pending',
      created: new Date().toISOString(),
    };

    const filePath = this.getIssueFilePath();
    const line = JSON.stringify(issue) + '\n';

    try {
      fs.appendFileSync(filePath, line, 'utf8');
    } catch (error) {
      console.error('[IssueStorage] Failed to write issue:', error);
      throw error;
    }

    return issue;
  }
}

const issueStorage = new IssueStorage();

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
