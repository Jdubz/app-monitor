/**
 * Issue Storage Service
 *
 * SQLite-only persistence (source of truth for all queries)
 * Uses main app-monitor.db database (not separate database)
 *
 * FIXED: Removed dual persistence antipattern
 */

import * as crypto from 'crypto';
import type Database from 'better-sqlite3';

export interface IssueReport {
  timestamp: string;
  traceId?: string;
  sessionId: string;
  route: string;
  userAgent: string;
  description?: string;
  screenshot?: string | null;
  screenshotError?: string;
  meta?: Record<string, unknown>;
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
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private generateIssueId(): string {
    return `issue-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Store a new issue report
   *
   * FIXED: SQLite only (removed dual persistence)
   */
  storeIssue(report: IssueReport): StoredIssue {
    const issue: StoredIssue = {
      id: this.generateIssueId(),
      ...report,
      status: 'pending',
      created: new Date().toISOString(),
    };

    // Write to SQLite (single source of truth)
    const stmt = this.db.prepare(`
      INSERT INTO issues (
        id, timestamp, sessionId, traceId, route, userAgent,
        description, status, created, screenshot, screenshot_error, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      issue.created,
      issue.screenshot || null,
      issue.screenshotError || null,
      issue.meta ? JSON.stringify(issue.meta) : null
    );

    return issue;
  }

  /**
   * Update issue status
   *
   * FIXED: SQLite only (removed dual persistence)
   */
  updateIssueStatus(
    issueId: string,
    status: StoredIssue['status'],
    taskId?: string,
    resolution?: string
  ): void {
    const stmt = this.db.prepare(`
      UPDATE issues
      SET status = ?, taskId = ?, resolution = ?, resolved = ?
      WHERE id = ?
    `);

    const resolved = status === 'resolved' ? new Date().toISOString() : null;
    stmt.run(status, taskId || null, resolution || null, resolved, issueId);
  }

  /**
   * Add diagnosis information
   *
   * FIXED: SQLite only (removed dual persistence)
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
  findDuplicate(fingerprint: string, excludeIssueId?: string): {
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
        ${excludeIssueId ? 'AND id != ?' : ''}
      ORDER BY created DESC
      LIMIT 1
    `);

    const params = excludeIssueId
      ? [fingerprint, cutoff.toISOString(), excludeIssueId]
      : [fingerprint, cutoff.toISOString()];

    return stmt.get(...params) as {
      id: string;
      status: string;
      taskId?: string;
    } | undefined;
  }

  /**
   * Add occurrence to existing issue
   *
   * FIXED: SQLite only (removed dual persistence)
   */
  addOccurrence(issueId: string, timestamp: string, sessionId: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO issue_occurrences (issueId, timestamp, sessionId)
      VALUES (?, ?, ?)
    `);

    stmt.run(issueId, timestamp, sessionId);
  }

  /**
   * Get issue by ID
   */
  getIssueById(issueId: string): StoredIssue | undefined {
    const stmt = this.db.prepare('SELECT * FROM issues WHERE id = ?');
    return stmt.get(issueId) as StoredIssue | undefined;
  }

  /**
   * Get database instance (for internal queries)
   */
  getDatabase(): Database.Database {
    return this.db;
  }
}
