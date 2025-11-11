# Bug Report System Implementation Plan

**Date**: 2025-11-11
**Status**: Design Phase
**Target**: Seamless integration with existing task queue and dev-bot system

---

## Executive Summary

This document outlines the design and implementation plan for an automated bug report system inspired by the Imagineer project but adapted for the app-monitor backend architecture. The system will automatically capture comprehensive diagnostic information when errors occur, deduplicate bug reports via fingerprinting, and seamlessly integrate with our existing task queue to spawn fix tasks.

### Key Design Principles

1. **Automatic Bug Capture**: Errors trigger bug reports automatically at multiple integration points
2. **SQLite Storage**: Use existing SQLite database with new tables (not JSON files)
3. **Task Queue Integration**: Bug reports automatically spawn fix tasks in our existing queue
4. **Deduplication**: Fingerprinting prevents duplicate bug reports for recurring issues
5. **Rich Context**: Capture execution history, logs, artifacts, and environment data
6. **Zero Disruption**: Seamlessly integrate with existing error handling without breaking changes

---

## Part 1: System Analysis

### 1.1 Imagineer Bug Report System (Reference Implementation)

The Imagineer project provides a production-ready bug report system with these key features:

#### **Data Structure**
- **Core Fields**: id, title, description, severity, status, category
- **Context Capture**: environment, client metadata, application state, recent logs, network events
- **Visual Data**: Screenshot capture with annotation support
- **Resolution Tracking**: fix commit SHA, resolution notes, verification status
- **Audit Trail**: Full event history with actor tracking

#### **Storage Architecture**
- **Database**: SQLite with indexed queries
- **Tables**: `bug_reports` (main), `bug_report_events` (audit trail)
- **Files**: Screenshots stored separately in configured storage path
- **Retention**: Configurable automatic cleanup (default 30 days)

#### **Lifecycle Management**
```
open → in_progress → resolved
  ↓         ↓
  ↓     wont_fix
duplicate
```

#### **Automated Remediation**
- AI-powered agents running in Docker containers
- Analyzes bug, implements fix, runs tests, pushes to Git
- Cross-process locking for single-worker concurrency
- Session summary JSON with test results

#### **Key Strengths**
✅ Comprehensive context capture (11 categories of diagnostic data)
✅ Database-backed with ACID transactions
✅ Automated fix attempts with verification
✅ Multi-interface access (API, CLI, UI)
✅ Built-in deduplication via fingerprinting

#### **Not Applicable to App-Monitor**
❌ Frontend-specific (browser metadata, screenshots, React context)
❌ Separate AI agent system (we already have dev-bot task queue)
❌ User-submitted reports (we focus on automatic system errors)

### 1.2 App-Monitor Current Architecture Analysis

Our backend provides a sophisticated task execution system with natural integration points:

#### **Task Queue Architecture**
- **Database**: SQLite at `data/dev-bots.db`
- **Core Table**: `tasks` with 50+ fields including error tracking
- **Execution Tracking**: `task_executions`, `task_automation_runs`
- **Rich Context**: Commands, file operations, git operations, artifacts
- **Quality System**: Observations, improvement tasks, patterns

#### **Error Detection Points**

| Integration Point | Location | Trigger | Available Context |
|-------------------|----------|---------|-------------------|
| **Task Failures** | `taskQueue.sqlite.ts:1017` | Exit code != 0 | Task metadata, error message, execution history |
| **Quality Gate Failures** | `taskCompletion.service.ts:368` | Lint/test/build fail | Gate results, scores, workspace path |
| **Verification Failures** | `taskCompletion.service.ts:94-106` | Criteria not met | Acceptance criteria, test coverage, scope violations |
| **Worker Crashes** | `taskQueue.sqlite.ts:1122` | Heartbeat timeout | Worker ID, last heartbeat, task state |
| **Orphaned Tasks** | `taskQueue.sqlite.ts:1760` | Server restart | Task duration, assigned worker |
| **PR Condition Failures** | `prConditionState.service.ts` | Condition repeatedly fails | PR number, blocking issues, fingerprint |
| **Critical Quality Issues** | `qualityObservation.service.ts` | High severity observation | Improvement opportunities, blockers |

#### **Existing Error Tracking**
- `Task.error` - Primary error message
- `TaskExecution.error` - Execution-specific error
- `task_automation_runs.failure_reason` - Detailed diagnostics
- `task_artifacts` - Logs, patches, session summaries
- Structured logging with category/action/details

#### **Task Spawning Mechanisms**
1. **Manual Creation**: `POST /dev-bots/tasks`
2. **Quality Improvement Generator**: After successful task completion
3. **PR Condition State Service**: 8 merge conditions spawn fix tasks
4. **Review Comment Tracker**: PR review comments spawn tasks
5. **Failure Recovery**: Two-stage cleanup → followup

#### **Current Gaps**
❌ No centralized bug report creation
❌ No bug lifecycle management (open → fixed → verified)
❌ No bug deduplication across tasks
❌ No bug severity tracking
❌ No bug assignment workflow
❌ No bug impact analysis (which tasks affected)
❌ No bug resolution history with verification

---

## Part 2: Bug Report System Design

### 2.1 Database Schema

#### **Migration 010: Bug Reports Foundation**

```sql
-- =============================================================================
-- Bug Reports Table
-- =============================================================================

CREATE TABLE bug_reports (
  -- Identification
  id TEXT PRIMARY KEY,                  -- Format: bug-{category}-{timestamp}-{hash}
  fingerprint TEXT NOT NULL,            -- SHA-256 hash for deduplication
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Classification
  severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
  category TEXT NOT NULL CHECK(category IN (
    'task_failure',           -- Task execution failed
    'quality_gate',           -- Linting/tests/build failed
    'verification',           -- Acceptance criteria not met
    'worker_crash',           -- Container/worker crashed
    'infrastructure',         -- System/environment issue
    'pr_workflow',            -- PR condition/merge issue
    'data_integrity',         -- Database/data corruption
    'performance',            -- Timeout/slowness
    'security'                -- Security vulnerability
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN (
    'open',                   -- New, awaiting triage
    'in_progress',            -- Fix task created and running
    'fixed',                  -- Fix completed, awaiting verification
    'verified',               -- Fix deployed and verified working
    'wont_fix',               -- Intentional behavior or not worth fixing
    'duplicate'               -- Duplicate of another bug
  )),

  -- Entity Links
  task_id TEXT,                         -- Task that triggered bug
  pr_number INTEGER,                    -- Associated PR if applicable
  parent_bug_id TEXT,                   -- For duplicate tracking
  fix_task_id TEXT,                     -- Task created to fix this bug

  -- Error Context
  error_message TEXT,                   -- Primary error message
  error_stack TEXT,                     -- Stack trace if available
  error_type TEXT,                      -- Error class/type
  exit_code INTEGER,                    -- Process exit code

  -- Reproduction & Impact
  reproduction_steps TEXT,              -- JSON array of steps
  affected_files TEXT,                  -- JSON array of file paths
  affected_components TEXT,             -- JSON array of component names
  environment_info TEXT,                -- JSON: OS, Node version, Git SHA, etc.

  -- Occurrence Tracking (for deduplication)
  occurrence_count INTEGER DEFAULT 1,
  first_occurred_at INTEGER NOT NULL,
  last_occurred_at INTEGER NOT NULL,

  -- Resolution
  assigned_to TEXT,                     -- User email or 'dev-bot-agent'
  fix_commit_sha TEXT,                  -- Git commit with fix
  fix_pr_number INTEGER,                -- PR with fix
  resolution_notes TEXT,                -- How it was fixed
  fixed_at INTEGER,
  verified_at INTEGER,

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- Foreign Keys
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_bug_id) REFERENCES bug_reports(id) ON DELETE SET NULL,
  FOREIGN KEY (fix_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE UNIQUE INDEX idx_bug_reports_fingerprint ON bug_reports(fingerprint);
CREATE INDEX idx_bug_reports_status ON bug_reports(status) WHERE status IN ('open', 'in_progress');
CREATE INDEX idx_bug_reports_severity ON bug_reports(severity) WHERE severity IN ('critical', 'high');
CREATE INDEX idx_bug_reports_category ON bug_reports(category);
CREATE INDEX idx_bug_reports_task_id ON bug_reports(task_id);
CREATE INDEX idx_bug_reports_pr_number ON bug_reports(pr_number);
CREATE INDEX idx_bug_reports_created_at ON bug_reports(created_at DESC);
CREATE INDEX idx_bug_reports_last_occurred ON bug_reports(last_occurred_at DESC);

-- =============================================================================
-- Bug Report Attachments (logs, screenshots, artifacts)
-- =============================================================================

CREATE TABLE bug_report_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_report_id TEXT NOT NULL,

  -- Attachment metadata
  type TEXT NOT NULL CHECK(type IN ('log', 'patch', 'artifact', 'screenshot')),
  path TEXT NOT NULL,                   -- Relative to storage root
  size_bytes INTEGER,
  mime_type TEXT,
  description TEXT,

  -- Timestamps
  created_at INTEGER NOT NULL,

  FOREIGN KEY (bug_report_id) REFERENCES bug_reports(id) ON DELETE CASCADE
);

CREATE INDEX idx_bug_attachments_report ON bug_report_attachments(bug_report_id);

-- =============================================================================
-- Bug Report Activity (audit trail)
-- =============================================================================

CREATE TABLE bug_report_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_report_id TEXT NOT NULL,

  -- Activity details
  activity_type TEXT NOT NULL CHECK(activity_type IN (
    'created',                -- Bug report created
    'status_changed',         -- Status transition
    'severity_changed',       -- Severity updated
    'assigned',               -- Assigned to person/agent
    'commented',              -- Comment added
    'linked_task',            -- Task linked (fix task)
    'fixed',                  -- Marked as fixed
    'verified',               -- Marked as verified
    'duplicated',             -- Marked as duplicate
    'reopened',               -- Reopened from fixed/verified
    'occurrence_incremented'  -- Duplicate occurrence detected
  )),

  actor TEXT,                           -- 'system', 'dev-bot-agent', or user email
  old_value TEXT,                       -- Previous state (for changes)
  new_value TEXT,                       -- New state (for changes)
  comment TEXT,                         -- Optional comment/notes
  metadata TEXT,                        -- JSON: additional context

  -- Timestamp
  timestamp INTEGER NOT NULL

  FOREIGN KEY (bug_report_id) REFERENCES bug_reports(id) ON DELETE CASCADE
);

CREATE INDEX idx_bug_activity_report ON bug_report_activity(bug_report_id);
CREATE INDEX idx_bug_activity_timestamp ON bug_report_activity(timestamp DESC);

-- =============================================================================
-- Bug Report Analytics View
-- =============================================================================

CREATE VIEW v_bug_report_summary AS
SELECT
  br.id,
  br.title,
  br.severity,
  br.category,
  br.status,
  br.occurrence_count,
  br.created_at,
  br.last_occurred_at,

  -- Linked entities
  t.type AS task_type,
  t.title AS task_title,
  ft.status AS fix_task_status,

  -- Resolution tracking
  br.assigned_to,
  CASE
    WHEN br.fixed_at IS NOT NULL THEN (br.fixed_at - br.created_at)
    ELSE NULL
  END AS time_to_fix_ms,

  -- Activity counts
  (SELECT COUNT(*) FROM bug_report_activity WHERE bug_report_id = br.id) AS activity_count,
  (SELECT COUNT(*) FROM bug_report_attachments WHERE bug_report_id = br.id) AS attachment_count

FROM bug_reports br
LEFT JOIN tasks t ON br.task_id = t.id
LEFT JOIN tasks ft ON br.fix_task_id = ft.id;

-- =============================================================================
-- Bug Pattern Analysis View (for learning)
-- =============================================================================

CREATE VIEW v_bug_patterns AS
SELECT
  category,
  error_type,
  COUNT(*) AS occurrence_count,
  COUNT(DISTINCT task_id) AS affected_tasks,
  SUM(occurrence_count) AS total_occurrences,
  AVG(CASE WHEN fixed_at IS NOT NULL THEN (fixed_at - created_at) ELSE NULL END) AS avg_fix_time_ms,
  COUNT(CASE WHEN status IN ('fixed', 'verified') THEN 1 END) AS fixed_count,
  COUNT(CASE WHEN status = 'open' THEN 1 END) AS open_count
FROM bug_reports
GROUP BY category, error_type
HAVING occurrence_count > 1
ORDER BY occurrence_count DESC;
```

### 2.2 Data Model (TypeScript)

```typescript
// src/types/bugReport.ts

export type BugSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type BugCategory =
  | 'task_failure'
  | 'quality_gate'
  | 'verification'
  | 'worker_crash'
  | 'infrastructure'
  | 'pr_workflow'
  | 'data_integrity'
  | 'performance'
  | 'security';

export type BugStatus =
  | 'open'
  | 'in_progress'
  | 'fixed'
  | 'verified'
  | 'wont_fix'
  | 'duplicate';

export type BugActivityType =
  | 'created'
  | 'status_changed'
  | 'severity_changed'
  | 'assigned'
  | 'commented'
  | 'linked_task'
  | 'fixed'
  | 'verified'
  | 'duplicated'
  | 'reopened'
  | 'occurrence_incremented';

export interface BugReport {
  // Identification
  id: string;
  fingerprint: string;
  title: string;
  description: string;

  // Classification
  severity: BugSeverity;
  category: BugCategory;
  status: BugStatus;

  // Entity links
  task_id?: string;
  pr_number?: number;
  parent_bug_id?: string;
  fix_task_id?: string;

  // Error context
  error_message?: string;
  error_stack?: string;
  error_type?: string;
  exit_code?: number;

  // Reproduction & impact
  reproduction_steps?: string[];
  affected_files?: string[];
  affected_components?: string[];
  environment_info?: EnvironmentInfo;

  // Occurrence tracking
  occurrence_count: number;
  first_occurred_at: number;
  last_occurred_at: number;

  // Resolution
  assigned_to?: string;
  fix_commit_sha?: string;
  fix_pr_number?: number;
  resolution_notes?: string;
  fixed_at?: number;
  verified_at?: number;

  // Timestamps
  created_at: number;
  updated_at: number;
}

export interface EnvironmentInfo {
  node_version: string;
  os_platform: string;
  os_release: string;
  app_version?: string;
  git_sha?: string;
  git_branch?: string;
  [key: string]: string | undefined;
}

export interface BugReportActivity {
  id: number;
  bug_report_id: string;
  activity_type: BugActivityType;
  actor: string;
  old_value?: string;
  new_value?: string;
  comment?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

export interface BugReportAttachment {
  id: number;
  bug_report_id: string;
  type: 'log' | 'patch' | 'artifact' | 'screenshot';
  path: string;
  size_bytes?: number;
  mime_type?: string;
  description?: string;
  created_at: number;
}

export interface BugReportCreateData {
  category: BugCategory;
  severity: BugSeverity;
  title: string;
  description: string;
  error_message?: string;
  error_stack?: string;
  error_type?: string;
  exit_code?: number;
  task_id?: string;
  pr_number?: number;
  reproduction_steps?: string[];
  affected_files?: string[];
  affected_components?: string[];
  environment_info?: EnvironmentInfo;
}

export interface BugPattern {
  category: BugCategory;
  error_type: string;
  occurrence_count: number;
  affected_tasks: number;
  total_occurrences: number;
  avg_fix_time_ms?: number;
  fixed_count: number;
  open_count: number;
}
```

### 2.3 Service Architecture

```typescript
// src/services/bugReport.service.ts

export class BugReportService {
  private readonly db: DevBotsDatabase;
  private readonly taskQueue: TaskQueueService;

  constructor(taskQueue: TaskQueueService) {
    this.db = getDatabase();
    this.taskQueue = taskQueue;
  }

  // ==========================================================================
  // Core CRUD Operations
  // ==========================================================================

  /**
   * Create a new bug report with automatic deduplication
   */
  async createBugReport(data: BugReportCreateData): Promise<BugReport> {
    const fingerprint = this.generateFingerprint(data);

    // Check for existing bug with same fingerprint
    const existing = await this.findByFingerprint(fingerprint);
    if (existing) {
      // Increment occurrence count instead of creating duplicate
      await this.incrementOccurrence(existing.id);
      return this.getBugReport(existing.id)!;
    }

    // Generate new bug ID
    const id = this.generateBugId(data.category);
    const now = Date.now();

    const bugReport: BugReport = {
      id,
      fingerprint,
      title: data.title,
      description: data.description,
      severity: data.severity,
      category: data.category,
      status: 'open',
      task_id: data.task_id,
      pr_number: data.pr_number,
      error_message: data.error_message,
      error_stack: data.error_stack,
      error_type: data.error_type,
      exit_code: data.exit_code,
      reproduction_steps: data.reproduction_steps,
      affected_files: data.affected_files,
      affected_components: data.affected_components,
      environment_info: data.environment_info,
      occurrence_count: 1,
      first_occurred_at: now,
      last_occurred_at: now,
      created_at: now,
      updated_at: now
    };

    // Insert into database
    this.db.getConnection().prepare(`
      INSERT INTO bug_reports (
        id, fingerprint, title, description, severity, category, status,
        task_id, pr_number, error_message, error_stack, error_type, exit_code,
        reproduction_steps, affected_files, affected_components, environment_info,
        occurrence_count, first_occurred_at, last_occurred_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bugReport.id,
      bugReport.fingerprint,
      bugReport.title,
      bugReport.description,
      bugReport.severity,
      bugReport.category,
      bugReport.status,
      bugReport.task_id || null,
      bugReport.pr_number || null,
      bugReport.error_message || null,
      bugReport.error_stack || null,
      bugReport.error_type || null,
      bugReport.exit_code || null,
      JSON.stringify(bugReport.reproduction_steps || []),
      JSON.stringify(bugReport.affected_files || []),
      JSON.stringify(bugReport.affected_components || []),
      JSON.stringify(bugReport.environment_info || {}),
      bugReport.occurrence_count,
      bugReport.first_occurred_at,
      bugReport.last_occurred_at,
      bugReport.created_at,
      bugReport.updated_at
    );

    // Record creation activity
    await this.addActivity(bugReport.id, {
      activity_type: 'created',
      actor: 'system',
      comment: `Bug report created from ${data.category}`
    });

    logger.info({
      category: 'bug-reports',
      action: 'bug_report_created',
      message: `Created bug report: ${bugReport.id}`,
      details: {
        id: bugReport.id,
        category: bugReport.category,
        severity: bugReport.severity,
        task_id: bugReport.task_id
      }
    });

    return bugReport;
  }

  /**
   * Get bug report by ID
   */
  getBugReport(id: string): BugReport | undefined {
    const row = this.db.getConnection().prepare(`
      SELECT * FROM bug_reports WHERE id = ?
    `).get(id) as any;

    if (!row) return undefined;

    return this.rowToBugReport(row);
  }

  /**
   * Update bug report
   */
  async updateBugReport(id: string, updates: Partial<BugReport>): Promise<BugReport> {
    const existing = this.getBugReport(id);
    if (!existing) {
      throw new Error(`Bug report not found: ${id}`);
    }

    const updatedReport = { ...existing, ...updates, updated_at: Date.now() };

    // Build UPDATE query dynamically based on provided fields
    const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'fingerprint');
    const setClauses = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      const value = (updatedReport as any)[f];
      if (Array.isArray(value)) return JSON.stringify(value);
      if (typeof value === 'object' && value !== null) return JSON.stringify(value);
      return value;
    });

    this.db.getConnection().prepare(`
      UPDATE bug_reports SET ${setClauses}, updated_at = ? WHERE id = ?
    `).run(...values, updatedReport.updated_at, id);

    return updatedReport;
  }

  // ==========================================================================
  // Deduplication & Occurrence Tracking
  // ==========================================================================

  /**
   * Generate fingerprint for bug deduplication
   */
  private generateFingerprint(data: BugReportCreateData): string {
    const components = [
      data.category,
      data.error_type || this.extractErrorType(data.error_message),
      data.task_id ? 'task' : 'system',
      data.affected_files?.slice(0, 3).sort().join(',')
    ].filter(Boolean);

    return crypto
      .createHash('sha256')
      .update(components.join('::'))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Find bug report by fingerprint
   */
  private findByFingerprint(fingerprint: string): BugReport | undefined {
    const row = this.db.getConnection().prepare(`
      SELECT * FROM bug_reports WHERE fingerprint = ? AND status NOT IN ('verified', 'wont_fix')
    `).get(fingerprint) as any;

    return row ? this.rowToBugReport(row) : undefined;
  }

  /**
   * Increment occurrence count for duplicate bug
   */
  private async incrementOccurrence(bugId: string): Promise<void> {
    const now = Date.now();

    this.db.getConnection().prepare(`
      UPDATE bug_reports
      SET occurrence_count = occurrence_count + 1,
          last_occurred_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, bugId);

    await this.addActivity(bugId, {
      activity_type: 'occurrence_incremented',
      actor: 'system',
      comment: 'Duplicate bug detected'
    });

    logger.info({
      category: 'bug-reports',
      action: 'occurrence_incremented',
      message: `Incremented occurrence count for bug ${bugId}`,
      details: { bugId }
    });
  }

  // ==========================================================================
  // Automatic Bug Creation from Error Contexts
  // ==========================================================================

  /**
   * Create bug report from task failure
   */
  async createFromTaskFailure(task: Task, error: string): Promise<BugReport> {
    const severity = this.determineSeverityFromTask(task, error);
    const errorType = this.extractErrorType(error);

    return this.createBugReport({
      category: 'task_failure',
      severity,
      title: `Task failure: ${task.title}`,
      description: `Task ${task.id} (${task.type}) failed with error:\n\n${error}\n\nTask Description:\n${task.description || 'N/A'}`,
      error_message: error.substring(0, 500),
      error_stack: this.extractStackTrace(error),
      error_type: errorType,
      task_id: task.id,
      pr_number: task.pr_number,
      affected_files: task.files,
      environment_info: await this.gatherEnvironmentInfo()
    });
  }

  /**
   * Create bug report from quality gate failure
   */
  async createFromQualityGateFailure(
    task: Task,
    gateResult: QualityValidationResult
  ): Promise<BugReport> {
    const failedGates = gateResult.gates.filter(g => !g.passed);
    const criticalGates = failedGates.filter(g => g.severity === 'critical');

    return this.createBugReport({
      category: 'quality_gate',
      severity: criticalGates.length > 0 ? 'high' : 'medium',
      title: `Quality gate failures in ${task.title}`,
      description: `Task ${task.id} failed ${failedGates.length} quality gate(s):\n\n${
        failedGates.map(g => `- ${g.gate}: ${g.issues.join(', ')}`).join('\n')
      }`,
      error_message: failedGates.map(g => g.gate).join(', ') + ' failed',
      task_id: task.id,
      pr_number: task.pr_number,
      affected_files: task.files,
      affected_components: failedGates.map(g => g.gate),
      environment_info: await this.gatherEnvironmentInfo()
    });
  }

  /**
   * Create bug report from worker crash
   */
  async createFromWorkerCrash(worker: EphemeralWorker, error: Error): Promise<BugReport> {
    return this.createBugReport({
      category: 'worker_crash',
      severity: 'critical',
      title: `Worker crash: ${worker.id}`,
      description: `Worker ${worker.id} crashed while executing task ${worker.current_task_id}:\n\n${error.message}`,
      error_message: error.message,
      error_stack: error.stack,
      error_type: error.name,
      task_id: worker.current_task_id || undefined,
      affected_components: ['docker', 'ephemeral-worker'],
      environment_info: await this.gatherEnvironmentInfo()
    });
  }

  // ==========================================================================
  // Fix Task Generation
  // ==========================================================================

  /**
   * Create a task to fix this bug
   */
  async createFixTask(bugId: string): Promise<Task> {
    const bug = this.getBugReport(bugId);
    if (!bug) {
      throw new Error(`Bug report not found: ${bugId}`);
    }

    if (bug.fix_task_id) {
      // Fix task already exists
      const existingTask = await this.taskQueue.getTask(bug.fix_task_id);
      if (existingTask) {
        return existingTask;
      }
    }

    // Create fix task
    const task = await this.taskQueue.createTask({
      type: 'bug',
      title: `[BUG FIX] ${bug.title}`,
      description: this.buildFixTaskDescription(bug),
      acceptance_criteria: [
        'Root cause identified and documented',
        'Fix implemented and tested',
        'All tests passing',
        'No regressions introduced',
        'Bug verified as resolved'
      ],
      files: bug.affected_files,
      priority: this.severityToPriority(bug.severity),
      pr_branch: bug.pr_number ? `bug-fix-${bugId}` : undefined,
      notes: JSON.stringify({
        bugReportId: bugId,
        originalTaskId: bug.task_id,
        severity: bug.severity,
        category: bug.category
      })
    });

    // Link fix task to bug
    await this.updateBugReport(bugId, {
      fix_task_id: task.id,
      status: 'in_progress',
      assigned_to: 'dev-bot-agent'
    });

    await this.addActivity(bugId, {
      activity_type: 'linked_task',
      actor: 'system',
      new_value: task.id,
      comment: 'Created fix task'
    });

    logger.info({
      category: 'bug-reports',
      action: 'fix_task_created',
      message: `Created fix task ${task.id} for bug ${bugId}`,
      details: { bugId, taskId: task.id }
    });

    return task;
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  async markInProgress(bugId: string, assignee: string): Promise<void> {
    await this.updateBugReport(bugId, { status: 'in_progress', assigned_to: assignee });
    await this.addActivity(bugId, {
      activity_type: 'status_changed',
      actor: assignee,
      old_value: 'open',
      new_value: 'in_progress'
    });
  }

  async markFixed(bugId: string, commitSha: string): Promise<void> {
    await this.updateBugReport(bugId, {
      status: 'fixed',
      fix_commit_sha: commitSha,
      fixed_at: Date.now()
    });
    await this.addActivity(bugId, {
      activity_type: 'fixed',
      actor: 'dev-bot-agent',
      new_value: commitSha
    });
  }

  async markVerified(bugId: string): Promise<void> {
    await this.updateBugReport(bugId, {
      status: 'verified',
      verified_at: Date.now()
    });
    await this.addActivity(bugId, {
      activity_type: 'verified',
      actor: 'system'
    });
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  getOpenBugs(): BugReport[] {
    const rows = this.db.getConnection().prepare(`
      SELECT * FROM bug_reports
      WHERE status IN ('open', 'in_progress')
      ORDER BY severity DESC, created_at DESC
    `).all() as any[];

    return rows.map(r => this.rowToBugReport(r));
  }

  getBugsByTask(taskId: string): BugReport[] {
    const rows = this.db.getConnection().prepare(`
      SELECT * FROM bug_reports WHERE task_id = ?
    `).all(taskId) as any[];

    return rows.map(r => this.rowToBugReport(r));
  }

  getBugPatterns(): BugPattern[] {
    const rows = this.db.getConnection().prepare(`
      SELECT * FROM v_bug_patterns
    `).all() as any[];

    return rows;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private generateBugId(category: BugCategory): string {
    const timestamp = Date.now();
    const hash = crypto.randomBytes(4).toString('hex');
    return `bug-${category}-${timestamp}-${hash}`;
  }

  private determineSeverityFromTask(task: Task, error: string): BugSeverity {
    // Critical: production tasks or security issues
    if (task.priority >= 9 || error.toLowerCase().includes('security')) {
      return 'critical';
    }

    // High: important tasks or blocking errors
    if (task.priority >= 7 || error.toLowerCase().includes('block')) {
      return 'high';
    }

    // Medium: standard tasks
    if (task.priority >= 5) {
      return 'medium';
    }

    // Low: minor tasks
    return 'low';
  }

  private severityToPriority(severity: BugSeverity): number {
    const map: Record<BugSeverity, number> = {
      critical: 10,
      high: 8,
      medium: 6,
      low: 4,
      info: 2
    };
    return map[severity];
  }

  private async gatherEnvironmentInfo(): Promise<EnvironmentInfo> {
    return {
      node_version: process.version,
      os_platform: process.platform,
      os_release: require('os').release(),
      git_branch: await this.getCurrentGitBranch(),
      git_sha: await this.getCurrentGitSHA()
    };
  }

  private async addActivity(bugId: string, activity: {
    activity_type: BugActivityType;
    actor: string;
    old_value?: string;
    new_value?: string;
    comment?: string;
  }): Promise<void> {
    this.db.getConnection().prepare(`
      INSERT INTO bug_report_activity (
        bug_report_id, activity_type, actor, old_value, new_value, comment, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      bugId,
      activity.activity_type,
      activity.actor,
      activity.old_value || null,
      activity.new_value || null,
      activity.comment || null,
      Date.now()
    );
  }

  private rowToBugReport(row: any): BugReport {
    return {
      ...row,
      reproduction_steps: row.reproduction_steps ? JSON.parse(row.reproduction_steps) : undefined,
      affected_files: row.affected_files ? JSON.parse(row.affected_files) : undefined,
      affected_components: row.affected_components ? JSON.parse(row.affected_components) : undefined,
      environment_info: row.environment_info ? JSON.parse(row.environment_info) : undefined
    };
  }
}
```

---

## Part 3: Integration Implementation

### 3.1 Integration Points

#### **Integration 1: Task Failure Handler**

**Location**: `src/services/taskQueue.sqlite.ts:1017`

```typescript
// BEFORE: Just logging
logger.info({
  category: 'process',
  action: 'task_failed',
  message: `Task ${taskId} failed: ${error}`,
  details: { taskId, error, retryCount, willEnterRecovery }
});

// AFTER: Create bug report for critical/high priority task failures
logger.info({
  category: 'process',
  action: 'task_failed',
  message: `Task ${taskId} failed: ${error}`,
  details: { taskId, error, retryCount, willEnterRecovery }
});

// Create bug report if this is a critical failure
const task = this.getTask(taskId);
if (task && shouldCreateBugReport(task, error)) {
  const bugReportService = getBugReportService();
  await bugReportService.createFromTaskFailure(task, error);
}

function shouldCreateBugReport(task: Task, error: string): boolean {
  // Don't create bugs for expected retry scenarios
  if (task.retry_count < task.max_retries) return false;

  // Don't create bugs for repair bots (they're already handling another bug)
  if (task.is_repair_bot) return false;

  // Create bugs for high priority tasks
  if (task.priority >= 7) return true;

  // Create bugs for specific error patterns
  const criticalPatterns = [
    /cannot find module/i,
    /undefined is not a function/i,
    /permission denied/i,
    /ENOENT/i,
    /EACCES/i
  ];

  return criticalPatterns.some(pattern => pattern.test(error));
}
```

#### **Integration 2: Quality Gate Failures**

**Location**: `src/services/taskCompletion.service.ts:368`

```typescript
// If quality gates failed, log warning
if (!validationResult.passed) {
  logger.warn({
    category: 'quality-gates',
    action: 'validation_failed',
    message: `Quality gates failed for task ${task.id}`,
    details: {
      failedGates: validationResult.gates.filter(g => !g.passed).map(g => g.gate)
    }
  });

  // NEW: Create bug report for critical gate failures
  const criticalGates = validationResult.gates.filter(g =>
    !g.passed && g.severity === 'critical'
  );

  if (criticalGates.length > 0) {
    const bugReportService = getBugReportService();
    await bugReportService.createFromQualityGateFailure(task, validationResult);
  }
}
```

#### **Integration 3: Worker Crashes**

**Location**: `src/services/taskQueue.sqlite.ts:1122`

```typescript
logger.warn({
  category: 'process',
  action: 'stalled_worker_detected',
  message: `Worker ${worker.id} stalled, marked task ${worker.current_task_id} as failed`
});

// NEW: Create infrastructure bug report for worker crashes
const bugReportService = getBugReportService();
await bugReportService.createFromWorkerCrash(
  worker,
  new Error('Worker heartbeat timeout - container may have crashed')
);
```

#### **Integration 4: Automatic Fix Task Creation**

**Location**: New webhook handler or scheduled job

```typescript
// Automatically create fix tasks for open bugs every hour
async function processOpenBugs(): Promise<void> {
  const bugReportService = getBugReportService();
  const openBugs = bugReportService.getOpenBugs();

  for (const bug of openBugs) {
    // Skip if already has fix task
    if (bug.fix_task_id) continue;

    // Skip if too many occurrences (needs human investigation)
    if (bug.occurrence_count > 10) {
      logger.warn({
        category: 'bug-reports',
        action: 'bug_too_frequent',
        message: `Bug ${bug.id} has ${bug.occurrence_count} occurrences - needs manual review`,
        details: { bugId: bug.id }
      });
      continue;
    }

    // Create fix task
    try {
      await bugReportService.createFixTask(bug.id);
    } catch (error) {
      logger.error({
        category: 'bug-reports',
        action: 'fix_task_creation_failed',
        message: `Failed to create fix task for bug ${bug.id}`,
        error
      });
    }
  }
}
```

#### **Integration 5: Task Status Change Hook**

**Location**: `src/services/taskQueue.sqlite.ts` (add new method)

```typescript
/**
 * Hook called when task status changes
 * Updates linked bug reports
 */
private async onTaskStatusChanged(taskId: string, oldStatus: TaskStatus, newStatus: TaskStatus): Promise<void> {
  // Find bugs where this task is the fix task
  const bugReportService = getBugReportService();
  const bugs = this.db.getConnection().prepare(`
    SELECT id FROM bug_reports WHERE fix_task_id = ?
  `).all(taskId) as Array<{ id: string }>;

  if (bugs.length === 0) return;

  for (const { id: bugId } of bugs) {
    if (newStatus === 'running') {
      await bugReportService.markInProgress(bugId, 'dev-bot-agent');
    } else if (newStatus === 'completed') {
      // Get commit SHA from task output
      const task = this.getTask(taskId);
      const commitSha = extractCommitShaFromOutput(task?.output);
      await bugReportService.markFixed(bugId, commitSha || 'unknown');
    }
  }
}

// Call this hook in updateTask() method after status change
if (updates.status && updates.status !== currentTask.status) {
  await this.onTaskStatusChanged(taskId, currentTask.status, updates.status);
}
```

### 3.2 API Routes

**Location**: `src/routes/bug-reports.routes.ts` (new file)

```typescript
import { Router } from 'express';
import { getBugReportService } from '../services/bugReport.factory.js';

const router = Router();

/**
 * GET /bug-reports
 * List bug reports with filtering
 */
router.get('/bug-reports', async (req, res) => {
  try {
    const bugService = getBugReportService();
    const { status, severity, category, limit = 50, offset = 0 } = req.query;

    // Build query
    let query = 'SELECT * FROM bug_reports WHERE 1=1';
    const params: any[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const bugs = bugService.db.getConnection().prepare(query).all(...params);

    res.json({ bugs, count: bugs.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bug reports', message: String(error) });
  }
});

/**
 * GET /bug-reports/:id
 * Get single bug report with full details
 */
router.get('/bug-reports/:id', async (req, res) => {
  try {
    const bugService = getBugReportService();
    const bug = bugService.getBugReport(req.params.id);

    if (!bug) {
      return res.status(404).json({ error: 'Bug report not found' });
    }

    // Get activity history
    const activity = bugService.db.getConnection().prepare(`
      SELECT * FROM bug_report_activity
      WHERE bug_report_id = ?
      ORDER BY timestamp DESC
    `).all(bug.id);

    // Get attachments
    const attachments = bugService.db.getConnection().prepare(`
      SELECT * FROM bug_report_attachments
      WHERE bug_report_id = ?
    `).all(bug.id);

    res.json({ bug, activity, attachments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bug report', message: String(error) });
  }
});

/**
 * POST /bug-reports
 * Create manual bug report
 */
router.post('/bug-reports', async (req, res) => {
  try {
    const bugService = getBugReportService();
    const bug = await bugService.createBugReport(req.body);
    res.status(201).json({ bug });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create bug report', message: String(error) });
  }
});

/**
 * PATCH /bug-reports/:id
 * Update bug report
 */
router.patch('/bug-reports/:id', async (req, res) => {
  try {
    const bugService = getBugReportService();
    const bug = await bugService.updateBugReport(req.params.id, req.body);
    res.json({ bug });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update bug report', message: String(error) });
  }
});

/**
 * POST /bug-reports/:id/fix
 * Create fix task for bug
 */
router.post('/bug-reports/:id/fix', async (req, res) => {
  try {
    const bugService = getBugReportService();
    const task = await bugService.createFixTask(req.params.id);
    res.json({ task });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create fix task', message: String(error) });
  }
});

/**
 * GET /bug-reports/patterns
 * Get bug patterns for analysis
 */
router.get('/bug-reports/patterns', async (req, res) => {
  try {
    const bugService = getBugReportService();
    const patterns = bugService.getBugPatterns();
    res.json({ patterns });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bug patterns', message: String(error) });
  }
});

export default router;
```

---

## Part 4: Implementation Roadmap

### Phase 1: Foundation (Week 1)

**Deliverables**:
- ✅ Database schema (migration 010)
- ✅ TypeScript types and interfaces
- ✅ Core BugReportService implementation
- ✅ Factory pattern for service instantiation

**Tasks**:
1. Create `migrations/010_bug_reports.sql` with schema
2. Create `src/types/bugReport.ts` with type definitions
3. Implement `src/services/bugReport.service.ts`
4. Create `src/services/bugReport.factory.ts` for singleton pattern
5. Add unit tests for fingerprinting and deduplication
6. Update database service to apply new migration

**Testing**:
- Unit tests for BugReportService CRUD operations
- Unit tests for fingerprint generation
- Unit tests for deduplication logic
- Integration tests with SQLite

### Phase 2: Integration (Week 2)

**Deliverables**:
- ✅ Task failure integration
- ✅ Quality gate failure integration
- ✅ Worker crash integration
- ✅ Task status change hooks

**Tasks**:
1. Add bug report creation to `taskQueue.sqlite.ts:failTask()`
2. Add bug report creation to `taskCompletion.service.ts` quality gates
3. Add bug report creation to `taskQueue.sqlite.ts:detectStalledWorkers()`
4. Implement `onTaskStatusChanged()` hook
5. Add automatic fix task creation
6. Test all integration points with real task failures

**Testing**:
- Integration tests for automatic bug creation
- Integration tests for fix task creation
- End-to-end tests with failing tasks

### Phase 3: API & UI (Week 3)

**Deliverables**:
- ✅ REST API endpoints
- ✅ Dashboard widgets
- ✅ Bug detail view
- ✅ Bug list view

**Tasks**:
1. Create `src/routes/bug-reports.routes.ts`
2. Add routes to Express app
3. Create React components for bug dashboard
4. Add bug report link to task detail pages
5. Add open bugs badge to navbar
6. Implement bug activity timeline view

**Testing**:
- API endpoint tests with supertest
- Frontend component tests
- E2E tests for bug workflow

### Phase 4: Analytics & Monitoring (Week 4)

**Deliverables**:
- ✅ Bug metrics dashboard
- ✅ Pattern detection
- ✅ Automatic fix task scheduling
- ✅ Email notifications for critical bugs

**Tasks**:
1. Implement bug metrics calculation
2. Create analytics dashboard with charts
3. Add scheduled job for auto-fix task creation
4. Implement email notifications for critical bugs
5. Add bug pattern detection and alerts
6. Create bug report export functionality

**Testing**:
- Performance tests with large datasets
- Analytics calculation accuracy tests
- Notification delivery tests

---

## Part 5: Configuration

### 5.1 Environment Variables

```bash
# Bug Report Configuration
BUG_REPORT_STORAGE_PATH=/mnt/storage/app-monitor/bug-reports
BUG_REPORT_RETENTION_DAYS=30
BUG_REPORT_AUTO_FIX_ENABLED=true
BUG_REPORT_AUTO_FIX_MAX_OCCURRENCES=10
BUG_REPORT_CRITICAL_EMAIL=dev-team@company.com
```

### 5.2 Service Configuration

```typescript
// src/config/bugReports.ts

export interface BugReportConfig {
  storagePath: string;
  retentionDays: number;
  autoFixEnabled: boolean;
  autoFixMaxOccurrences: number;
  criticalEmailRecipients: string[];
  minSeverityForAutoFix: BugSeverity;
}

export const getBugReportConfig = (): BugReportConfig => ({
  storagePath: process.env.BUG_REPORT_STORAGE_PATH || './data/bug-reports',
  retentionDays: parseInt(process.env.BUG_REPORT_RETENTION_DAYS || '30'),
  autoFixEnabled: process.env.BUG_REPORT_AUTO_FIX_ENABLED === 'true',
  autoFixMaxOccurrences: parseInt(process.env.BUG_REPORT_AUTO_FIX_MAX_OCCURRENCES || '10'),
  criticalEmailRecipients: (process.env.BUG_REPORT_CRITICAL_EMAIL || '').split(',').filter(Boolean),
  minSeverityForAutoFix: (process.env.BUG_REPORT_MIN_SEVERITY_AUTO_FIX as BugSeverity) || 'medium'
});
```

---

## Part 6: Success Metrics

### 6.1 Key Performance Indicators

1. **Bug Detection Rate**: # of bugs automatically detected vs. manually reported
2. **Time to Detection**: Average time from error occurrence to bug report creation
3. **Deduplication Rate**: % of duplicate bugs prevented
4. **Time to Fix**: Average time from bug creation to fix completion
5. **Fix Success Rate**: % of bugs fixed on first attempt vs. requiring multiple tries
6. **Occurrence Patterns**: Most frequent bug categories and error types

### 6.2 Monitoring Dashboards

**Bug Report Dashboard**:
- Open bugs count by severity (critical, high, medium, low)
- Bug creation trend (last 7 days, 30 days)
- Fix task status distribution
- Top 10 bug patterns
- Average time to fix by severity
- Bug occurrence heatmap

**System Health Dashboard**:
- Task failure rate with bug report creation
- Quality gate failure trends
- Worker crash incidents
- Infrastructure issues timeline

---

## Part 7: Future Enhancements

### 7.1 Phase 5: Advanced Features (Future)

1. **Machine Learning Integration**
   - Predict bug likelihood based on code changes
   - Automatic severity classification
   - Suggest similar historical bugs

2. **Enhanced Deduplication**
   - Semantic similarity matching
   - Cross-category bug detection
   - Automatic parent bug linking

3. **Proactive Bug Prevention**
   - Static analysis integration
   - Pre-commit bug detection
   - Code complexity analysis

4. **Integration Expansions**
   - GitHub Issues sync
   - Slack notifications
   - PagerDuty integration for critical bugs
   - Jira bidirectional sync

5. **Advanced Analytics**
   - Bug cost analysis (time/resources spent)
   - Developer productivity impact
   - Technical debt tracking
   - Root cause analysis automation

---

## Conclusion

This implementation plan provides a comprehensive, production-ready bug report system that:

✅ **Seamlessly integrates** with existing task queue and dev-bot architecture
✅ **Uses SQLite** for robust, ACID-compliant storage
✅ **Automatically captures** rich diagnostic context at multiple failure points
✅ **Prevents duplicates** via intelligent fingerprinting
✅ **Spawns fix tasks** automatically using existing task queue mechanisms
✅ **Tracks full lifecycle** from detection through verification
✅ **Provides actionable insights** via analytics and pattern detection

The system respects existing architecture patterns, requires no breaking changes, and provides immediate value through automatic error detection and fix task generation.

**Next Steps**: Begin Phase 1 implementation with database migration and core service development.
