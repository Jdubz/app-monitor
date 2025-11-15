/**
 * Issues Database Connection
 *
 * SQLite database for fast issue queries and triage automation.
 * Complements JSONL storage (which is append-only source of truth).
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export class IssuesDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'issues.db');
    this.ensureDirectory();
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrency
    this.runMigrations();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private runMigrations(): void {
    const migrationPath = path.join(__dirname, 'migrations', '001_create_issues_table.sql');

    if (fs.existsSync(migrationPath)) {
      const migration = fs.readFileSync(migrationPath, 'utf8');
      this.db.exec(migration);
    } else {
      // Fallback: create tables inline if migration file not found
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS issues (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          sessionId TEXT,
          traceId TEXT,
          route TEXT,
          userAgent TEXT,
          description TEXT,
          status TEXT DEFAULT 'pending',
          taskId TEXT,
          fingerprint TEXT,
          severity TEXT,
          errorMessage TEXT,
          component TEXT,
          created TEXT NOT NULL,
          resolved TEXT,
          resolution TEXT,
          prNumber INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_status ON issues(status);
        CREATE INDEX IF NOT EXISTS idx_trace ON issues(traceId);
        CREATE INDEX IF NOT EXISTS idx_timestamp ON issues(timestamp);
        CREATE INDEX IF NOT EXISTS idx_fingerprint ON issues(fingerprint);
        CREATE INDEX IF NOT EXISTS idx_created ON issues(created);

        CREATE TABLE IF NOT EXISTS issue_occurrences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          issueId TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          sessionId TEXT,
          FOREIGN KEY (issueId) REFERENCES issues(id)
        );

        CREATE INDEX IF NOT EXISTS idx_occurrence_issue ON issue_occurrences(issueId);
        CREATE INDEX IF NOT EXISTS idx_occurrence_timestamp ON issue_occurrences(timestamp);
      `);
    }
  }

  /**
   * Insert a new issue
   */
  insertIssue(issue: {
    id: string;
    timestamp: string;
    sessionId: string;
    traceId?: string;
    route: string;
    userAgent: string;
    description?: string;
    status: string;
    created: string;
    fingerprint?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO issues (
        id, timestamp, sessionId, traceId, route, userAgent,
        description, status, created, fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      issue.fingerprint || null
    );
  }

  /**
   * Update issue status
   */
  updateIssueStatus(
    issueId: string,
    status: string,
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
   * Add diagnosis information to issue
   */
  updateIssueDiagnosis(
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
   * Get pending issues for triage
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
   * Check for duplicate issues by fingerprint
   */
  findDuplicateIssue(fingerprint: string, withinHours: number = 24): {
    id: string;
    status: string;
    taskId?: string;
  } | null {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - withinHours);

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
   * Add issue occurrence for deduplication tracking
   */
  addIssueOccurrence(issueId: string, timestamp: string, sessionId: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO issue_occurrences (issueId, timestamp, sessionId)
      VALUES (?, ?, ?)
    `);

    stmt.run(issueId, timestamp, sessionId);
  }

  /**
   * Get issue by ID
   */
  getIssueById(issueId: string): Record<string, unknown> | undefined {
    const stmt = this.db.prepare('SELECT * FROM issues WHERE id = ?');
    return stmt.get(issueId) as Record<string, unknown> | undefined;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Export singleton instance
let dbInstance: IssuesDatabase | null = null;

export function getIssuesDb(): IssuesDatabase {
  if (!dbInstance) {
    dbInstance = new IssuesDatabase();
  }
  return dbInstance;
}
