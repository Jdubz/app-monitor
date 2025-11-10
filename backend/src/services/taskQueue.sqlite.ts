/**
 * SQLite-based Task Queue Service
 *
 * Provides reliable, ACID-compliant task queue with:
 * - Atomic task assignment (no race conditions)
 * - Worker heartbeat tracking (detect crashed workers)
 * - Manual timeout support (no automatic timeouts)
 * - File lock conflict resolution
 * - Execution history and observability
 *
 * ## Timeout Philosophy
 *
 * We DO NOT automatically timeout tasks. Complex tasks may legitimately take hours.
 * Instead, we provide:
 *
 * 1. **Warning Detection**: detectLongRunningTasks() logs tasks exceeding a threshold
 *    but does NOT fail them automatically.
 *
 * 2. **Manual Intervention**: manuallyTimeoutTask() allows operators to timeout
 *    tasks after human verification (e.g., container crashed).
 *
 * 3. **Baseline Learning**: getTaskDurationStats() helps understand actual task
 *    durations. After collecting sufficient data (50+ tasks per type/complexity),
 *    can consider enabling smart timeouts with appropriate thresholds.
 *
 * 4. **Worker Heartbeats**: detectStalledWorkers() handles actual infrastructure
 *    failures (container crashes, system issues) via heartbeat mechanism.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { TaskClassifier } from './taskClassifier.js';

type AgentStatsRow = {
  agent_type: 'claude' | 'codex';
  total: number;
  completed: number;
  failed: number;
  avg_duration_ms: number | null;
};

type AgentTaskTypeStatsRow = AgentStatsRow & {
  task_type: string;
};

const TRACKED_TASK_TYPES = ['implementation', 'testing', 'documentation'] as const;
type TaskTypeKey = typeof TRACKED_TASK_TYPES[number];

export type AgentTaskTypeBreakdown = Record<TaskTypeKey, AgentMetrics>;

export type AgentMetrics = {
  total: number;
  completed: number;
  failed: number;
  avg_duration_ms?: number;
  success_rate: number;
};

export type AgentComparisonMetrics = {
  claude: AgentMetrics;
  codex: AgentMetrics;
  task_type_breakdown: {
    claude: AgentTaskTypeBreakdown;
    codex: AgentTaskTypeBreakdown;
  };
};

const isTrackedTaskType = (value: string | null | undefined): value is TaskTypeKey => {
  return Boolean(value) && TRACKED_TASK_TYPES.includes(value as TaskTypeKey);
};

export function summarizeAgentComparisonMetrics(
  agentStats: AgentStatsRow[],
  taskTypeStats: AgentTaskTypeStatsRow[] = [],
): AgentComparisonMetrics {
  const buildMetrics = (stats?: AgentStatsRow): AgentMetrics => {
    const completed = stats?.completed ?? 0;
    const failed = stats?.failed ?? 0;
    const total = stats?.total ?? 0;
    const avgDuration = stats?.avg_duration_ms ?? undefined;
    const attempts = completed + failed;
    const successRate = attempts > 0 ? (completed / attempts) * 100 : 0;

    return {
      total,
      completed,
      failed,
      avg_duration_ms: avgDuration,
      success_rate: successRate,
    };
  };

  const claudeStats = agentStats.find((s) => s.agent_type === 'claude');
  const codexStats = agentStats.find((s) => s.agent_type === 'codex');

  const createEmptyBreakdown = (): AgentTaskTypeBreakdown => {
    return TRACKED_TASK_TYPES.reduce((acc, taskType) => {
      acc[taskType] = buildMetrics();
      return acc;
    }, {} as AgentTaskTypeBreakdown);
  };

  const breakdown = {
    claude: createEmptyBreakdown(),
    codex: createEmptyBreakdown(),
  };

  for (const stats of taskTypeStats) {
    if (!isTrackedTaskType(stats.task_type)) {
      continue;
    }

    const agentBucket = stats.agent_type === 'claude' ? breakdown.claude : breakdown.codex;
    agentBucket[stats.task_type] = buildMetrics(stats);
  }

  return {
    claude: buildMetrics(claudeStats),
    codex: buildMetrics(codexStats),
    task_type_breakdown: breakdown,
  };
}

// Task status enum
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

// Worker status enum
export type WorkerStatus = 'starting' | 'running' | 'stopping' | 'stopped';

export interface Task {
  id: string;
  type: string;
  title: string;
  description?: string;
  documentation?: string;
  notes?: string;
  status: TaskStatus;
  priority: number;
  created_at: number;
  assigned_at?: number;
  started_at?: number;
  completed_at?: number;
  assigned_agent: string;
  assigned_worker?: string;
  agent_type?: 'claude' | 'codex'; // Track which CLI tool executed the task
  prompt?: string;
  output?: string;
  error?: string;
  can_retry: boolean;
  retry_count: number;
  max_retries: number;
  timeout_ms: number | null;
  fingerprint?: string;
  estimated_hours?: number;
  complexity?: string;
  files?: string[];
  dependencies?: string[];
  acceptance_criteria?: string[];
  architecture_references?: string[];
  validation_steps?: string[];
  success_metrics?: string[];
  // Recovery system fields
  is_repair_bot?: boolean; // True if this is a cleanup or follow-up bot
  original_task_id?: string; // ID of the original failed task (for repair bots)
  repair_stage?: 'cleanup' | 'followup'; // Which stage of recovery this bot represents
  // PR workflow fields
  pr_number?: number; // GitHub PR number
  pr_url?: string; // Full PR URL
  pr_branch?: string; // Feature branch name
  pr_status?: 'creating' | 'pending_checks' | 'pending_review' | 'ready_to_merge' | 'merged' | 'closed';
  pr_checks_status?: 'pending' | 'success' | 'failure';
  pr_review_status?: 'no_reviews' | 'approved' | 'changes_requested' | 'commented';
  pr_created_at?: number;
  pr_merged_at?: number;
  // Followup task linking
  followup_for_pr?: number; // If this task fixes issues from a PR
  followup_tasks?: string[]; // Child tasks created to fix PR issues
  // Orphaned PR handling
  is_orphaned_pr?: boolean; // True if this task was auto-adopted from orphaned system PR
  // Task verification fields (PR workflow quality gates)
  verification_passed?: boolean; // True if task verification succeeded (>= 80% criteria met)
  verification_results?: string; // JSON stringified TaskVerificationResult
  verification_timestamp?: number; // Unix timestamp when verification was performed
  // Intelligent agent selection fields (Phase 0)
  task_category?: 'implementation' | 'analysis' | 'documentation' | 'review' | 'planning';
  file_patterns?: string; // JSON array of file extensions (e.g., ["ts", "md"])
  estimated_complexity?: 'simple' | 'medium' | 'complex';
  preferred_agent?: 'claude' | 'codex' | 'copilot'; // Manual override for agent selection
  // Enhanced task fields for comprehensive task planning
  parent_initiative?: string;
  long_term_goals?: string[];
  related_tasks?: string[];
  estimated_effort?: {
    hours: number;
    complexity: 'simple' | 'medium' | 'complex' | 'expert';
    confidence: 'low' | 'medium' | 'high';
  };
  required_skills?: string[];
  assumptions?: string[];
  alternatives?: string[];
  context_boundaries?: {
    mustNotChange: string[];
    mustNotAffect: string[];
    integrationPoints: string[];
  };
  prerequisites?: string[];
  testing_requirements?: string[];
  documentation_requirements?: string[];
  rollback_plan?: string[];
  blockers?: string[];
  risks?: string[];
}

export interface Worker {
  id: string;
  agent_id: string;
  status: WorkerStatus;
  current_task_id?: string;
  created_at: number;
  last_heartbeat: number;
  heartbeat_timeout_ms: number;
}

export interface TaskExecution {
  id: number;
  task_id: string;
  worker_id: string;
  attempt_number: number;
  started_at: number;
  ended_at?: number;
  exit_code?: number;
  error?: string;
  duration_ms?: number;
}

export interface QueueMetrics {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  timeout: number;
  total: number;
  avg_completion_time_ms?: number;
  oldest_pending_age_ms?: number;
}

export class TaskQueueService {
  private db: Database.Database;
  private dbPath: string;
  private readonly taskClassifier: TaskClassifier; // Auto-classification (Phase 0.3)

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.taskClassifier = new TaskClassifier();
    this.ensureDirectory();
    this.db = new Database(dbPath);
    this.initialize();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private initialize(): void {
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    // Create schema
    this.createSchema();

    // Run migrations for existing databases
    this.runMigrations();

    logger.info({
      category: 'process',
      action: 'sqlite_queue_initialized',
      message: `SQLite task queue initialized at ${this.dbPath}`
    });
  }

  private runMigrations(): void {
    // Get current columns
    const columns = this.db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{name: string}>;
    const columnNames = new Set(columns.map(col => col.name));

    // Migration 1: Add agent_type column
    if (!columnNames.has('agent_type')) {
      logger.info({
        category: 'process',
        action: 'adding_agent_type_column',
        message: 'Adding agent_type column to tasks table for agent comparison tracking'
      });

      this.db.exec(`
        ALTER TABLE tasks ADD COLUMN agent_type TEXT CHECK(agent_type IN ('claude', 'codex'));
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_agent_type ON tasks(agent_type);
      `);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'agent_type column added successfully'
      });
    }

    // Migration 2: Add PR workflow columns
    const prColumns = ['pr_number', 'pr_url', 'pr_branch', 'pr_status', 'pr_checks_status', 'pr_review_status', 'pr_created_at', 'pr_merged_at'];
    const missingPrColumns = prColumns.filter(col => !columnNames.has(col));

    if (missingPrColumns.length > 0) {
      logger.info({
        category: 'process',
        action: 'adding_pr_workflow_columns',
        message: `Adding ${missingPrColumns.length} PR workflow columns to tasks table`,
        details: { columns: missingPrColumns }
      });

      // Add each missing column
      if (!columnNames.has('pr_number')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN pr_number INTEGER;`);
      }
      if (!columnNames.has('pr_url')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN pr_url TEXT;`);
      }
      if (!columnNames.has('pr_branch')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN pr_branch TEXT;`);
      }
      if (!columnNames.has('pr_status')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN pr_status TEXT CHECK(pr_status IN ('creating', 'pending_checks', 'pending_review', 'ready_to_merge', 'merged', 'closed'));`);
      }
      if (!columnNames.has('pr_checks_status')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN pr_checks_status TEXT CHECK(pr_checks_status IN ('pending', 'success', 'failure'));`);
      }
      if (!columnNames.has('pr_review_status')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN pr_review_status TEXT CHECK(pr_review_status IN ('no_reviews', 'approved', 'changes_requested', 'commented'));`);
      }
      if (!columnNames.has('pr_created_at')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN pr_created_at INTEGER;`);
      }
      if (!columnNames.has('pr_merged_at')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN pr_merged_at INTEGER;`);
      }

      // Create indexes
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_pr_number ON tasks(pr_number);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_pr_status ON tasks(pr_status) WHERE pr_status IS NOT NULL;`);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'PR workflow columns added successfully'
      });
    }

    // Migration 3: Add repair bot / task recovery columns
    const recoveryColumns = ['is_repair_bot', 'original_task_id', 'followup_for_pr', 'followup_tasks'];
    const missingRecoveryColumns = recoveryColumns.filter(col => !columnNames.has(col));

    if (missingRecoveryColumns.length > 0) {
      logger.info({
        category: 'process',
        action: 'adding_recovery_columns',
        message: `Adding ${missingRecoveryColumns.length} task recovery columns to tasks table`,
        details: { columns: missingRecoveryColumns }
      });

      if (!columnNames.has('is_repair_bot')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN is_repair_bot INTEGER DEFAULT 0;`);
      }
      if (!columnNames.has('original_task_id')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN original_task_id TEXT;`);
      }
      if (!columnNames.has('followup_for_pr')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN followup_for_pr INTEGER;`);
      }
      if (!columnNames.has('followup_tasks')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN followup_tasks TEXT;`); // JSON array
      }

      // Create indexes
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_original_task_id ON tasks(original_task_id) WHERE original_task_id IS NOT NULL;`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_followup_for_pr ON tasks(followup_for_pr) WHERE followup_for_pr IS NOT NULL;`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_is_repair_bot ON tasks(is_repair_bot) WHERE is_repair_bot = 1;`);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'Task recovery columns added successfully'
      });
    }

    // Migration 4: Add intelligent agent selection columns
    const classificationColumns = ['task_category', 'file_patterns', 'estimated_complexity', 'preferred_agent'];
    const missingClassificationColumns = classificationColumns.filter(col => !columnNames.has(col));

    if (missingClassificationColumns.length > 0) {
      logger.info({
        category: 'process',
        action: 'adding_classification_columns',
        message: `Adding ${missingClassificationColumns.length} task classification columns for intelligent agent selection`,
        details: { columns: missingClassificationColumns }
      });

      if (!columnNames.has('task_category')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN task_category TEXT CHECK(task_category IN ('implementation', 'analysis', 'documentation', 'review', 'planning'));`);
      }
      if (!columnNames.has('file_patterns')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN file_patterns TEXT;`); // JSON array of file extensions
      }
      if (!columnNames.has('estimated_complexity')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN estimated_complexity TEXT CHECK(estimated_complexity IN ('simple', 'medium', 'complex'));`);
      }
      if (!columnNames.has('preferred_agent')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN preferred_agent TEXT CHECK(preferred_agent IN ('claude', 'codex', 'copilot'));`); // Manual override
      }

      // Create indexes
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_task_category ON tasks(task_category) WHERE task_category IS NOT NULL;`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_complexity ON tasks(estimated_complexity) WHERE estimated_complexity IS NOT NULL;`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_preferred_agent ON tasks(preferred_agent) WHERE preferred_agent IS NOT NULL;`);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'Task classification columns added successfully for intelligent agent selection'
      });
    }

    // Migration 5: Add task verification columns (PR workflow quality gates)
    const verificationColumns = ['verification_passed', 'verification_results', 'verification_timestamp'];
    const missingVerificationColumns = verificationColumns.filter(col => !columnNames.has(col));

    if (missingVerificationColumns.length > 0) {
      logger.info({
        category: 'process',
        action: 'adding_verification_columns',
        message: `Adding ${missingVerificationColumns.length} task verification columns for PR workflow quality gates`,
        details: { columns: missingVerificationColumns }
      });

      if (!columnNames.has('verification_passed')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN verification_passed INTEGER;`); // 0 = failed, 1 = passed
      }
      if (!columnNames.has('verification_results')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN verification_results TEXT;`); // JSON stringified TaskVerificationResult
      }
      if (!columnNames.has('verification_timestamp')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN verification_timestamp INTEGER;`); // Unix timestamp
      }

      // Create index for verification status queries
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_verification_passed ON tasks(verification_passed) WHERE verification_passed IS NOT NULL;`);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'Task verification columns added successfully for PR workflow quality gates'
      });
    }
  }

  private createSchema(): void {
    this.db.exec(`
      -- Main tasks table
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        documentation TEXT,
        notes TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
        priority INTEGER NOT NULL DEFAULT 5,
        created_at INTEGER NOT NULL,
        assigned_at INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        assigned_agent TEXT NOT NULL,
        assigned_worker TEXT,
        agent_type TEXT CHECK(agent_type IN ('claude', 'codex')), -- Track which CLI tool executed
        prompt TEXT,
        output TEXT,
        error TEXT,
        can_retry INTEGER DEFAULT 1,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        timeout_ms INTEGER DEFAULT NULL, -- NULL = no timeout (conservative approach)
        fingerprint TEXT,
        estimated_hours REAL,
        complexity TEXT
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_tasks_fingerprint ON tasks(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_worker ON tasks(assigned_worker);
      -- Note: idx_tasks_agent_type is created in migration, not here

      -- Worker tracking
      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('starting', 'running', 'stopping', 'stopped')),
        current_task_id TEXT,
        created_at INTEGER NOT NULL,
        last_heartbeat INTEGER NOT NULL,
        heartbeat_timeout_ms INTEGER DEFAULT 30000,

        FOREIGN KEY (current_task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
      CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON workers(last_heartbeat);

      -- Task execution history
      CREATE TABLE IF NOT EXISTS task_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        exit_code INTEGER,
        error TEXT,
        duration_ms INTEGER,

        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_executions_task_id ON task_executions(task_id);
      CREATE INDEX IF NOT EXISTS idx_executions_worker_id ON task_executions(worker_id);

      -- Task files (for file locking)
      CREATE TABLE IF NOT EXISTS task_files (
        task_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        lock_acquired_at INTEGER,

        PRIMARY KEY (task_id, file_path),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_task_files_path ON task_files(file_path);

      -- Task acceptance criteria
      CREATE TABLE IF NOT EXISTS task_criteria (
        task_id TEXT NOT NULL,
        criterion TEXT NOT NULL,
        sort_order INTEGER NOT NULL,

        PRIMARY KEY (task_id, sort_order),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Task architecture references
      CREATE TABLE IF NOT EXISTS task_references (
        task_id TEXT NOT NULL,
        reference TEXT NOT NULL,
        sort_order INTEGER NOT NULL,

        PRIMARY KEY (task_id, sort_order),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Task dependencies
      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,

        PRIMARY KEY (task_id, depends_on_task_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Task validation steps
      CREATE TABLE IF NOT EXISTS task_validation_steps (
        task_id TEXT NOT NULL,
        step TEXT NOT NULL,
        sort_order INTEGER NOT NULL,

        PRIMARY KEY (task_id, sort_order),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Task success metrics
      CREATE TABLE IF NOT EXISTS task_success_metrics (
        task_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        sort_order INTEGER NOT NULL,

        PRIMARY KEY (task_id, sort_order),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- PR followup fingerprints (track which issues already have followup tasks)
      CREATE TABLE IF NOT EXISTS pr_followup_fingerprints (
        pr_number INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        created_at INTEGER NOT NULL,

        PRIMARY KEY (pr_number, fingerprint)
      );

      CREATE INDEX IF NOT EXISTS idx_fingerprints_pr ON pr_followup_fingerprints(pr_number);
    `);
  }

  /**
   * Create a new task
   */
  createTask(taskData: Partial<Task>): Task {
    const now = Date.now();
    const generatedId = `task-${taskData.type || 'implementation'}-${randomUUID()}`;
    
    // Auto-classify task if not already classified (Phase 0.3)
    let taskCategory = taskData.task_category;
    let filePatterns = taskData.file_patterns;
    let estimatedComplexity = taskData.estimated_complexity;
    
    if (!taskCategory || !filePatterns || !estimatedComplexity) {
      const classification = this.taskClassifier.classifyTask({
        title: taskData.title || 'Untitled Task',
        description: taskData.description
      });
      
      taskCategory = taskCategory || classification.category;
      // Only use classification if filePatterns is missing or empty
      filePatterns = (filePatterns && filePatterns !== '') ? filePatterns : JSON.stringify(classification.filePatterns);
      estimatedComplexity = estimatedComplexity || classification.complexity;
      
      logger.info({
        category: 'classification',
        action: 'task_auto_classified',
        message: `Auto-classified task: ${classification.reasoning}`,
        details: {
          taskId: generatedId,
          category: taskCategory,
          filePatterns: classification.filePatterns,
          complexity: estimatedComplexity,
          confidence: classification.confidence
        }
      });
    }
    
    const task: Task = {
      id: taskData.id || generatedId,
      type: taskData.type || 'implementation',
      title: taskData.title || 'Untitled Task',
      description: taskData.description,
      documentation: taskData.documentation,
      notes: taskData.notes,
      status: 'pending',
      priority: taskData.priority || 5,
      created_at: now,
      assigned_agent: taskData.assigned_agent || 'backend-specialist',
      prompt: taskData.prompt,
      can_retry: taskData.can_retry !== undefined ? taskData.can_retry : true,
      retry_count: 0,
      max_retries: taskData.max_retries || 3,
      timeout_ms: taskData.timeout_ms !== undefined ? taskData.timeout_ms : null,
      fingerprint: taskData.fingerprint,
      estimated_hours: taskData.estimated_hours,
      complexity: taskData.complexity,
      // Classification fields (Phase 0.3)
      task_category: taskCategory,
      file_patterns: filePatterns,
      estimated_complexity: estimatedComplexity,
      preferred_agent: taskData.preferred_agent
    };

    return this.transaction(() => {
      // Insert main task with classification fields
      const stmt = this.db.prepare(`
        INSERT INTO tasks (
          id, type, title, description, documentation, notes, status, priority,
          created_at, assigned_agent, prompt, can_retry, retry_count, max_retries,
          timeout_ms, fingerprint, estimated_hours, complexity,
          task_category, file_patterns, estimated_complexity, preferred_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        task.id, task.type, task.title, task.description, task.documentation,
        task.notes, task.status, task.priority, task.created_at, task.assigned_agent,
        task.prompt, task.can_retry ? 1 : 0, task.retry_count, task.max_retries,
        task.timeout_ms, task.fingerprint, task.estimated_hours, task.complexity,
        task.task_category, task.file_patterns, task.estimated_complexity, task.preferred_agent
      );

      // Insert related data
      if (taskData.files && taskData.files.length > 0) {
        const fileStmt = this.db.prepare('INSERT INTO task_files (task_id, file_path) VALUES (?, ?)');
        for (const file of taskData.files) {
          fileStmt.run(task.id, file);
        }
      }

      if (taskData.acceptance_criteria && taskData.acceptance_criteria.length > 0) {
        const criteriaStmt = this.db.prepare('INSERT INTO task_criteria (task_id, criterion, sort_order) VALUES (?, ?, ?)');
        taskData.acceptance_criteria.forEach((criterion, index) => {
          criteriaStmt.run(task.id, criterion, index);
        });
      }

      if (taskData.architecture_references && taskData.architecture_references.length > 0) {
        const refStmt = this.db.prepare('INSERT INTO task_references (task_id, reference, sort_order) VALUES (?, ?, ?)');
        taskData.architecture_references.forEach((ref, index) => {
          refStmt.run(task.id, ref, index);
        });
      }

      if (taskData.validation_steps && taskData.validation_steps.length > 0) {
        const validationStmt = this.db.prepare('INSERT INTO task_validation_steps (task_id, step, sort_order) VALUES (?, ?, ?)');
        taskData.validation_steps.forEach((step, index) => {
          validationStmt.run(task.id, step, index);
        });
      }

      if (taskData.success_metrics && taskData.success_metrics.length > 0) {
        const metricStmt = this.db.prepare('INSERT INTO task_success_metrics (task_id, metric, sort_order) VALUES (?, ?, ?)');
        taskData.success_metrics.forEach((metric, index) => {
          metricStmt.run(task.id, metric, index);
        });
      }

      logger.info({
        category: 'process',
        action: 'task_created',
        message: `Created task ${task.id}: ${task.title}`
      });

      return task;
    });
  }

  /**
   * Check for duplicate task by fingerprint
   */
  checkDuplicateTask(fingerprint: string): Task | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE fingerprint = ?
      AND status IN ('pending', 'running')
      ORDER BY created_at ASC
      LIMIT 1
    `);

    return stmt.get(fingerprint) as Task | undefined;
  }

  /**
   * Assign next available task atomically
   * Returns null if no tasks available or all have file conflicts
   */
  assignNextTask(): Task | null {
    return this.transaction(() => {
      // Find next pending task ordered by priority and age
      const taskStmt = this.db.prepare(`
        SELECT * FROM tasks
        WHERE status = 'pending'
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `);

      const task = taskStmt.get() as Task | undefined;
      if (!task) return null;

      // Check for file conflicts
      const conflictStmt = this.db.prepare(`
        SELECT tf.file_path, t.id as conflicting_task_id
        FROM task_files tf
        JOIN tasks t ON tf.task_id = t.id
        WHERE tf.file_path IN (SELECT file_path FROM task_files WHERE task_id = ?)
        AND t.status = 'running'
        AND t.id != ?
      `);

      const conflict = conflictStmt.get(task.id, task.id) as { file_path: string; conflicting_task_id: string } | undefined;
      if (conflict) {
        logger.info({
          category: 'process',
          action: 'task_assignment_blocked_by_file_conflict',
          message: `Task ${task.id} blocked by file conflict with task ${conflict.conflicting_task_id}`
        });
        return null;
      }

      // Assign task atomically
      const now = Date.now();
      const workerId = `bot-${task.assigned_agent}-${now}`;

      const updateStmt = this.db.prepare(`
        UPDATE tasks
        SET status = 'running',
            assigned_at = ?,
            started_at = ?,
            assigned_worker = ?
        WHERE id = ?
      `);

      updateStmt.run(now, now, workerId, task.id);

      // Create worker record
      const workerStmt = this.db.prepare(`
        INSERT INTO workers (id, agent_id, status, current_task_id, created_at, last_heartbeat)
        VALUES (?, ?, 'running', ?, ?, ?)
      `);

      workerStmt.run(workerId, task.assigned_agent, task.id, now, now);

      // Record execution attempt
      const executionStmt = this.db.prepare(`
        INSERT INTO task_executions (task_id, worker_id, attempt_number, started_at)
        VALUES (?, ?, ?, ?)
      `);

      executionStmt.run(task.id, workerId, task.retry_count + 1, now);

      logger.info({
        category: 'process',
        action: 'task_assigned',
        message: `Assigned task ${task.id} to worker ${workerId}`
      });

      return {
        ...task,
        status: 'running',
        assigned_worker: workerId,
        assigned_at: now,
        started_at: now
      };
    });
  }

  /**
   * Complete a task (idempotent)
   */
  completeTask(taskId: string, output: string, agentType?: 'claude' | 'codex'): void {
    this.transaction(() => {
      const taskStmt = this.db.prepare('SELECT status FROM tasks WHERE id = ?');
      const task = taskStmt.get(taskId) as { status: TaskStatus } | undefined;

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Idempotency: only complete if currently running
      if (task.status !== 'running') {
        logger.warn({
          category: 'process',
          action: 'task_already_in_final_state',
          message: `Task ${taskId} already in ${task.status} state, skipping completion`
        });
        return;
      }

      const now = Date.now();

      // Update task with agent_type for comparison tracking
      const updateStmt = this.db.prepare(`
        UPDATE tasks
        SET status = 'completed',
            output = ?,
            completed_at = ?,
            agent_type = ?
        WHERE id = ?
      `);

      updateStmt.run(output, now, agentType || null, taskId);

      // Update execution record
      const executionStmt = this.db.prepare(`
        SELECT id, started_at
        FROM task_executions
        WHERE task_id = ? AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `);

      const execution = executionStmt.get(taskId) as { id: number; started_at: number } | undefined;

      if (execution) {
        const updateExecutionStmt = this.db.prepare(`
          UPDATE task_executions
          SET ended_at = ?,
              duration_ms = ?,
              exit_code = 0
          WHERE id = ?
        `);

        updateExecutionStmt.run(now, now - execution.started_at, execution.id);
      }

      // Clean up worker
      const workerStmt = this.db.prepare(`
        UPDATE workers
        SET status = 'stopped',
            current_task_id = NULL
        WHERE current_task_id = ?
      `);

      workerStmt.run(taskId);

      logger.info({
        category: 'process',
        action: 'task_completed',
        message: `Task ${taskId} completed successfully`
      });
    });
  }

  /**
   * Fail a task
   */
  failTask(taskId: string, error: string): void {
    this.transaction(() => {
      const taskStmt = this.db.prepare('SELECT status, can_retry, retry_count, max_retries FROM tasks WHERE id = ?');
      const task = taskStmt.get(taskId) as { status: TaskStatus; can_retry: number; retry_count: number; max_retries: number } | undefined;

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (task.status !== 'running') {
        logger.warn({
          category: 'process',
          action: 'task_already_in_final_state',
          message: `Task ${taskId} already in ${task.status} state, skipping failure`
        });
        return;
      }

      const now = Date.now();

      // IMPORTANT: Do NOT automatically retry tasks
      // Tasks should enter SimpleFailureRecovery two-stage process:
      // 1. Cleanup task fixes the error
      // 2. Followup task completes the original goal
      // The old automatic retry behavior caused tasks to fail 3 times before recovery
      const newStatus = 'failed';

      // Update task
      const updateStmt = this.db.prepare(`
        UPDATE tasks
        SET status = ?,
            error = ?,
            completed_at = ?,
            retry_count = retry_count + 1,
            assigned_worker = NULL,
            assigned_at = NULL,
            started_at = NULL
        WHERE id = ?
      `);

      updateStmt.run(newStatus, error, now, taskId);

      // Update execution record
      const executionStmt = this.db.prepare(`
        SELECT id, started_at
        FROM task_executions
        WHERE task_id = ? AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `);

      const execution = executionStmt.get(taskId) as { id: number; started_at: number } | undefined;

      if (execution) {
        const updateExecutionStmt = this.db.prepare(`
          UPDATE task_executions
          SET ended_at = ?,
              duration_ms = ?,
              exit_code = 1,
              error = ?
          WHERE id = ?
        `);

        updateExecutionStmt.run(now, now - execution.started_at, error, execution.id);
      }

      // Clean up worker
      const workerStmt = this.db.prepare(`
        UPDATE workers
        SET status = 'stopped',
            current_task_id = NULL
        WHERE current_task_id = ?
      `);

      workerStmt.run(taskId);

      logger.info({
        category: 'process',
        action: 'task_failed',
        message: `Task ${taskId} failed: ${error}`,
        details: {
          taskId,
          error,
          retryCount: task.retry_count + 1,
          willEnterRecovery: true
        }
      });
    });
  }

  /**
   * Update task fields (for retry and other operations)
   */
  updateTask(taskId: string, updates: Partial<Task>): Task | undefined {
    return this.transaction(() => {
      const task = this.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Build UPDATE statement dynamically based on provided fields
      const fields: string[] = [];
      const values: Array<string | number | null | undefined> = [];

      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.error !== undefined) {
        fields.push('error = ?');
        values.push(updates.error);
      }
      if (updates.assigned_worker !== undefined) {
        fields.push('assigned_worker = ?');
        values.push(updates.assigned_worker);
      }
      if (updates.assigned_at !== undefined) {
        fields.push('assigned_at = ?');
        values.push(updates.assigned_at);
      }
      if (updates.retry_count !== undefined) {
        fields.push('retry_count = ?');
        values.push(updates.retry_count);
      }
      if (updates.notes !== undefined) {
        fields.push('notes = ?');
        values.push(updates.notes);
      }

      if (fields.length === 0) {
        return task; // No updates needed
      }

      values.push(taskId); // Add taskId for WHERE clause

      const stmt = this.db.prepare(`
        UPDATE tasks
        SET ${fields.join(', ')}
        WHERE id = ?
      `);

      stmt.run(...values);

      return this.getTask(taskId);
    });
  }

  /**
   * Update worker heartbeat
   */
  updateWorkerHeartbeat(workerId: string): void {
    const stmt = this.db.prepare('UPDATE workers SET last_heartbeat = ? WHERE id = ?');
    stmt.run(Date.now(), workerId);
  }

  /**
   * Detect and handle stalled workers
   * Returns array of stalled worker IDs
   */
  detectStalledWorkers(): string[] {
    return this.transaction(() => {
      const timeout = Date.now() - 30000; // 30 seconds

      const stmt = this.db.prepare(`
        SELECT id, current_task_id
        FROM workers
        WHERE status = 'running'
        AND last_heartbeat < ?
      `);

      const stalledWorkers = stmt.all(timeout) as { id: string; current_task_id: string }[];

      for (const worker of stalledWorkers) {
        if (worker.current_task_id) {
          const updateTaskStmt = this.db.prepare(`
            UPDATE tasks
            SET status = 'failed',
                error = 'Worker heartbeat timeout',
                completed_at = ?
            WHERE id = ?
          `);

          updateTaskStmt.run(Date.now(), worker.current_task_id);
        }

        const updateWorkerStmt = this.db.prepare('UPDATE workers SET status = \'stopped\' WHERE id = ?');
        updateWorkerStmt.run(worker.id);

        logger.warn({
          category: 'process',
          action: 'stalled_worker_detected',
          message: `Worker ${worker.id} stalled, marked task ${worker.current_task_id} as failed`
        });
      }

      return stalledWorkers.map(w => w.id);
    });
  }

  /**
   * Detect tasks that have exceeded their timeout (WARNING ONLY)
   * Does NOT automatically fail tasks - returns them for investigation
   *
   * IMPORTANT: Only use this for alerting/monitoring. Do not auto-fail tasks
   * until we have baseline data on actual task durations.
   */
  detectLongRunningTasks(warningThresholdMs: number = 1800000): Array<{ id: string; title: string; started_at: number; duration_ms: number }> {
    const now = Date.now();
    const threshold = now - warningThresholdMs;

    const stmt = this.db.prepare(`
      SELECT id, title, started_at,
             ? - started_at as duration_ms
      FROM tasks
      WHERE status = 'running'
      AND started_at < ?
    `);

    const longRunningTasks = stmt.all(now, threshold) as Array<{ id: string; title: string; started_at: number; duration_ms: number }>;

    if (longRunningTasks.length > 0) {
      logger.warn({
        category: 'process',
        action: 'long_running_tasks_detected',
        message: `Found ${longRunningTasks.length} tasks running longer than ${warningThresholdMs / 60000} minutes (WARNING ONLY - not auto-failing)`,
        details: longRunningTasks.map(t => ({
          id: t.id,
          title: t.title,
          duration_minutes: Math.round(t.duration_ms / 60000)
        })) as unknown as Record<string, unknown>
      });
    }

    return longRunningTasks;
  }

  /**
   * Manually timeout a specific task (requires explicit call)
   * Use this only after human verification that a task is truly stuck
   */
  manuallyTimeoutTask(taskId: string, reason: string = 'Manually timed out by operator'): void {
    this.transaction(() => {
      const taskStmt = this.db.prepare('SELECT status FROM tasks WHERE id = ?');
      const task = taskStmt.get(taskId) as { status: TaskStatus } | undefined;

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (task.status !== 'running') {
        logger.warn({
          category: 'process',
          action: 'task_not_running',
          message: `Task ${taskId} is ${task.status}, cannot timeout`
        });
        return;
      }

      const now = Date.now();

      const updateStmt = this.db.prepare(`
        UPDATE tasks
        SET status = 'timeout',
            error = ?,
            completed_at = ?
        WHERE id = ?
      `);

      updateStmt.run(reason, now, taskId);

      // Update execution record
      const executionStmt = this.db.prepare(`
        SELECT id, started_at
        FROM task_executions
        WHERE task_id = ? AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `);

      const execution = executionStmt.get(taskId) as { id: number; started_at: number } | undefined;

      if (execution) {
        const updateExecutionStmt = this.db.prepare(`
          UPDATE task_executions
          SET ended_at = ?,
              duration_ms = ?,
              error = ?
          WHERE id = ?
        `);

        updateExecutionStmt.run(now, now - execution.started_at, reason, execution.id);
      }

      logger.warn({
        category: 'process',
        action: 'task_manually_timed_out',
        message: `Task ${taskId} manually timed out: ${reason}`
      });
    });
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const task = stmt.get(taskId) as Task | undefined;

    if (task) {
      // Load related data
      task.files = this.getTaskFiles(taskId);
      task.acceptance_criteria = this.getTaskCriteria(taskId);
      task.architecture_references = this.getTaskReferences(taskId);
      task.validation_steps = this.getTaskValidationSteps(taskId);
      task.success_metrics = this.getTaskSuccessMetrics(taskId);
    }

    return task;
  }

  /**
   * Get all tasks by status
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at ASC');
    return stmt.all(status) as Task[];
  }

  /**
   * Get all tasks with unmerged PRs for monitoring
   * Used to resume PR monitoring on startup
   */
  getTasksWithUnmergedPRs(): Task[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM tasks
        WHERE pr_number IS NOT NULL
          AND pr_url IS NOT NULL
          AND pr_branch IS NOT NULL
          AND (pr_status IS NULL OR pr_status != 'merged')
        ORDER BY pr_created_at DESC
      `);
      return stmt.all() as Task[];
    } catch (error) {
      // Gracefully handle missing columns (e.g., pr_number, pr_branch not yet migrated)
      if (error instanceof Error && error.message.includes('no such column')) {
        logger.warn({
          category: 'process',
          action: 'pr_columns_not_migrated',
          message: 'PR workflow columns not yet available - returning empty list. Run migrations to enable PR tracking.',
          error
        });
        return [];
      }
      throw error;
    }
  }

  /**
   * Find orphaned tasks that may have lost PR info
   * Used by PR recovery service to find tasks needing recovery
   */
  findOrphanedTasksByError(hoursBack: number = 24): Task[] {
    try {
      const cutoffTime = Date.now() - (hoursBack * 3600000);
      const stmt = this.db.prepare(`
        SELECT * FROM tasks
        WHERE status = 'failed'
          AND (
            error LIKE '%orphaned%'
            OR error LIKE '%restart%'
            OR error LIKE '%crash%'
          )
          AND pr_number IS NULL
          AND created_at > ?
        ORDER BY created_at DESC
        LIMIT 50
      `);
      return stmt.all(cutoffTime) as Task[];
    } catch (error) {
      // Gracefully handle missing columns (e.g., pr_number not yet migrated)
      if (error instanceof Error && error.message.includes('no such column')) {
        logger.warn({
          category: 'process',
          action: 'pr_columns_not_migrated',
          message: 'PR workflow columns not yet available - cannot find orphaned PRs. Run migrations to enable PR recovery.',
          error
        });
        return [];
      }
      throw error;
    }
  }

  /**
   * Find completed tasks that should have PRs but don't
   * Used by PR recovery service for broader recovery attempts
   */
  findCompletedTasksWithoutPR(hoursBack: number = 24): Task[] {
    const cutoffTime = Date.now() - (hoursBack * 3600000);
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'completed'
        AND pr_number IS NULL
        AND type IN ('implementation', 'feature', 'bug', 'refactor')
        AND created_at > ?
      ORDER BY created_at DESC
      LIMIT 20
    `);
    return stmt.all(cutoffTime) as Task[];
  }

  /**
   * Find tasks with suspicious error patterns that may have lost PR info
   * Used by PR recovery service for detecting crash-related failures
   */
  findSuspiciousFailedTasks(hoursBack: number = 48): Task[] {
    const cutoffTime = Date.now() - (hoursBack * 3600000);
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'failed'
        AND pr_number IS NULL
        AND (
          error LIKE '%server%'
          OR error LIKE '%timeout%'
          OR error LIKE '%ECONNREFUSED%'
        )
        AND created_at > ?
      ORDER BY created_at DESC
      LIMIT 20
    `);
    return stmt.all(cutoffTime) as Task[];
  }

  /**
   * Get task duration statistics by type and complexity
   * Useful for learning baseline durations before setting timeouts
   */
  getTaskDurationStats(daysBack: number = 30): Array<{
    type: string;
    complexity: string;
    completed_count: number;
    avg_minutes: number;
    max_minutes: number;
    min_minutes: number;
  }> {
    const since = Date.now() - (daysBack * 86400000);

    const stmt = this.db.prepare(`
      SELECT
        t.type,
        COALESCE(t.complexity, 'unknown') as complexity,
        COUNT(*) as completed_count,
        AVG(te.duration_ms) / 60000.0 as avg_minutes,
        MAX(te.duration_ms) / 60000.0 as max_minutes,
        MIN(te.duration_ms) / 60000.0 as min_minutes
      FROM task_executions te
      JOIN tasks t ON te.task_id = t.id
      WHERE te.exit_code = 0
      AND te.ended_at > ?
      GROUP BY t.type, t.complexity
      ORDER BY t.type, t.complexity
    `);

    return stmt.all(since) as Array<{
      type: string;
      complexity: string;
      completed_count: number;
      avg_minutes: number;
      max_minutes: number;
      min_minutes: number;
    }>;
  }

  /**
   * Get queue metrics
   */
  getQueueMetrics(): QueueMetrics {
    const countStmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM tasks
      GROUP BY status
    `);

    const counts = countStmt.all() as { status: TaskStatus; count: number }[];
    const metrics: QueueMetrics = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      timeout: 0,
      total: 0
    };

    for (const { status, count } of counts) {
      metrics[status] = count;
      metrics.total += count;
    }

    // Average completion time
    const avgStmt = this.db.prepare(`
      SELECT AVG(duration_ms) as avg_duration
      FROM task_executions
      WHERE exit_code = 0
      AND ended_at > ?
    `);

    const oneDayAgo = Date.now() - 86400000;
    const avgResult = avgStmt.get(oneDayAgo) as { avg_duration: number } | undefined;
    metrics.avg_completion_time_ms = avgResult?.avg_duration;

    // Oldest pending task age
    const oldestStmt = this.db.prepare(`
      SELECT MIN(created_at) as oldest
      FROM tasks
      WHERE status = 'pending'
    `);

    const oldestResult = oldestStmt.get() as { oldest: number } | undefined;
    if (oldestResult?.oldest) {
      metrics.oldest_pending_age_ms = Date.now() - oldestResult.oldest;
    }

    return metrics;
  }

  /**
   * Get task execution history
   */
  getTaskExecutions(taskId: string): TaskExecution[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_executions
      WHERE task_id = ?
      ORDER BY started_at ASC
    `);

    return stmt.all(taskId) as TaskExecution[];
  }

  /**
   * Execute a function within a transaction
   */
  private transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  // Helper methods for related data

  private getTaskFiles(taskId: string): string[] {
    const stmt = this.db.prepare('SELECT file_path FROM task_files WHERE task_id = ? ORDER BY file_path');
    const rows = stmt.all(taskId) as { file_path: string }[];
    return rows.map(r => r.file_path);
  }

  private getTaskCriteria(taskId: string): string[] {
    const stmt = this.db.prepare('SELECT criterion FROM task_criteria WHERE task_id = ? ORDER BY sort_order');
    const rows = stmt.all(taskId) as { criterion: string }[];
    return rows.map(r => r.criterion);
  }

  private getTaskReferences(taskId: string): string[] {
    const stmt = this.db.prepare('SELECT reference FROM task_references WHERE task_id = ? ORDER BY sort_order');
    const rows = stmt.all(taskId) as { reference: string }[];
    return rows.map(r => r.reference);
  }

  private getTaskValidationSteps(taskId: string): string[] {
    const stmt = this.db.prepare('SELECT step FROM task_validation_steps WHERE task_id = ? ORDER BY sort_order');
    const rows = stmt.all(taskId) as { step: string }[];
    return rows.map(r => r.step);
  }

  private getTaskSuccessMetrics(taskId: string): string[] {
    const stmt = this.db.prepare('SELECT metric FROM task_success_metrics WHERE task_id = ? ORDER BY sort_order');
    const rows = stmt.all(taskId) as { metric: string }[];
    return rows.map(r => r.metric);
  }

  /**
   * Get agent comparison metrics
   * Compare performance between Claude and Codex agents
   */
  getAgentComparisonMetrics(): AgentComparisonMetrics {
    const agentStats = this.db.prepare(`
      SELECT
        agent_type,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(CASE
          WHEN status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN completed_at - started_at
          ELSE NULL
        END) as avg_duration_ms
      FROM tasks
      WHERE agent_type IS NOT NULL AND agent_type IN ('claude', 'codex')
      GROUP BY agent_type
    `).all() as AgentStatsRow[];

    const taskTypeStats = this.db.prepare(`
      SELECT
        agent_type,
        LOWER(type) as task_type,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(CASE
          WHEN status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN completed_at - started_at
          ELSE NULL
        END) as avg_duration_ms
      FROM tasks
      WHERE agent_type IS NOT NULL
        AND agent_type IN ('claude', 'codex')
        AND type IS NOT NULL
        AND LOWER(type) IN ('implementation', 'testing', 'documentation')
      GROUP BY agent_type, LOWER(type)
    `).all() as AgentTaskTypeStatsRow[];

    return summarizeAgentComparisonMetrics(agentStats, taskTypeStats);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info({
      category: 'process',
      action: 'sqlite_queue_closed',
      message: 'SQLite task queue closed'
    });
  }

  /**
   * Backup database
   */
  backup(backupPath: string): void {
    this.db.backup(backupPath);
    logger.info({
      category: 'process',
      action: 'database_backed_up',
      message: `Database backed up to ${backupPath}`
    });
  }

  // ============================================================================
  // Recovery System Methods
  // ============================================================================

  /**
   * Run recovery system database migration
   * DEPRECATED: Migration file removed
   */
  async runRecoveryMigration(): Promise<void> {
    logger.info({
      category: 'process',
      action: 'recovery_migration_skipped',
      message: 'Recovery migration skipped - migration file removed'
    });
  }

  /**
   * Count running repair bots (cleanup and follow-up bots)
   */
  countRunningRepairBots(): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM tasks
      WHERE status = 'running'
        AND is_repair_bot = 1
    `).get() as { count: number };

    return result.count;
  }

  /**
   * Get all repair bots for a specific task
   */
  getRepairBotsForTask(originalTaskId: string): Task[] {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM tasks
        WHERE original_task_id = ?
          AND is_repair_bot = 1
        ORDER BY created_at ASC
      `).all(originalTaskId) as Task[];

      return rows;
    } catch (error) {
      // Gracefully handle missing columns (e.g., original_task_id, is_repair_bot not yet migrated)
      if (error instanceof Error && error.message.includes('no such column')) {
        logger.warn({
          category: 'process',
          action: 'recovery_columns_not_migrated',
          message: 'Task recovery columns not yet available - cannot retrieve repair bots. Run migrations to enable task recovery.',
          error
        });
        return [];
      }
      throw error;
    }
  }

  /**
   * Check if a task already has a recovery attempt
   */
  hasRecoveryAttempt(taskId: string): boolean {
    try {
      const result = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM tasks
        WHERE original_task_id = ?
          AND is_repair_bot = 1
      `).get(taskId) as { count: number };

      return result.count > 0;
    } catch (error) {
      // Gracefully handle missing columns (e.g., original_task_id, is_repair_bot not yet migrated)
      if (error instanceof Error && error.message.includes('no such column')) {
        logger.debug({
          category: 'process',
          action: 'recovery_columns_not_migrated',
          message: 'Task recovery columns not yet available - assuming no recovery attempt exists.',
          error
        });
        return false;
      }
      throw error;
    }
  }

  /**
   * Recover orphaned tasks on server startup
   * Finds tasks that were marked as 'running' but have no active container
   *
   * This handles the case where:
   * - Server crashed/restarted while tasks were running
   * - Docker containers were killed externally
   * - Worker processes died unexpectedly
   *
   * Returns array of orphaned task IDs that were marked as failed
   */
  recoverOrphanedTasks(): string[] {
    return this.transaction(() => {
      // Find all tasks marked as 'running'
      const runningTasks = this.db.prepare(`
        SELECT id, title, assigned_worker, started_at
        FROM tasks
        WHERE status = 'running'
      `).all() as Array<{ id: string; title: string; assigned_worker: string | null; started_at: number }>;

      if (runningTasks.length === 0) {
        return [];
      }

      logger.warn({
        category: 'recovery',
        action: 'orphaned_tasks_detected',
        message: `Found ${runningTasks.length} orphaned running tasks on startup`,
        details: {
          count: runningTasks.length,
          tasks: runningTasks.map(t => ({ id: t.id, title: t.title }))
        }
      });

      const orphanedTaskIds: string[] = [];

      for (const task of runningTasks) {
        const now = Date.now();
        const durationMs = now - task.started_at;
        const durationMinutes = Math.round(durationMs / 60000);

        // Mark task as failed
        const updateStmt = this.db.prepare(`
          UPDATE tasks
          SET status = 'failed',
              error = ?,
              completed_at = ?,
              retry_count = retry_count + 1,
              assigned_worker = NULL
          WHERE id = ?
        `);

        updateStmt.run(
          `Task was orphaned (server restart or crash). Was running for ${durationMinutes} minutes before server stopped.`,
          now,
          task.id
        );

        // Update execution record if one exists
        const executionStmt = this.db.prepare(`
          SELECT id, started_at
          FROM task_executions
          WHERE task_id = ? AND ended_at IS NULL
          ORDER BY started_at DESC
          LIMIT 1
        `);

        const execution = executionStmt.get(task.id) as { id: number; started_at: number } | undefined;

        if (execution) {
          const updateExecutionStmt = this.db.prepare(`
            UPDATE task_executions
            SET ended_at = ?,
                duration_ms = ?,
                exit_code = -1,
                error = 'Task orphaned due to server restart'
            WHERE id = ?
          `);

          updateExecutionStmt.run(now, now - execution.started_at, execution.id);
        }

        // Clean up worker reference
        if (task.assigned_worker) {
          const workerStmt = this.db.prepare(`
            UPDATE workers
            SET status = 'stopped',
                current_task_id = NULL
            WHERE id = ?
          `);

          workerStmt.run(task.assigned_worker);
        }

        orphanedTaskIds.push(task.id);

        logger.info({
          category: 'recovery',
          action: 'orphaned_task_recovered',
          message: `Marked orphaned task ${task.id} as failed`,
          details: {
            taskId: task.id,
            title: task.title,
            wasRunningFor: `${durationMinutes} minutes`,
            worker: task.assigned_worker
          }
        });
      }

      return orphanedTaskIds;
    });
  }

  // Note: The following methods (getRecoveryAttempt, createRecoveryAttempt, updateRecoveryAttempt, createSafetyCheck)
  // and their associated tables (recovery_attempts, recovery_safety_checks) are NO LONGER USED.
  // They were part of the complex recovery orchestrator that has been replaced with SimpleFailureRecovery.
  // The simplified system only uses task metadata (is_repair_bot, original_task_id, repair_stage) for tracking.
  // These methods are kept for backwards compatibility with existing databases, but are not called by the new system.

  // ==========================================================================
  // PR Workflow Methods
  // ==========================================================================

  /**
   * Find tasks by PR number
   */
  async findByPRNumber(prNumber: number): Promise<Task[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks 
      WHERE pr_number = ?
      ORDER BY created_at DESC
    `);

    return stmt.all(prNumber) as Task[];
  }

  /**
   * Find task by task ID
   */
  async findByTaskId(taskId: string): Promise<Task | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks 
      WHERE id = ?
    `);

    const row = stmt.get(taskId);
    return row ? (row as Task) : null;
  }

  /**
   * Update PR status fields for a task
   */
  async updatePRStatus(taskId: string, prStatus: Partial<Task>): Promise<void> {
    const updates: string[] = [];
    const values: unknown[] = [];

    // Build dynamic UPDATE statement based on provided fields
    const prFields = [
      'pr_number', 'pr_url', 'pr_branch', 'pr_status',
      'pr_checks_status', 'pr_review_status', 
      'pr_created_at', 'pr_merged_at'
    ] as const;

    for (const field of prFields) {
      if (field in prStatus) {
        updates.push(`${field} = ?`);
        values.push(prStatus[field]);
      }
    }

    if (updates.length === 0) {
      return; // Nothing to update
    }

    values.push(taskId); // Add taskId for WHERE clause

    const sql = `
      UPDATE tasks 
      SET ${updates.join(', ')}
      WHERE id = ?
    `;

    const stmt = this.db.prepare(sql);
    stmt.run(...values);

    logger.info({
      category: 'process',
      action: 'pr_status_updated',
      message: `Updated PR status for task ${taskId}`,
      details: { taskId, updates: Object.keys(prStatus) }
    });
  }

  /**
   * Check if a fingerprint already exists for a PR
   */
  hasFollowupFingerprint(prNumber: number, fingerprint: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM pr_followup_fingerprints 
      WHERE pr_number = ? AND fingerprint = ?
    `);
    return !!stmt.get(prNumber, fingerprint);
  }

  /**
   * Add a followup fingerprint for a PR
   */
  addFollowupFingerprint(prNumber: number, fingerprint: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO pr_followup_fingerprints (pr_number, fingerprint, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(prNumber, fingerprint, Date.now());
  }

  /**
   * Get all fingerprints for a PR
   */
  getFollowupFingerprints(prNumber: number): string[] {
    const stmt = this.db.prepare(`
      SELECT fingerprint FROM pr_followup_fingerprints 
      WHERE pr_number = ?
    `);
    const rows = stmt.all(prNumber) as { fingerprint: string }[];
    return rows.map(r => r.fingerprint);
  }

  /**
   * Clear all fingerprints for a PR (when PR is merged/closed)
   */
  clearFollowupFingerprints(prNumber: number): void {
    const stmt = this.db.prepare(`
      DELETE FROM pr_followup_fingerprints WHERE pr_number = ?
    `);
    stmt.run(prNumber);
  }
}
