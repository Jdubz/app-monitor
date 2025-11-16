/**
 * Issue Triage Service
 *
 * Autonomous triage: searches logs, diagnoses issues, creates tasks
 *
 * FIXED: Now uses database queries instead of blocking file I/O
 */

import * as crypto from 'crypto';
import { IssueStorageService } from './issueStorageService.js';
import type { StoredIssue } from './issueStorageService.js';
import type { TaskQueueService, Task } from './taskQueue.sqlite.js';

interface LogEntry {
  id?: string;
  timestamp: string;
  level: string;
  message: string;
  scope?: string;
  traceId?: string;
  sessionId?: string;
  route?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  data?: Record<string, unknown>;
}

interface Diagnosis {
  errorMessage?: string;
  stackTrace?: string;
  component?: string;
  route?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fingerprint: string;
  foundErrors: boolean;
}

export class IssueTriageService {
  private issueStorage: IssueStorageService;
  private taskQueue?: TaskQueueService;

  constructor(issueStorage: IssueStorageService, taskQueue?: TaskQueueService) {
    this.issueStorage = issueStorage;
    this.taskQueue = taskQueue;
  }

  /**
   * Set task queue (for dependency injection)
   */
  setTaskQueue(taskQueue: TaskQueueService): void {
    this.taskQueue = taskQueue;
  }

  /**
   * Main triage loop - process all pending issues
   *
   * Note: ALL user-reported issues create tasks, even if no errors found in logs.
   * UI bugs (broken layouts, wrong behavior) are just as important as errors.
   */
  async triagePendingIssues(): Promise<{
    processed: number;
    tasksCreated: number;
    duplicates: number;
  }> {
    const pending = this.issueStorage.getPendingIssues();

    let tasksCreated = 0;
    let duplicates = 0;

    for (const issue of pending) {
      try {
        const diagnosis = await this.diagnoseIssue(issue);

        // Add diagnosis info
        this.issueStorage.addDiagnosis(issue.id, {
          errorMessage: diagnosis.errorMessage,
          component: diagnosis.component,
          severity: diagnosis.severity,
          fingerprint: diagnosis.fingerprint,
        });

        // Check for duplicates (exclude current issue)
        const duplicate = this.issueStorage.findDuplicate(diagnosis.fingerprint, issue.id);
        if (duplicate) {
          // Link to existing issue
          this.issueStorage.addOccurrence(duplicate.id, issue.timestamp, issue.sessionId);
          this.issueStorage.updateIssueStatus(
            issue.id,
            'wont_fix',
            undefined,
            `Duplicate of ${duplicate.id}`
          );
          duplicates++;
          continue;
        }

        // ALWAYS create bugfix task - user reports are valid even without errors in logs
        const task = await this.createBugfixTask(issue as StoredIssue, diagnosis);

        if (task) {
          // Mark as assigned with task ID
          this.issueStorage.updateIssueStatus(issue.id, 'assigned', task.id);
          tasksCreated++;
        } else {
          // Mark as triaged if task creation failed
          this.issueStorage.updateIssueStatus(issue.id, 'triaged');
        }

      } catch (error) {
        console.error('[IssueTriage] Error processing issue:', issue.id, error);
      }
    }

    return {
      processed: pending.length,
      tasksCreated,
      duplicates,
    };
  }

  /**
   * Diagnose an issue by searching logs
   *
   * Gathers diagnostic information to help developers fix the issue.
   * Does NOT filter out issues - all user reports are valid bugs.
   */
  private async diagnoseIssue(issue: {
    id: string;
    timestamp: string;
    sessionId: string;
    traceId?: string;
    route: string;
    description?: string;
  }): Promise<Diagnosis> {
    // 1. Search logs around timestamp (±5 minutes)
    const logs = await this.searchLogsByTimeRange(
      issue.timestamp,
      -5 * 60 * 1000, // -5 minutes
      +5 * 60 * 1000  // +5 minutes
    );

    // 2. Filter by session ID or trace ID
    const relevantLogs = issue.traceId
      ? logs.filter(log => log.traceId === issue.traceId)
      : logs.filter(log => log.sessionId === issue.sessionId);

    // 3. Find errors (if any exist)
    const errors = relevantLogs.filter(log => log.level === 'error' || log.level === 'fatal');

    // If we found errors in logs, extract details
    if (errors.length > 0) {
      const primaryError = errors[0];
      const errorMessage = primaryError.error?.message || primaryError.message;
      const stackTrace = primaryError.error?.stack;
      const component = primaryError.scope || this.extractComponentFromStack(stackTrace);
      const severity = this.calculateSeverity(errors, relevantLogs);
      const fingerprint = this.generateFingerprint(errorMessage, component, issue.route);

      return {
        errorMessage,
        stackTrace,
        component,
        route: issue.route,
        severity,
        fingerprint,
        foundErrors: true,
      };
    }

    // No errors in logs - might be UI bug, incorrect behavior, etc.
    // Still create a task, but with generic fingerprint based on route + description
    const component = this.extractComponentFromRoute(issue.route);
    const fingerprint = this.generateFingerprint(
      issue.description || 'User-reported issue',
      component,
      issue.route
    );

    return {
      errorMessage: issue.description || 'User reported issue (no error logs found)',
      component,
      route: issue.route,
      severity: 'medium', // Default severity for non-error issues
      fingerprint,
      foundErrors: false,
    };
  }

  /**
   * Search logs by time range using database query (fast, non-blocking)
   *
   * FIXED: Replaced blocking fs.readFileSync() with SQLite query.
   * Logs are now stored in frontend_logs table for instant querying.
   */
  private async searchLogsByTimeRange(
    timestamp: string,
    beforeMs: number,
    afterMs: number
  ): Promise<LogEntry[]> {
    const issueTime = new Date(timestamp);
    const startTime = new Date(issueTime.getTime() + beforeMs);
    const endTime = new Date(issueTime.getTime() + afterMs);

    // Query database for logs in time range (indexed, fast)
    const db = this.issueStorage.getDatabase();
    const stmt = db.prepare(`
      SELECT
        id, timestamp, level, message, scope, traceId, sessionId, route,
        errorName, errorMessage, errorStack, data
      FROM frontend_logs
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(startTime.toISOString(), endTime.toISOString()) as Array<{
      id: string;
      timestamp: string;
      level: string;
      message: string;
      scope: string | null;
      traceId: string | null;
      sessionId: string;
      route: string | null;
      errorName: string | null;
      errorMessage: string | null;
      errorStack: string | null;
      data: string | null;
    }>;

    // Convert database rows to LogEntry format
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      level: row.level,
      message: row.message,
      scope: row.scope || undefined,
      traceId: row.traceId || undefined,
      sessionId: row.sessionId,
      route: row.route || undefined,
      error: row.errorName ? {
        name: row.errorName,
        message: row.errorMessage || '',
        stack: row.errorStack || undefined,
      } : undefined,
      data: row.data ? JSON.parse(row.data) : undefined,
    })) as LogEntry[];
  }


  /**
   * Extract component name from stack trace
   */
  private extractComponentFromStack(stack?: string): string {
    if (!stack) {
      return 'Unknown';
    }

    // Look for React component names or file paths
    const componentMatch = stack.match(/at (\w+)/);
    if (componentMatch) {
      return componentMatch[1];
    }

    const fileMatch = stack.match(/\/([^/]+)\.(tsx?|jsx?):/);
    if (fileMatch) {
      return fileMatch[1];
    }

    return 'Unknown';
  }

  /**
   * Extract component name from route path
   */
  private extractComponentFromRoute(route: string): string {
    // Remove query params and hash
    const cleanRoute = route.split('?')[0].split('#')[0];

    // Get the last segment of the path
    const segments = cleanRoute.split('/').filter(s => s.length > 0);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      // Capitalize first letter to make it look like a component name
      return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
    }

    return 'HomePage'; // Default for root route
  }

  /**
   * Calculate issue severity
   */
  private calculateSeverity(
    errors: LogEntry[],
    allLogs: LogEntry[]
  ): 'low' | 'medium' | 'high' | 'critical' {
    const errorCount = errors.length;
    const fatalErrors = errors.filter(e => e.level === 'fatal');

    // Critical: fatal errors or many errors
    if (fatalErrors.length > 0 || errorCount > 5) {
      return 'critical';
    }

    // High: multiple errors
    if (errorCount > 2) {
      return 'high';
    }

    // Medium: single error with context
    if (errorCount > 0 && allLogs.length > 5) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Generate fingerprint for deduplication
   */
  private generateFingerprint(
    errorMessage: string,
    component: string,
    route: string
  ): string {
    const data = `${errorMessage}:${component}:${route}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Create a bugfix task in the task queue
   */
  private async createBugfixTask(
    issue: StoredIssue,
    diagnosis: Diagnosis
  ): Promise<Task | null> {
    if (!this.taskQueue) {
      console.error('[IssueTriage] Task queue not available');
      return null;
    }

    const description = this.generateTaskDescription(issue, diagnosis);
    const priority = this.getPriorityFromSeverity(diagnosis.severity);

    try {
      const task = this.taskQueue.createTask({
        type: 'bugfix',
        title: `Fix: ${diagnosis.errorMessage?.substring(0, 80) || 'Frontend error'}`,
        description,
        priority,
        acceptance_criteria: [
          'Error no longer occurs when reproducing user steps',
          'Fix includes test to prevent regression',
          'PR passes all quality gates',
        ],
      });

      console.log('[IssueTriage] Created bugfix task:', {
        taskId: task.id,
        issueId: issue.id,
        severity: diagnosis.severity,
        priority,
      });

      return task;
    } catch (error) {
      console.error('[IssueTriage] Failed to create task:', error);
      return null;
    }
  }

  /**
   * Convert severity to priority
   */
  private getPriorityFromSeverity(severity?: string): number {
    switch (severity) {
      case 'critical':
        return 10;
      case 'high':
        return 7;
      case 'medium':
        return 5;
      case 'low':
        return 3;
      default:
        return 5;
    }
  }

  /**
   * Generate task description for dev-bot
   */
  private generateTaskDescription(
    issue: StoredIssue,
    diagnosis: Diagnosis
  ): string {
    const hasErrors = diagnosis.foundErrors;

    return `Fix ${hasErrors ? 'frontend error' : 'frontend issue'} reported by user

**Issue Report:**
- ID: ${issue.id}
- Timestamp: ${issue.timestamp}
- Route: ${issue.route}
- User Description: ${issue.description || 'None provided'}
- Screenshot: ${issue.screenshot ? 'Attached (see database)' : 'None'}

**Automated Diagnosis:**
- ${hasErrors ? 'Error' : 'Issue'}: ${diagnosis.errorMessage}
- Component: ${diagnosis.component}
- Severity: ${diagnosis.severity}
- Trace ID: ${issue.traceId || 'N/A'}
- Errors Found in Logs: ${hasErrors ? 'Yes' : 'No - may be UI/UX bug'}

**Investigation Steps:**
1. Query issue details (including screenshot if available):
   \`\`\`sql
   SELECT id, description, screenshot, screenshot_error, meta
   FROM issues WHERE id = '${issue.id}';
   \`\`\`
2. Query frontend logs from database:
   \`\`\`sql
   SELECT * FROM frontend_logs
   WHERE sessionId = '${issue.sessionId}'
   ${issue.traceId ? `OR traceId = '${issue.traceId}'` : ''}
   ORDER BY timestamp DESC;
   \`\`\`
3. ${hasErrors ? 'Examine error stack trace (see below)' : 'Review user description and reproduce the issue'}
4. Reproduce by navigating to route: ${issue.route}
5. ${hasErrors ? 'Fix the error' : 'Fix the UI/behavior issue'}
6. Add test to prevent regression

${hasErrors ? `**Error Stack Trace:**
\`\`\`
${diagnosis.stackTrace || 'Not available'}
\`\`\`
` : `**Note:**
No error logs found for this issue. This may be a UI/UX bug that doesn't throw errors:
- Incorrect layout or styling
- Wrong data displayed
- Unexpected behavior
- Performance issue
- Accessibility problem

Focus on reproducing the issue based on the user's description and the route they were on.
`}
**Context:**
- Session ID: ${issue.sessionId}
- Trace ID: ${issue.traceId || 'N/A'}
- Screenshot available in \`issues\` table (base64 data URL, can be viewed in browser)
- Console logs available in \`frontend_logs\` table (query by sessionId or traceId)
- Network requests logged in \`frontend_logs\` table (correlate by trace_id)
- All frontend activity for this session can be queried from the database
`;
  }
}
