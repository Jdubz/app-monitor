/**
 * Issue Storage Service
 *
 * Dual persistence: JSONL (source of truth) + SQLite (fast queries)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getIssuesDb } from '../db/issuesDb.js';

export interface IssueReport {
  timestamp: string;
  traceId?: string;
  sessionId: string;
  route: string;
  userAgent: string;
  description?: string;
}

export interface StoredIssue extends IssueReport {
  id: string;
  status: 'pending' | 'triaged' | 'assigned' | 'resolved' | 'wont_fix';
  created: string;
  taskId?: string;
  resolution?: string;
  fingerprint?: string;
  errorMessage?: string;
  component?: string;
  severity?: string;
  prNumber?: number;
}

export class IssueStorageService {
  private issuesDirectory: string;
  private db = getIssuesDb();

  constructor(issuesDirectory?: string) {
    this.issuesDirectory = issuesDirectory || path.join(process.cwd(), 'logs', 'issues');
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

  /**
   * Store a new issue report
   */
  storeIssue(report: IssueReport): StoredIssue {
    const issue: StoredIssue = {
      id: this.generateIssueId(),
      ...report,
      status: 'pending',
      created: new Date().toISOString(),
    };

    // Write to JSONL (source of truth)
    this.writeToJSONL(issue);

    // Write to SQLite (fast queries)
    this.db.insertIssue({
      id: issue.id,
      timestamp: issue.timestamp,
      sessionId: issue.sessionId,
      traceId: issue.traceId,
      route: issue.route,
      userAgent: issue.userAgent,
      description: issue.description,
      status: issue.status,
      created: issue.created,
    });

    return issue;
  }

  /**
   * Update issue status
   */
  updateIssueStatus(
    issueId: string,
    status: StoredIssue['status'],
    taskId?: string,
    resolution?: string
  ): void {
    // Update SQLite
    this.db.updateIssueStatus(issueId, status, taskId, resolution);

    // Append update to JSONL
    const update = {
      type: 'status_update',
      issueId,
      status,
      taskId,
      resolution,
      timestamp: new Date().toISOString(),
    };
    this.writeToJSONL(update);
  }

  /**
   * Add diagnosis information
   */
  addDiagnosis(
    issueId: string,
    diagnosis: {
      errorMessage?: string;
      component?: string;
      severity?: string;
      fingerprint?: string;
    }
  ): void {
    // Update SQLite
    this.db.updateIssueDiagnosis(issueId, diagnosis);

    // Append diagnosis to JSONL
    const record = {
      type: 'diagnosis',
      issueId,
      ...diagnosis,
      timestamp: new Date().toISOString(),
    };
    this.writeToJSONL(record);
  }

  /**
   * Get pending issues
   */
  getPendingIssues(): Array<{
    id: string;
    timestamp: string;
    sessionId: string;
    traceId?: string;
    route: string;
    description?: string;
  }> {
    return this.db.getPendingIssues();
  }

  /**
   * Check for duplicate by fingerprint
   */
  findDuplicate(fingerprint: string): {
    id: string;
    status: string;
    taskId?: string;
  } | null {
    return this.db.findDuplicateIssue(fingerprint, 24);
  }

  /**
   * Add occurrence to existing issue
   */
  addOccurrence(issueId: string, timestamp: string, sessionId: string): void {
    this.db.addIssueOccurrence(issueId, timestamp, sessionId);

    const occurrence = {
      type: 'occurrence',
      issueId,
      timestamp,
      sessionId,
      recorded: new Date().toISOString(),
    };
    this.writeToJSONL(occurrence);
  }

  /**
   * Get issue by ID
   */
  getIssueById(issueId: string): StoredIssue | null {
    return this.db.getIssueById(issueId);
  }

  /**
   * Write to JSONL file
   */
  private writeToJSONL(entry: Record<string, unknown>): void {
    const filePath = this.getIssueFilePath();
    const line = JSON.stringify(entry) + '\n';

    try {
      fs.appendFileSync(filePath, line, 'utf8');
    } catch (error) {
      console.error('[IssueStorage] Failed to write to JSONL:', error);
      // Don't throw - we don't want storage failures to break the API
    }
  }
}
