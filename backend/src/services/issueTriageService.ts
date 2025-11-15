/**
 * Issue Triage Service
 *
 * Autonomous triage: searches logs, diagnoses issues, creates tasks
 */

import * as fs from 'fs';
import * as path from 'path';
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
  shouldCreateTask: boolean;
  reason?: string;
  errorMessage?: string;
  stackTrace?: string;
  component?: string;
  route?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  fingerprint?: string;
}

export class IssueTriageService {
  private issueStorage: IssueStorageService;
  private logsDirectory: string;
  private taskQueue?: TaskQueueService;

  constructor(issueStorage: IssueStorageService, logsDirectory?: string, taskQueue?: TaskQueueService) {
    this.issueStorage = issueStorage;
    this.logsDirectory = logsDirectory || path.join(process.cwd(), 'logs', 'frontend');
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
   */
  async triagePendingIssues(): Promise<{
    processed: number;
    tasksCreated: number;
    duplicates: number;
    wontFix: number;
  }> {
    const pending = this.issueStorage.getPendingIssues();

    let tasksCreated = 0;
    let duplicates = 0;
    let wontFix = 0;

    for (const issue of pending) {
      try {
        const diagnosis = await this.diagnoseIssue(issue);

        if (!diagnosis.shouldCreateTask) {
          // Mark as won't fix
          this.issueStorage.updateIssueStatus(issue.id, 'wont_fix', undefined, diagnosis.reason);
          wontFix++;
          continue;
        }

        // Add diagnosis info
        if (diagnosis.fingerprint) {
          this.issueStorage.addDiagnosis(issue.id, {
            errorMessage: diagnosis.errorMessage,
            component: diagnosis.component,
            severity: diagnosis.severity,
            fingerprint: diagnosis.fingerprint,
          });

          // Check for duplicates
          const duplicate = this.issueStorage.findDuplicate(diagnosis.fingerprint);
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
        }

        // Create bugfix task
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
      wontFix,
    };
  }

  /**
   * Diagnose an issue by searching logs
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

    // 3. Find errors
    const errors = relevantLogs.filter(log => log.level === 'error' || log.level === 'fatal');

    if (errors.length === 0) {
      return {
        shouldCreateTask: false,
        reason: 'No errors found in logs around reported timestamp',
      };
    }

    // 4. Extract primary error
    const primaryError = errors[0];
    const errorMessage = primaryError.error?.message || primaryError.message;
    const stackTrace = primaryError.error?.stack;
    const component = primaryError.scope || this.extractComponentFromStack(stackTrace);

    // 5. Calculate severity
    const severity = this.calculateSeverity(errors, relevantLogs);

    // 6. Generate fingerprint
    const fingerprint = this.generateFingerprint(errorMessage, component, issue.route);

    return {
      shouldCreateTask: true,
      errorMessage,
      stackTrace,
      component,
      route: issue.route,
      severity,
      fingerprint,
    };
  }

  /**
   * Search logs by time range
   */
  private async searchLogsByTimeRange(
    timestamp: string,
    beforeMs: number,
    afterMs: number
  ): Promise<LogEntry[]> {
    const issueTime = new Date(timestamp);
    const startTime = new Date(issueTime.getTime() + beforeMs);
    const endTime = new Date(issueTime.getTime() + afterMs);

    const logs: LogEntry[] = [];

    // Get log files for the date range
    const logFiles = this.getLogFilesForDateRange(startTime, endTime);

    for (const filePath of logFiles) {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as LogEntry;

          // Skip session_start entries
          if ((entry as any).type === 'session_start') {
            continue;
          }

          const entryTime = new Date(entry.timestamp);

          if (entryTime >= startTime && entryTime <= endTime) {
            logs.push(entry);
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    return logs.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Get log files for date range
   */
  private getLogFilesForDateRange(startDate: Date, endDate: Date): string[] {
    const files: string[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const filename = `${year}-${month}-${day}.jsonl`;
      const filePath = path.join(this.logsDirectory, filename);

      files.push(filePath);
      current.setDate(current.getDate() + 1);
    }

    return files;
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
    return `Fix frontend error reported by user

**Issue Report:**
- ID: ${issue.id}
- Timestamp: ${issue.timestamp}
- Route: ${issue.route}
- User Description: ${issue.description || 'None provided'}

**Automated Diagnosis:**
- Error: ${diagnosis.errorMessage}
- Component: ${diagnosis.component}
- Severity: ${diagnosis.severity}
- Trace ID: ${issue.traceId || 'N/A'}

**Investigation:**
1. Search logs for trace ID: \`grep "${issue.traceId}" logs/frontend/*.jsonl\`
2. Examine error stack trace (see below)
3. Reproduce by navigating to route: ${issue.route}
4. Fix the error
5. Add test to prevent regression

**Error Stack Trace:**
\`\`\`
${diagnosis.stackTrace || 'Not available'}
\`\`\`

**Relevant Log Entries:**
Search window: ${issue.timestamp} ±5 minutes
Session ID: ${issue.sessionId}
Trace ID: ${issue.traceId || 'N/A'}
`;
  }
}
