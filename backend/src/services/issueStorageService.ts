/**
 * Issue Storage Service
 *
 * Dual persistence: JSONL (source of truth) + SQLite (fast queries)
 * Uses main app-monitor.db database (not separate database)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type Database from 'better-sqlite3';

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
  private db: Database.Database;

  constructor(db: Database.Database, issuesDirectory?: string) {
    this.db = db;
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
    this.writeToJSONL(issue as unknown as Record<string, unknown>);

    // Write to SQLite (fast queries)
    const stmt = this.db.prepare(`
      INSERT INTO issues (
        id, timestamp, sessionId, traceId, route, userAgent,
        description, status, created
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      issue.id,
      issue.timestamp,
      issue.sessionId,
      issue.traceId || null,
      issue.route,
      issue.userAgent,
      issue.description || null,
      issue.status,
      issue.created
    );

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
    const stmt = this.db.prepare(`
      UPDATE issues
      SET status = ?, taskId = ?, resolution = ?, resolved = ?
      WHERE id = ?
    `);

    const resolved = status === 'resolved' ? new Date().toISOString() : null;
    stmt.run(status, taskId || null, resolution || null, resolved, issueId);

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
    const stmt = this.db.prepare(`
      UPDATE issues
      SET errorMessage = ?, component = ?, severity = ?, fingerprint = ?
      WHERE id = ?
    `);

    stmt.run(
      diagnosis.errorMessage || null,
      diagnosis.component || null,
      diagnosis.severity || null,
      diagnosis.fingerprint || null,
      issueId
    );

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
    const stmt = this.db.prepare(`
      SELECT id, timestamp, sessionId, traceId, route, description
      FROM issues
      WHERE status = 'pending'
      ORDER BY created ASC
    `);

    return stmt.all() as Array<{
      id: string;
      timestamp: string;
      sessionId: string;
      traceId?: string;
      route: string;
      description?: string;
    }>;
  }

  /**
   * Check for duplicate by fingerprint
   */
  findDuplicate(fingerprint: string): {
    id: string;
    status: string;
    taskId?: string;
  } | undefined {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);

    const stmt = this.db.prepare(`
      SELECT id, status, taskId
      FROM issues
      WHERE fingerprint = ?
        AND status IN ('pending', 'triaged', 'assigned')
        AND created > ?
      ORDER BY created DESC
      LIMIT 1
    `);

    return stmt.get(fingerprint, cutoff.toISOString()) as {
      id: string;
      status: string;
      taskId?: string;
    } | undefined;
  }

  /**
   * Add occurrence to existing issue
   */
  addOccurrence(issueId: string, timestamp: string, sessionId: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO issue_occurrences (issueId, timestamp, sessionId)
      VALUES (?, ?, ?)
    `);

    stmt.run(issueId, timestamp, sessionId);

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
  getIssueById(issueId: string): StoredIssue | undefined {
    const stmt = this.db.prepare('SELECT * FROM issues WHERE id = ?');
    return stmt.get(issueId) as StoredIssue | undefined;
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
