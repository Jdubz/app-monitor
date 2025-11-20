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
 * ## Architecture (Refactored - Nov 2024)
 *
 * This service follows the Single Responsibility Principle by delegating
 * specialized concerns to focused services:
 *
 * - **TaskRepository**: All database CRUD operations for tasks
 * - **WorkerLifecycleService**: Worker registration, heartbeats, stalled detection
 * - **ChainTrackerService**: Task chain lifecycle management
 * - **TaskQueueMetricsService**: Metrics collection and analytics
 * - **TaskClassifier**: Automatic task categorization
 *
 * TaskQueueService orchestrates these services to provide queue operations:
 * priority-based task selection, file conflict detection, and task assignment.
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
 *
 * @see TaskRepository for database operations
 * @see WorkerLifecycleService for worker management
 * @see ChainTrackerService for chain tracking
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { TaskClassifier } from './taskClassifier.js';
import { ChainTrackerService, type ChainStats, type BlockedChain } from './chainTracker.service.js';
import {
  TaskQueueMetricsService,
  summarizeAgentComparisonMetrics,
  type AgentMetrics,
  type AgentTaskTypeBreakdown,
  type AgentComparisonMetrics,
} from './taskQueueMetrics.service.js';
import { getPlanStatusUpdater } from './planStatusUpdater.singleton.js';
import { getPhaseMetricsService, type PhaseMetricsSnapshot, type PhaseStats } from './phaseMetrics.service.js';
import { TaskRepository } from '../repositories/TaskRepository.js';
import { WorkerLifecycleService } from './WorkerLifecycleService.js';
// import { MigrationManager } from './migrationManager.js'; // TODO: Uncomment when migration files are updated

export type { ChainStats, BlockedChain };

export type {
  AgentMetrics,
  AgentTaskTypeBreakdown,
  AgentComparisonMetrics,
};
export { summarizeAgentComparisonMetrics };

// Task status enum
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout' | 'blocked';

// Worker status enum
export type WorkerStatus = 'starting' | 'running' | 'stopping' | 'stopped';

/**
 * Phase payload structure for preserving task context across attempts and blocks.
 * Stored in tasks.phase_payload as JSON.
 *
 * This lightweight structure preserves only essential context for task resumption:
 * - Git branch NAME (not content) for identifying where work happened
 * - Last execution timestamp for staleness detection
 * - Validation artifacts for understanding what passed/failed
 * - Recovery metadata for understanding retry history
 */
export interface PhasePayload {
  /** Git branch name for this task (e.g., "feature/task-123") */
  gitBranch?: string;

  /** Last successful commit SHA on the task branch */
  lastCommitSha?: string;

  /** Partial artifacts from last phase execution (e.g., test results, build outputs) */
  artifacts?: Record<string, unknown>;

  /** Number of recovery attempts within current phase */
  recoveryAttempts?: number;

  /** Timestamp of last phase execution */
  lastExecutionAt?: number;

  /** Environment variables relevant to task execution */
  environmentVars?: Record<string, string>;

  /** Additional metadata for extensibility */
  metadata?: Record<string, unknown>;
}

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
  agent_type?: 'claude' | 'codex' | 'gemini'; // Track which CLI tool executed the task
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
  // PR workflow fields
  pr_number?: number; // GitHub PR number (foreign key reference only - fetch PR details from GitHub API on-demand)
  followup_for_pr?: number; // PR number this task is a followup for
  followup_tasks?: string[]; // Task IDs of followup tasks created for this task's PR
  // Orphaned PR handling
  is_orphaned_pr?: boolean; // True if this task was auto-adopted from orphaned system PR
  // Chain tracking
  chain_id?: string; // UUID identifying the chain this task belongs to
  chain_depth?: number; // Depth in the fix chain (0 = original, 1+ = fix attempts)
  chain_status?: 'pending' | 'active' | 'blocked' | 'closed'; // Chain lifecycle status
  blocked_reason?: string; // Reason chain was blocked (for manual intervention)
  blocked_at?: number; // Unix timestamp when chain was blocked
  blocked_by?: string; // User/system that blocked the chain
  // Phase System fields (THE ONLY task processing system)
  phase_index: number; // Current phase (1-7) - DEFAULT 1 in DB
  phase_name: string; // Human-readable phase name - DEFAULT 'Planning' in DB
  phase_status: 'ready' | 'running' | 'validating' | 'recovering' | 'complete' | 'blocked'; // DEFAULT 'ready' in DB
  phase_attempts: number; // Retry attempts within current phase - DEFAULT 1 in DB
  phase_payload?: string; // JSON for phase-specific state and partial progress (nullable)
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
  plan_id?: string; // Links task to a plan in the plans table
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
  // Agent eligibility fields
  risk_score?: number; // Explicit risk score for agent eligibility assessment
  metadata?: Record<string, unknown>; // Dynamic metadata for policy overrides and extensibility
  // Context management fields (migration 020)
  context_bundle_id?: string; // UUID of generated context bundle
  context_cache_key?: string; // Git hash-based cache key for bundle lookup
  context_profiles?: string[]; // Array of profile names (e.g., ["scope-control", "pr-workflow"])
  risk_level?: 'minimal' | 'low' | 'medium' | 'high'; // Task risk classification
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
  blocked: number;
  total: number;
  avg_completion_time_ms?: number;
  oldest_pending_age_ms?: number;
}

/**
 * Task Queue Service
 * 
 * Orchestrates task queue operations by coordinating multiple specialized services.
 * This service focuses on queue-specific logic: priority-based selection, file conflict
 * detection, and task assignment, while delegating data access and worker management
 * to dedicated services.
 * 
 * @example
 * ```typescript
 * const queue = new TaskQueueService('./data/tasks.db');
 * 
 * // Create a task (delegates to TaskRepository)
 * const task = queue.createTask({
 *   title: 'Implement feature',
 *   type: 'implementation',
 *   priority: 8
 * });
 * 
 * // Assign task to next available worker
 * const next = queue.getNextTask();
 * if (next) {
 *   queue.updateWorkerHeartbeat(next.assigned_worker!);
 * }
 * 
 * // Complete task (delegates to WorkerLifecycleService)
 * queue.completeTask(task.id, 'Success!', 'claude');
 * ```
 */
export class TaskQueueService {
  private db: Database.Database;
  private dbPath: string;
  private readonly taskClassifier: TaskClassifier; // Auto-classification (Phase 0.3)
  private readonly chainTracker: ChainTrackerService; // Chain lifecycle management (Phase 2)
  private readonly maxConcurrentChains: number; // Chain concurrency limit
  private readonly metricsService: TaskQueueMetricsService; // Metrics and analytics
  private readonly taskRepository: TaskRepository; // Database operations (extracted)
  private readonly workerLifecycle: WorkerLifecycleService; // Worker management (extracted)
  private taskCompletionCount = 0; // PR sync counter (event-driven trigger)
  private readonly PR_SYNC_THRESHOLD: number; // Every N task completions
  private prSyncService: { syncAllTrackedPRs: () => Promise<void> } | null = null; // PRSyncService (set after construction)

  /**
   * Create a new TaskQueueService
   * 
   * @param dbPath Path to SQLite database file
   */
  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.taskClassifier = new TaskClassifier();
    this.ensureDirectory();
    this.db = new Database(dbPath);
    this.initialize();
    
    // Initialize extracted services
    this.taskRepository = new TaskRepository(this.db);
    this.workerLifecycle = new WorkerLifecycleService(this.db);
    
    // Initialize chain tracking with configurable concurrency limit
    this.chainTracker = new ChainTrackerService(this.db);
    this.maxConcurrentChains = config.devBots.maxWorkers;

    // Initialize metrics service
    this.metricsService = new TaskQueueMetricsService(this.db);

    // Initialize PR sync threshold from config
    this.PR_SYNC_THRESHOLD = Math.max(1, config.prSync.taskThreshold);

    logger.info({
      category: 'process',
      action: 'staged_queue_initialized',
      message: `Staged queue initialized with ${this.maxConcurrentChains} max concurrent chains`,
      details: { 
        maxConcurrentChains: this.maxConcurrentChains,
        prSyncEnabled: config.prSync.enabled,
        prSyncThreshold: this.PR_SYNC_THRESHOLD
      }
    });
  }

  /**
   * Set PR sync service (dependency injection to avoid circular dependency)
   */
  setPRSyncService(prSyncService: { syncAllTrackedPRs: () => Promise<void> }): void {
    this.prSyncService = prSyncService;
  }

  /**
   * Get the underlying database instance for dependency injection.
   * Used by services that need direct database access (e.g., PhaseOrchestratorService).
   */
  getDb(): Database.Database {
    return this.db;
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private initialize(): void {
    // Enable WAL mode for better concurrency (skip for in-memory databases)
    if (this.dbPath !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
    }
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
    // TODO: Switch to MigrationManager once SQL migration files are updated to handle existing columns
    // For now, keeping inline migrations for compatibility with tests
    // The MigrationManager is ready and tested - just needs SQL files to be updated

    // Uncomment when ready:
    // const migrationManager = new MigrationManager(this.db);
    // const result = migrationManager.runMigrations();

    // For now, no migrations are needed here as createSchema() creates the full schema
    // In production, the schema is built incrementally via SQL migrations
  }


  private createSchema(): void {
    // ⚠️  CRITICAL: DUAL SCHEMA MANAGEMENT ANTI-PATTERN
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //
    // This method creates schema for tests/dev, but production uses migrations/*.sql
    // This is an ANTI-PATTERN that caused production failure (Nov 19, 2025).
    //
    // PROBLEM:
    // - Two sources of truth: this code AND migration files
    // - Schema drift is INEVITABLE
    // - Tests pass with different schema than production → production failures
    // - Column added here but not in migrations → missing in production
    //
    // INCIDENT:
    // - recovery_diagnosis column added here (line 480)
    // - Migration 026 used CREATE TABLE IF NOT EXISTS (silently skipped in prod)
    // - Production database missing column → 100% task failure rate
    // - Required emergency hotfix + migration 029
    //
    // SOLUTION OPTIONS:
    //
    // Option A: Use ONLY migrations (recommended)
    //   1. Remove this createSchema() method
    //   2. Tests call MigrationManager.runMigrations()
    //   3. One source of truth, guaranteed consistency
    //
    // Option B: Sync from migrations
    //   1. Auto-generate this from migration files
    //   2. Validate on startup that schemas match
    //   3. More complex but keeps code-based schema
    //
    // CURRENT STATE:
    // - Emergency fixes applied (migration 029)
    // - Schema validation tools added
    // - CI/CD validation in place
    // - This method still exists as interim solution
    //
    // ACTION REQUIRED:
    // - Plan migration to Option A (single source of truth)
    // - Update all tests to use MigrationManager
    // - Remove this method
    // - See: docs/migrations/best-practices.md
    //
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //
    // NOTE: In production, the tasks table is created by migrations (002_tasks_table.sql + 016_add_fingerprint_column.sql)
    // However, for tests and standalone usage, we need to create it here with a compatible schema
    // This table definition includes ALL columns from migrations to ensure compatibility
    
    this.db.exec(`
      -- Main tasks table (compatible with migrations schema)
      -- Includes columns from migrations: project, pr_number, chain_id, chain_depth, etc.
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        documentation TEXT,
        notes TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout', 'assigned', 'active', 'retrying', 'blocked')),
        priority INTEGER NOT NULL DEFAULT 5,
        created_at INTEGER NOT NULL,
        assigned_at INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        assigned_agent TEXT NOT NULL,
        assigned_worker TEXT,
        agent_type TEXT CHECK(agent_type IN ('claude', 'codex', 'gemini')),
        prompt TEXT,
        output TEXT,
        error TEXT,
        can_retry INTEGER DEFAULT 1,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        timeout_ms INTEGER DEFAULT NULL,
        fingerprint TEXT,
        estimated_hours REAL,
        complexity TEXT,
        -- Migration 002 columns
        exit_code INTEGER,
        files TEXT,
        dependencies TEXT,
        project TEXT,
        timeout INTEGER,
        metadata TEXT,
        context_json TEXT,
        -- Migration 005 columns (pr_number ONLY - other PR columns removed in migration 027)
        pr_number INTEGER,
        -- Migration 011 columns
        chain_id TEXT,
        chain_depth INTEGER,
        -- Migration 012 columns (queue_stage and original_task_id removed - phase system only)
        chain_status TEXT,
        blocked_reason TEXT,
        blocked_at INTEGER,
        blocked_by TEXT,
        -- Migration 030 columns (resume tracking)
        resumed_by TEXT,
        resumed_at INTEGER,
        -- Migration 013 columns (phase system)
        phase_index INTEGER DEFAULT 1,
        phase_name TEXT,
        phase_status TEXT CHECK(phase_status IN ('ready', 'running', 'validating', 'recovering', 'complete', 'blocked')) DEFAULT 'ready',
        phase_attempts INTEGER DEFAULT 1,
        phase_payload TEXT,
        -- Migration 020 columns (context management)
        context_bundle_id TEXT,
        context_cache_key TEXT,
        context_profiles TEXT,
        risk_level TEXT CHECK(risk_level IN ('minimal', 'low', 'medium', 'high')),
        -- Migration 4 columns (intelligent agent selection / task classification)
        task_category TEXT CHECK(task_category IN ('implementation', 'analysis', 'documentation', 'review', 'planning')),
        file_patterns TEXT,
        estimated_complexity TEXT CHECK(estimated_complexity IN ('simple', 'medium', 'complex')),
        preferred_agent TEXT CHECK(preferred_agent IN ('claude', 'codex', 'copilot'))
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_tasks_fingerprint ON tasks(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_worker ON tasks(assigned_worker);
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
      CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority DESC, created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_pr_number ON tasks(pr_number) WHERE pr_number IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id) WHERE chain_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tasks_chain_status ON tasks(chain_status) WHERE chain_status IS NOT NULL;
      -- Note: idx_tasks_context_bundle_id, idx_tasks_context_cache_key, idx_tasks_risk_level are created
      --       in the dynamic migration (runMigrations lines 521-523), not here in createSchema
      -- Note: idx_tasks_agent_type is created in migration, not here

      -- Worker tracking
      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('starting', 'running', 'stopping', 'stopped')),
        current_task_id TEXT,
        created_at INTEGER NOT NULL,
        last_heartbeat INTEGER NOT NULL,
        heartbeat_timeout_ms INTEGER DEFAULT 90000,

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

      -- Phase system tracking (task stage runs)
      CREATE TABLE IF NOT EXISTS task_stage_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        phase_index INTEGER NOT NULL,
        phase_name TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed', 'skipped')),
        artifacts_blob TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        recovery_diagnosis TEXT,
        exit_code INTEGER,

        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_task_stage_runs_task_id ON task_stage_runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_stage_runs_phase_index ON task_stage_runs(phase_index);
      CREATE INDEX IF NOT EXISTS idx_task_stage_runs_status ON task_stage_runs(status);

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
   * Get the underlying database instance
   * Allows other services (like PlansService) to share the same database connection
   */
  getDatabase(): Database.Database {
    return this.db;
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
    
    // Chain ID determination - all new tasks start their own chain
    const chainId = taskData.chain_id || taskData.id || generatedId;
    
    const task: Task = {
      id: taskData.id || generatedId,
      type: taskData.type || 'implementation',
      title: taskData.title || 'Untitled Task',
      description: taskData.description,
      documentation: taskData.documentation,
      notes: taskData.notes,
      status: taskData.status || 'pending',
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
      preferred_agent: taskData.preferred_agent,
      // Chain tracking
      chain_status: taskData.chain_status || 'pending',
      chain_id: chainId,
      chain_depth: taskData.chain_depth || 0,
      // Phase system fields (default to Phase 1, but allow override for testing)
      phase_index: taskData.phase_index || 1,
      phase_name: taskData.phase_name || 'Planning',
      phase_status: taskData.phase_status || 'ready',
      phase_attempts: taskData.phase_attempts || 1,
      phase_payload: taskData.phase_payload || undefined
    };

    return this.transaction(() => {
      // Insert main task with classification and phase system fields
      const stmt = this.db.prepare(`
        INSERT INTO tasks (
          id, type, title, description, documentation, notes, status, priority,
          created_at, assigned_agent, prompt, can_retry, retry_count, max_retries,
          timeout_ms, fingerprint, estimated_hours, complexity,
          task_category, file_patterns, estimated_complexity, preferred_agent,
          chain_status, chain_id, chain_depth,
          phase_index, phase_name, phase_status, phase_attempts, phase_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        task.id, task.type, task.title, task.description, task.documentation,
        task.notes, task.status, task.priority, task.created_at, task.assigned_agent,
        task.prompt, task.can_retry ? 1 : 0, task.retry_count, task.max_retries,
        task.timeout_ms, task.fingerprint, task.estimated_hours, task.complexity,
        task.task_category, task.file_patterns, task.estimated_complexity, task.preferred_agent,
        task.chain_status, task.chain_id, task.chain_depth,
        task.phase_index, task.phase_name, task.phase_status, task.phase_attempts, task.phase_payload
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

    // Trigger plan status update if task is linked to a plan (after transaction)
    if (task.plan_id) {
      const planStatusUpdater = getPlanStatusUpdater();
      planStatusUpdater?.onTaskCreated(task.id).catch((error: unknown) => {
        logger.error({
          category: 'plan',
          action: 'plan_status_update_failed',
          message: `Failed to update plan status after task creation: ${task.id}`,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
    }

    return task;
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
   * Assign next available task using staged queue logic
   * 
   * Chain-aware scheduling:
   * 1. Close completed chains (PR merged + no pending tasks)
   * 2. Count active chains (non-blocked)
   * 3. If under capacity, dequeue implementation task (new chain)
   * 4. Otherwise, dequeue followup task (existing chain)
   * 5. Check file conflicts and assign atomically
   * 
   * Returns null if no tasks available or all have file conflicts
   */
  assignNextTask(): Task | null {
    return this.transaction(() => {
      // Step 1: Close completed chains
      this.chainTracker.closeCompletedChains();

      // Step 2: Get chain statistics
      const activeChains = this.chainTracker.countActiveChains();
      const canStartNewChain = activeChains < this.maxConcurrentChains;

      logger.info({
        category: 'process',
        action: 'queue_worker_check',
        message: `Active chains: ${activeChains}/${this.maxConcurrentChains}`,
        details: { activeChains, maxChains: this.maxConcurrentChains, canStartNewChain }
      });

      // Step 3: Select which queue to dequeue from
      let task: Task | undefined;

      if (canStartNewChain) {
        // Try implementation queue first
        task = this.dequeueImplementationTask();
        
        if (task) {
          // Mark chain as active
          this.activateChain(task.chain_id!);
          logger.info({
            category: 'process',
            action: 'new_chain_started',
            message: `Started new chain ${task.chain_id}`,
            details: { chainId: task.chain_id, taskId: task.id, phaseIndex: task.phase_index }
          });
        }
      }

      // Step 4: If no implementation task (or can't start new chain), try followup
      if (!task) {
        task = this.dequeueImplementationTask();
        
        if (task) {
          logger.info({
            category: 'process',
            action: 'followup_task_dequeued',
            message: `Dequeued followup task for chain ${task.chain_id}`,
            details: { chainId: task.chain_id, taskId: task.id, phaseIndex: task.phase_index }
          });
        }
      }

      if (!task) {
        logger.info({
          category: 'process',
          action: 'no_task_available',
          message: 'No tasks available for dequeue',
          details: { activeChains, canStartNewChain }
        });
        return null;
      }

      // Step 5: Check file conflicts and assign
      return this.assignTaskToWorker(task);
    });
  }

  /**
   * Dequeue next task using phase-based priority system.
   * Priority order: Phase 7 > 6 > 5 > 4 > 3 > 2 > 1 (complete chains first)
   */
  private dequeueImplementationTask(): Task | undefined {
    // Query for pending tasks ordered by phase (later phases first to complete chains)
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'pending'
      AND phase_status = 'ready'
      AND chain_status != 'blocked'
      ORDER BY 
        phase_index DESC,  -- Favor later phases (complete chains first)
        priority DESC,      -- Then by priority
        created_at ASC      -- Then FIFO
      LIMIT 1
    `);

    return stmt.get() as Task | undefined;
  }

  /**
   * Mark chain as active
   */
  private activateChain(chainId: string): void {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET chain_status = 'active'
      WHERE chain_id = ?
      AND chain_status = 'pending'
    `);

    stmt.run(chainId);
  }

  /**
   * Assign task to worker after checking file conflicts
   */
  private assignTaskToWorker(task: Task): Task | null {
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
        message: `Task ${task.id} blocked by file conflict with task ${conflict.conflicting_task_id}`,
        details: { taskId: task.id, conflictingFile: conflict.file_path }
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

    // Register worker via WorkerLifecycleService
    this.workerLifecycle.registerWorker(workerId, task.assigned_agent, task.id);

    // Record execution attempt
    const executionStmt = this.db.prepare(`
      INSERT INTO task_executions (task_id, worker_id, attempt_number, started_at)
      VALUES (?, ?, ?, ?)
    `);

    executionStmt.run(task.id, workerId, task.retry_count + 1, now);

    logger.info({
      category: 'process',
      action: 'task_assigned',
      message: `Assigned task ${task.id} to worker ${workerId}`,
      details: { taskId: task.id, workerId, chainId: task.chain_id, phaseIndex: task.phase_index }
    });

    return {
      ...task,
      status: 'running',
      assigned_worker: workerId,
      assigned_at: now,
      started_at: now
    };
  }

  /**
   * Complete a task (idempotent)
   */
  completeTask(taskId: string, output: string, agentType: 'claude' | 'codex' | 'gemini'): void {
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

      updateStmt.run(output, now, agentType, taskId);

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

      // Release worker from task via WorkerLifecycleService
      this.workerLifecycle.releaseWorkerFromTask(taskId);

      logger.info({
        category: 'process',
        action: 'task_completed',
        message: `Task ${taskId} completed successfully`
      });
    });

    // Trigger plan status update if task is linked to a plan (after transaction)
    const planStatusUpdater = getPlanStatusUpdater();
    planStatusUpdater?.onTaskStatusChange(taskId).catch((error: unknown) => {
      logger.error({
        category: 'plan',
        action: 'plan_status_update_failed',
        message: `Failed to update plan status after task completion: ${taskId}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });

    // Trigger PR sync every N completions (event-driven, not timer-based)
    this.incrementTaskCompletionCounter();
  }

  /**
   * Increment task completion counter and trigger PR sync when threshold reached
   * Event-driven trigger - no timers or cron jobs (aligns with master design intent)
   */
  private incrementTaskCompletionCounter(): void {
    // Skip if PR sync disabled or not initialized
    if (!config.prSync.enabled || !this.prSyncService) {
      return;
    }

    this.taskCompletionCount++;

    if (this.taskCompletionCount >= this.PR_SYNC_THRESHOLD) {
      this.taskCompletionCount = 0;

      logger.debug({
        category: 'pr-sync',
        action: 'threshold_reached',
        message: `Task completion threshold reached (${this.PR_SYNC_THRESHOLD}), triggering PR sync`
      });

      // Fire and forget - don't block task completion
      this.prSyncService.syncAllTrackedPRs().catch((err: Error) => {
        logger.error({
          category: 'pr-sync',
          action: 'sync_trigger_failed',
          message: 'PR sync trigger failed',
          error: err
        });
      });
    }
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

      // Release worker from task via WorkerLifecycleService
      this.workerLifecycle.releaseWorkerFromTask(taskId);

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

    // Trigger plan status update if task is linked to a plan (after transaction)
    const planStatusUpdater = getPlanStatusUpdater();
    planStatusUpdater?.onTaskStatusChange(taskId).catch((error: unknown) => {
      logger.error({
        category: 'plan',
        action: 'plan_status_update_failed',
        message: `Failed to update plan status after task failure: ${taskId}`,
        error: error instanceof Error ? error : new Error(String(error)),
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
      if (updates.pr_number !== undefined) {
        fields.push('pr_number = ?');
        values.push(updates.pr_number);
      }
      if (updates.phase_index !== undefined) {
        fields.push('phase_index = ?');
        values.push(updates.phase_index);
      }
      if (updates.phase_name !== undefined) {
        fields.push('phase_name = ?');
        values.push(updates.phase_name);
      }
      if (updates.phase_status !== undefined) {
        fields.push('phase_status = ?');
        values.push(updates.phase_status);
      }
      if (updates.phase_attempts !== undefined) {
        fields.push('phase_attempts = ?');
        values.push(updates.phase_attempts);
      }
      if (updates.phase_payload !== undefined) {
        fields.push('phase_payload = ?');
        values.push(updates.phase_payload);
      }
      if (updates.chain_status !== undefined) {
        fields.push('chain_status = ?');
        values.push(updates.chain_status);
      }
      if (updates.blocked_reason !== undefined) {
        fields.push('blocked_reason = ?');
        values.push(updates.blocked_reason);
      }
      if (updates.blocked_at !== undefined) {
        fields.push('blocked_at = ?');
        values.push(updates.blocked_at);
      }
      if (updates.blocked_by !== undefined) {
        fields.push('blocked_by = ?');
        values.push(updates.blocked_by);
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
   * Update task metadata
   * Provides a clean API for updating task metadata without exposing internal db access
   */
  updateTaskMetadata(taskId: string, metadata: Record<string, unknown>): void {
    const stmt = this.db.prepare('UPDATE tasks SET metadata = ? WHERE id = ?');
    stmt.run(JSON.stringify(metadata), taskId);
  }

  /**
   * Update worker heartbeat
   */
  updateWorkerHeartbeat(workerId: string): void {
    this.workerLifecycle.updateHeartbeat(workerId);
  }

  /**
   * Detect and handle stalled workers
   * Returns array of stalled worker IDs
   * 
   * Timeout: 90 seconds (4.5x the 20s heartbeat interval)
   * This provides buffer for event loop delays and output buffering
   */
  detectStalledWorkers(): string[] {
    return this.transaction(() => {
      const stalledWorkers = this.workerLifecycle.handleStalledWorkers();
      const now = Date.now();
      const MAX_PHASE_ATTEMPTS = 4;

      // Handle tasks for stalled workers - retry or block based on attempts
      for (const worker of stalledWorkers) {
        if (worker.task_id) {
          const task = this.getTask(worker.task_id);

          if (task) {
            const phaseAttempts = task.phase_attempts ?? 1;

            if (phaseAttempts < MAX_PHASE_ATTEMPTS) {
              // Worker timeout but task can retry - requeue it
              this.requeueTaskForPhaseRetry(worker.task_id);

              logger.warn({
                category: 'process',
                action: 'task_requeued_after_worker_timeout',
                message: `Task ${worker.task_id} requeued after worker ${worker.id} timeout (attempt ${phaseAttempts + 1}/${MAX_PHASE_ATTEMPTS})`,
                details: { workerId: worker.id, taskId: worker.task_id, phaseAttempts: phaseAttempts + 1 }
              });
            } else {
              // Attempts exhausted - block the task
              const updateTaskStmt = this.db.prepare(`
                UPDATE tasks
                SET status = 'blocked',
                    phase_status = 'blocked',
                    blocked_reason = ?,
                    blocked_at = ?,
                    blocked_by = 'worker_timeout'
                WHERE id = ?
              `);
              updateTaskStmt.run(
                `Worker heartbeat timeout after ${MAX_PHASE_ATTEMPTS} attempts`,
                now,
                worker.task_id
              );

              logger.warn({
                category: 'process',
                action: 'task_blocked_after_worker_timeouts',
                message: `Task ${worker.task_id} blocked after ${MAX_PHASE_ATTEMPTS} worker timeout attempts`,
                details: { workerId: worker.id, taskId: worker.task_id }
              });
            }
          }
        }
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
   *
   * NOTE: Only returns tasks with pr_number. Use GitHubPRService to fetch current PR status on-demand.
   */
  getTasksWithUnmergedPRs(): Task[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM tasks
        WHERE pr_number IS NOT NULL
        ORDER BY created_at DESC
      `);
      return stmt.all() as Task[];
    } catch (error) {
      // Gracefully handle missing columns (e.g., pr_number not yet migrated)
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
   * Get currently active Copilot tasks (synchronous)
   * Used by Copilot throttle manager to enforce concurrency limits
   * Note: Returns synchronously as SQLite operations are synchronous
   */
  getActiveCopilotTasks(): Task[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM tasks
        WHERE status IN ('pending', 'running')
          AND preferred_agent = 'copilot'
        ORDER BY created_at ASC
      `);
      return stmt.all() as Task[];
    } catch (error) {
      logger.error({
        category: 'copilot-throttle',
        action: 'get_active_tasks_failed',
        message: 'Failed to get active Copilot tasks',
        error
      });
      return [];
    }
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
    return this.metricsService.getTaskDurationStats(daysBack);
  }

  /**
   * Get queue metrics
   */
  getQueueMetrics(): QueueMetrics {
    return this.metricsService.getQueueMetrics();
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
    return this.metricsService.getAgentComparisonMetrics();
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

        // Block orphaned task - don't mark as failed without giving it a chance to recover
        const updateStmt = this.db.prepare(`
          UPDATE tasks
          SET status = 'blocked',
              phase_status = 'blocked',
              blocked_reason = ?,
              blocked_at = ?,
              blocked_by = 'system_restart',
              assigned_worker = NULL
          WHERE id = ?
        `);

        updateStmt.run(
          `Task was orphaned (server restart or crash). Was running for ${durationMinutes} minutes before server stopped. Needs manual verification.`,
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

        // Stop worker via WorkerLifecycleService
        if (task.assigned_worker) {
          this.workerLifecycle.stopWorker(task.assigned_worker);
          // Clear task assignment
          this.db.prepare('UPDATE workers SET current_task_id = NULL WHERE id = ?')
            .run(task.assigned_worker);
        }

        orphanedTaskIds.push(task.id);

        logger.info({
          category: 'recovery',
          action: 'orphaned_task_blocked',
          message: `Blocked orphaned task ${task.id} for manual verification`,
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
   * Find ALL tasks related to a PR (both pr_number and followup_for_pr)
   * Used for comprehensive cleanup when PR is merged/closed
   */
  async findAllTasksForPR(prNumber: number): Promise<Task[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE pr_number = ? OR followup_for_pr = ?
      ORDER BY created_at ASC
    `);

    return stmt.all(prNumber, prNumber) as Task[];
  }

  /**
   * Get all tasks that have PR associations (for cleanup/validation)
   * Only returns pending and running tasks to minimize overhead
   */
  async getTasksWithPRNumber(): Promise<Task[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE (pr_number IS NOT NULL OR followup_for_pr IS NOT NULL)
        AND status IN ('pending', 'running')
      ORDER BY created_at ASC
    `);

    return stmt.all() as Task[];
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
   * Update PR number for a task (foreign key reference only)
   *
   * NOTE: This only stores pr_number as a foreign key. All other PR details
   * (url, branch, status, checks, reviews) should be fetched from GitHub API on-demand.
   */
  async updatePRNumber(taskId: string, prNumber: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET pr_number = ?
      WHERE id = ?
    `);

    stmt.run(prNumber, taskId);

    logger.info({
      category: 'process',
      action: 'pr_number_updated',
      message: `Updated PR number for task ${taskId}`,
      details: { taskId, prNumber }
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

  /**
   * Get chain statistics (Phase 2: Staged Queue)
   */
  getChainStats() {
    return this.chainTracker.getChainStats(this.maxConcurrentChains);
  }

  /**
   * Block a chain manually (Phase 2: Staged Queue)
   */
  blockChain(chainId: string, reason: string, blockedBy: string): void {
    return this.chainTracker.blockChain(chainId, reason, blockedBy);
  }

  /**
   * Unblock a chain manually (Phase 2: Staged Queue)
   */
  unblockChain(chainId: string, unblockedBy: string): void {
    return this.chainTracker.unblockChain(chainId, unblockedBy);
  }

  /**
   * Resume a single blocked task manually.
   * Resets task to pending state while preserving phase progress.
   *
   * @param taskId - ID of the blocked task to resume
   * @param resumedBy - Identifier of who resumed the task (for audit trail)
   * @throws Error if task is not found or not in blocked status
   */
  resumeTask(taskId: string, resumedBy: string): void {
    return this.transaction(() => {
      const task = this.getTask(taskId);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (task.status !== 'blocked') {
        throw new Error(`Task ${taskId} is not blocked (current status: ${task.status})`);
      }

      const now = Date.now();
      const stmt = this.db.prepare(`
        UPDATE tasks
        SET status = 'pending',
            phase_status = 'ready',
            phase_attempts = 1,
            blocked_reason = NULL,
            blocked_at = NULL,
            blocked_by = NULL,
            resumed_by = ?,
            resumed_at = ?,
            notes = COALESCE(notes || '\n', '') || ?
        WHERE id = ?
      `);

      stmt.run(
        resumedBy,
        now,
        `[${new Date(now).toISOString()}] Task resumed by ${resumedBy}. Previous block reason: ${task.blocked_reason || 'none'}`,
        taskId
      );

      logger.info({
        category: 'process',
        action: 'task_resumed',
        message: `Task ${taskId} manually resumed by ${resumedBy}`,
        details: {
          taskId,
          resumedBy,
          previousBlockReason: task.blocked_reason,
          phaseIndex: task.phase_index,
          phaseName: task.phase_name,
          phaseAttempts: task.phase_attempts
        }
      });
    });
  }

  /**
   * Get all blocked chains (Phase 2: Staged Queue)
   */
  getBlockedChains() {
    return this.chainTracker.getBlockedChains();
  }

  // ==========================================================================
  // Phase Payload Methods (Context Preservation)
  // ==========================================================================

  /**
   * Get phase payload for a task.
   * Returns parsed JSON or empty object if not set.
   */
  getPhasePayload(taskId: string): PhasePayload {
    const task = this.getTask(taskId);
    if (!task || !task.phase_payload) {
      return {};
    }

    try {
      const payload = JSON.parse(task.phase_payload);
      return payload as PhasePayload;
    } catch (error) {
      logger.warn({
        category: 'database',
        action: 'phase_payload_parse_error',
        message: `Failed to parse phase_payload for task ${taskId}`,
        error
      });
      return {};
    }
  }

  /**
   * Update phase payload for a task.
   * Merges with existing payload, does not replace entirely.
   * This allows incremental updates to context while preserving other fields.
   */
  updatePhasePayload(taskId: string, payload: Partial<PhasePayload>): void {
    return this.transaction(() => {
      const existingPayload = this.getPhasePayload(taskId);
      const mergedPayload: PhasePayload = {
        ...existingPayload,
        ...payload,
        // Deep merge artifacts if both exist
        ...(existingPayload.artifacts && payload.artifacts
          ? {
              artifacts: {
                ...existingPayload.artifacts,
                ...payload.artifacts
              }
            }
          : {})
      };

      const stmt = this.db.prepare(`
        UPDATE tasks
        SET phase_payload = ?
        WHERE id = ?
      `);

      stmt.run(JSON.stringify(mergedPayload), taskId);

      logger.debug({
        category: 'database',
        action: 'phase_payload_updated',
        message: `Updated phase_payload for task ${taskId}`,
        details: {
          taskId,
          updatedFields: Object.keys(payload)
        }
      });
    });
  }

  /**
   * Clear phase payload for a task.
   * Called when task completes a phase or is reset.
   */
  clearPhasePayload(taskId: string): void {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET phase_payload = NULL
      WHERE id = ?
    `);

    stmt.run(taskId);

    logger.debug({
      category: 'database',
      action: 'phase_payload_cleared',
      message: `Cleared phase_payload for task ${taskId}`,
      details: { taskId }
    });
  }

  // ==========================================================================
  // Phase System Methods
  // ==========================================================================

  /**
   * Requeue a task for phase retry after validation failure.
   * Increments phase_attempts and resets to 'pending' status.
   */
  requeueTaskForPhaseRetry(taskId: string): void {
    this.transaction(() => {
      const task = this.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      const newAttempts = task.phase_attempts + 1;

      this.db.prepare(`
        UPDATE tasks
        SET status = 'pending',
            phase_status = 'ready',
            phase_attempts = ?,
            assigned_worker = NULL,
            assigned_at = NULL,
            started_at = NULL
        WHERE id = ?
      `).run(newAttempts, taskId);

      logger.info({
        category: 'phase',
        action: 'task_requeued_for_retry',
        message: `Task ${taskId} requeued for phase ${task.phase_index} retry (attempt ${newAttempts})`,
        details: {
          taskId,
          phaseIndex: task.phase_index,
          phaseName: task.phase_name,
          attempt: newAttempts,
        },
      });
    });
  }

  /**
   * Update task context/prompt with additional information from recovery.
   * Used when recovery suggests context_update category.
   */
  updateTaskContext(taskId: string, contextUpdate: string): void {
    this.transaction(() => {
      const task = this.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Append context update to existing prompt
      const updatedPrompt = `${task.prompt}\n\n## Recovery Context Update\n${contextUpdate}`;

      this.db.prepare(`
        UPDATE tasks
        SET prompt = ?
        WHERE id = ?
      `).run(updatedPrompt, taskId);

      logger.info({
        category: 'phase',
        action: 'task_context_updated',
        message: `Updated task ${taskId} context from recovery`,
        details: {
          taskId,
          contextUpdateLength: contextUpdate.length,
        },
      });
    });
  }

  // blockChain method removed - duplicate of the one at line 2387 which delegates to chainTracker

  /**
   * Get stage runs for a task (phase execution history)
   * Encapsulates database access - routes should call this instead of direct DB queries
   *
   * @param taskId Task ID
   * @returns Array of stage run records
   */
  getStageRuns(taskId: string): Array<{
    id: string;
    task_id: string;
    stage_index: number;
    stage_name: string;
    status: string;
    created_at: number;
    completed_at?: number;
    error_message?: string;
  }> {
    return this.db.prepare(`
      SELECT * FROM task_stage_runs
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(taskId) as Array<{
      id: string;
      task_id: string;
      stage_index: number;
      stage_name: string;
      status: string;
      created_at: number;
      completed_at?: number;
      error_message?: string;
    }>;
  }

  /**
   * Get phase execution history for a task
   * Returns detailed phase run information including artifacts
   *
   * @param taskId Task ID
   * @returns Array of phase run records with artifacts
   */
  getPhaseHistory(taskId: string): Array<{
    run_id: string;
    task_id: string;
    phase_index: number;
    phase_name: string;
    status: string;
    started_at: string;
    completed_at?: string;
    artifacts_blob?: string;
    validation_result?: string;
    error_message?: string;
  }> {
    return this.db.prepare(`
      SELECT * FROM phase_runs
      WHERE task_id = ?
      ORDER BY started_at DESC
    `).all(taskId) as Array<{
      run_id: string;
      task_id: string;
      phase_index: number;
      phase_name: string;
      status: string;
      started_at: string;
      completed_at?: string;
      artifacts_blob?: string;
      validation_result?: string;
      error_message?: string;
    }>;
  }

  /**
   * Get validation report for a task
   * Returns the latest validation report if it exists
   *
   * @param taskId Task ID
   * @returns Validation report or null if not found
   */
  getValidationReport(taskId: string): {
    task_id: string;
    report_data: string;
    created_at: number;
    pr_number?: number;
  } | null {
    const report = this.db.prepare(`
      SELECT * FROM validation_reports
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(taskId);

    return report as {
      task_id: string;
      report_data: string;
      created_at: number;
      pr_number?: number;
    } | null;
  }

  /**
   * Get phase logs for a task
   * Returns logs from specific phase execution
   *
   * @param taskId Task ID
   * @param phaseIndex Optional phase index to filter
   * @returns Array of log entries
   */
  getPhaseLogs(taskId: string, phaseIndex?: number): Array<{
    id: string;
    task_id: string;
    phase_index: number;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    timestamp: string;
    metadata?: string;
  }> {
    const query = phaseIndex !== undefined
      ? this.db.prepare(`
          SELECT * FROM phase_logs
          WHERE task_id = ? AND phase_index = ?
          ORDER BY timestamp DESC
        `)
      : this.db.prepare(`
          SELECT * FROM phase_logs
          WHERE task_id = ?
          ORDER BY timestamp DESC
        `);

    const logs = phaseIndex !== undefined
      ? query.all(taskId, phaseIndex)
      : query.all(taskId);

    return logs as Array<{
      id: string;
      task_id: string;
      phase_index: number;
      level: 'info' | 'warn' | 'error' | 'debug';
      message: string;
      timestamp: string;
      metadata?: string;
    }>;
  }

  // ============================================================
  // Phase Metrics Service Proxy Methods
  // ============================================================

  /**
   * Get comprehensive phase metrics
   * Proxies to PhaseMetricsService - routes should call this instead of accessing PhaseMetricsService directly
   * @returns Complete phase metrics snapshot (cached for 5 minutes)
   */
  getPhaseMetrics(): PhaseMetricsSnapshot {
    const metricsService = getPhaseMetricsService(this.db);
    return metricsService.getMetrics();
  }

  /**
   * Get metrics for a specific phase
   * Proxies to PhaseMetricsService - routes should call this instead of accessing PhaseMetricsService directly
   * @param phaseIndex Phase index (1-7)
   * @returns Phase statistics or null if not found
   */
  getPhaseSpecificMetrics(phaseIndex: number): PhaseStats | null {
    const metricsService = getPhaseMetricsService(this.db);
    return metricsService.getPhaseMetrics(phaseIndex);
  }

  /**
   * Clear the phase metrics cache
   * Proxies to PhaseMetricsService - routes should call this instead of accessing PhaseMetricsService directly
   * Forces fresh calculation on next metrics request
   */
  clearPhaseMetricsCache(): void {
    const metricsService = getPhaseMetricsService(this.db);
    metricsService.clearCache();
  }
}
