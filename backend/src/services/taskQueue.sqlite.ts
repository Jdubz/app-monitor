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

export type { ChainStats, BlockedChain };

export type {
  AgentMetrics,
  AgentTaskTypeBreakdown,
  AgentComparisonMetrics,
};
export { summarizeAgentComparisonMetrics };

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
  parent_initiative?: string; // Legacy field - use plan_id instead
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
  total: number;
  avg_completion_time_ms?: number;
  oldest_pending_age_ms?: number;
}

export class TaskQueueService {
  private db: Database.Database;
  private dbPath: string;
  private readonly taskClassifier: TaskClassifier; // Auto-classification (Phase 0.3)
  private readonly chainTracker: ChainTrackerService; // Chain lifecycle management (Phase 2)
  private readonly maxConcurrentChains: number; // Chain concurrency limit
  private readonly metricsService: TaskQueueMetricsService; // Metrics and analytics
  private taskCompletionCount = 0; // PR sync counter (event-driven trigger)
  private readonly PR_SYNC_THRESHOLD: number; // Every N task completions
  private prSyncService: { syncAllTrackedPRs: () => Promise<void> } | null = null; // PRSyncService (set after construction)

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.taskClassifier = new TaskClassifier();
    this.ensureDirectory();
    this.db = new Database(dbPath);
    this.initialize();
    
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
    // Note: New MigrationManager is available for use via CLI (npm run migrate)
    // For now, keeping inline migrations for stability during transition
    // TODO: Switch to MigrationManager once all SQL files are verified
    
    // Uncomment to enable automated migration system:
    // const migrationManager = new MigrationManager(this.db);
    // const result = await migrationManager.runMigrations();
    
    // Inline migrations for schema updates
    this.runLegacyMigrations();
  }

  private runLegacyMigrations(): void {
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
        ALTER TABLE tasks ADD COLUMN agent_type TEXT CHECK(agent_type IN ('claude', 'codex', 'gemini'));
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
    // DEPRECATED: Most of these columns (pr_url, pr_branch, pr_status, etc.) violate
    // the design principle "Any information available from GitHub should NOT be stored in our DB"
    // and will be removed in migration 013. Only pr_number (foreign key reference) will remain.
    const prColumns = ['pr_number', 'pr_url', 'pr_branch', 'pr_status', 'pr_checks_status', 'pr_review_status', 'pr_created_at', 'pr_merged_at'];
    const missingPrColumns = prColumns.filter(col => !columnNames.has(col));

    if (missingPrColumns.length > 0) {
      logger.info({
        category: 'process',
        action: 'adding_pr_workflow_columns',
        message: `Adding ${missingPrColumns.length} PR workflow columns to tasks table (DEPRECATED - will be removed in migration 013)`,
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

    // Migration 012: Add chain tracking columns (queue_stage removed - phase system only)
    const chainColumns = ['chain_id', 'chain_status', 'chain_depth', 'blocked_reason', 'blocked_at', 'blocked_by'];
    const missingChainColumns = chainColumns.filter(col => !columnNames.has(col));

    if (missingChainColumns.length > 0) {
      logger.info({
        category: 'process',
        action: 'adding_chain_columns',
        message: `Adding ${missingChainColumns.length} chain tracking columns`,
        details: { columns: missingChainColumns }
      });

      if (!columnNames.has('chain_id')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN chain_id TEXT;`);
      }
      if (!columnNames.has('chain_status')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN chain_status TEXT CHECK(chain_status IN ('pending', 'active', 'blocked', 'closed'));`);
      }
      if (!columnNames.has('chain_depth')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN chain_depth INTEGER DEFAULT 0;`);
      }
      if (!columnNames.has('blocked_reason')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;`);
      }
      if (!columnNames.has('blocked_at')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN blocked_at INTEGER;`);
      }
      if (!columnNames.has('blocked_by')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN blocked_by TEXT;`);
      }

      // Create indexes for chain queries
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id) WHERE chain_id IS NOT NULL;`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_chain_status ON tasks(chain_status) WHERE chain_status IS NOT NULL;`);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'Chain tracking columns added successfully'
      });
    }

    // Migration 013: Add phase system tracking columns
    const phaseColumns = ['phase_index', 'phase_name', 'phase_status', 'phase_attempts', 'phase_payload'];
    const missingPhaseColumns = phaseColumns.filter(col => !columnNames.has(col));

    if (missingPhaseColumns.length > 0) {
      logger.info({
        category: 'process',
        action: 'adding_phase_columns',
        message: `Adding ${missingPhaseColumns.length} phase system tracking columns`,
        details: { columns: missingPhaseColumns }
      });

      if (!columnNames.has('phase_index')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN phase_index INTEGER DEFAULT 1;`);
      }
      if (!columnNames.has('phase_name')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN phase_name TEXT;`);
      }
      if (!columnNames.has('phase_status')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN phase_status TEXT DEFAULT 'ready';`);
      }
      if (!columnNames.has('phase_attempts')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN phase_attempts INTEGER DEFAULT 1;`);
      }
      if (!columnNames.has('phase_payload')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN phase_payload TEXT;`);
      }

      // Create indexes for phase queries
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_phase_index ON tasks(phase_index) WHERE phase_index IS NOT NULL;`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_phase_status ON tasks(phase_status) WHERE phase_status IS NOT NULL;`);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'Phase system tracking columns added successfully'
      });
    }

    // Migration 020: Add context bundle fields (context management integration)
    const contextBundleColumns = ['context_bundle_id', 'context_cache_key', 'context_profiles', 'risk_level'];
    const missingContextBundleColumns = contextBundleColumns.filter(col => !columnNames.has(col));

    if (missingContextBundleColumns.length > 0) {
      logger.info({
        category: 'process',
        action: 'adding_context_bundle_columns',
        message: `Adding ${missingContextBundleColumns.length} context bundle columns for context management integration`,
        details: { columns: missingContextBundleColumns }
      });

      if (!columnNames.has('context_bundle_id')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN context_bundle_id TEXT;`);
      }
      if (!columnNames.has('context_cache_key')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN context_cache_key TEXT;`);
      }
      if (!columnNames.has('context_profiles')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN context_profiles TEXT;`); // JSON array
      }
      if (!columnNames.has('risk_level')) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN risk_level TEXT CHECK(risk_level IN ('minimal', 'low', 'medium', 'high'));`);
      }

      // Create indexes for context bundle lookups
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_context_bundle_id ON tasks(context_bundle_id) WHERE context_bundle_id IS NOT NULL;`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_context_cache_key ON tasks(context_cache_key) WHERE context_cache_key IS NOT NULL;`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_risk_level ON tasks(risk_level) WHERE risk_level IS NOT NULL;`);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'Context bundle columns added successfully for context management integration'
      });
    }

    // Migration 021: Create plans table (for in-memory databases and missing production tables)
    const plansTableExists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='plans'`).get();
    if (!plansTableExists) {
      logger.info({
        category: 'process',
        action: 'creating_plans_table',
        message: 'Creating plans table for plan management'
      });

      this.db.exec(`
        CREATE TABLE plans (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          markdown_ref TEXT,
          plan_type TEXT NOT NULL CHECK(plan_type IN ('feature', 'refactor', 'fix', 'investigation')),
          priority TEXT NOT NULL CHECK(priority IN ('p0', 'p1', 'p2', 'p3')),
          status TEXT NOT NULL CHECK(status IN ('planning', 'in_progress', 'blocked', 'completed', 'cancelled')),
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          completed_at INTEGER,
          cancelled_at INTEGER,
          created_by TEXT,
          assigned_to TEXT,
          success_criteria TEXT,
          scope_boundaries TEXT,
          estimated_effort_hours INTEGER,
          metadata TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
        CREATE INDEX IF NOT EXISTS idx_plans_priority ON plans(priority);
        CREATE INDEX IF NOT EXISTS idx_plans_type ON plans(plan_type);
        CREATE INDEX IF NOT EXISTS idx_plans_created_at ON plans(created_at);
        CREATE INDEX IF NOT EXISTS idx_plans_status_priority ON plans(status, priority);
      `);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'Plans table created successfully'
      });
    }

    // Migration 022: Create issues and issue_occurrences tables (for error tracking)
    const issuesTableExists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='issues'`).get();
    if (!issuesTableExists) {
      logger.info({
        category: 'process',
        action: 'creating_issues_tables',
        message: 'Creating issues and issue_occurrences tables for error tracking'
      });

      this.db.exec(`
        CREATE TABLE issues (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
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
          created INTEGER NOT NULL,
          resolved INTEGER,
          resolution TEXT,
          prNumber INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_status ON issues(status);
        CREATE INDEX IF NOT EXISTS idx_trace ON issues(traceId);
        CREATE INDEX IF NOT EXISTS idx_timestamp ON issues(timestamp);
        CREATE INDEX IF NOT EXISTS idx_fingerprint ON issues(fingerprint);
        CREATE INDEX IF NOT EXISTS idx_created ON issues(created);

        CREATE TABLE issue_occurrences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          issueId TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          sessionId TEXT,
          FOREIGN KEY (issueId) REFERENCES issues(id)
        );

        CREATE INDEX IF NOT EXISTS idx_occurrence_issue ON issue_occurrences(issueId);
        CREATE INDEX IF NOT EXISTS idx_occurrence_timestamp ON issue_occurrences(timestamp);
      `);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'Issues tables created successfully'
      });
    }

    // Migration 023: Create frontend_logs table (for frontend logging)
    const frontendLogsTableExists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='frontend_logs'`).get();
    if (!frontendLogsTableExists) {
      logger.info({
        category: 'process',
        action: 'creating_frontend_logs_table',
        message: 'Creating frontend_logs table for frontend logging'
      });

      this.db.exec(`
        CREATE TABLE frontend_logs (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          level TEXT NOT NULL CHECK(level IN ('trace', 'debug', 'info', 'warn', 'error', 'fatal')),
          message TEXT NOT NULL,
          scope TEXT,
          traceId TEXT,
          sessionId TEXT NOT NULL,
          route TEXT,
          userId TEXT,
          data TEXT,
          errorName TEXT,
          errorMessage TEXT,
          errorStack TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_frontend_logs_timestamp ON frontend_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_traceId ON frontend_logs(traceId);
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_sessionId ON frontend_logs(sessionId);
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_level ON frontend_logs(level);
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_session_time ON frontend_logs(sessionId, timestamp);
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_triage ON frontend_logs(timestamp, sessionId, traceId);
      `);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'Frontend logs table created successfully'
      });
    }

    // Migration 024: Create session_metadata table (for user session tracking)
    const sessionMetadataTableExists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='session_metadata'`).get();
    if (!sessionMetadataTableExists) {
      logger.info({
        category: 'process',
        action: 'creating_session_metadata_table',
        message: 'Creating session_metadata table for session tracking'
      });

      this.db.exec(`
        CREATE TABLE session_metadata (
          session_id TEXT PRIMARY KEY,
          user_agent TEXT NOT NULL,
          viewport_width INTEGER NOT NULL,
          viewport_height INTEGER NOT NULL,
          start_time INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_session_metadata_start_time ON session_metadata(start_time);
      `);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'Session metadata table created successfully'
      });
    }

    // Migration 025: Update existing workers with new heartbeat timeout
    // Only update if workers table exists and has old timeout value
    const workersTableExists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='workers'`).get();
    if (workersTableExists) {
      const workersNeedingUpdate = this.db.prepare(`SELECT COUNT(*) as count FROM workers WHERE heartbeat_timeout_ms < 90000 OR heartbeat_timeout_ms IS NULL`).get() as { count: number };
      
      if (workersNeedingUpdate.count > 0) {
        logger.info({
          category: 'process',
          action: 'updating_worker_heartbeat_timeouts',
          message: `Updating ${workersNeedingUpdate.count} worker(s) with new heartbeat timeout (30s -> 90s)`,
          details: { workers_to_update: workersNeedingUpdate.count }
        });

        this.db.exec(`
          UPDATE workers 
          SET heartbeat_timeout_ms = 90000 
          WHERE heartbeat_timeout_ms < 90000 OR heartbeat_timeout_ms IS NULL;
        `);

        logger.info({
          category: 'process',
          action: 'migration_complete',
          message: 'Worker heartbeat timeouts updated successfully'
        });
      }
    }

    // Migration 026: Create task_stage_runs table for phase system tracking
    const stageRunsTableExists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_stage_runs'`).get();
    if (!stageRunsTableExists) {
      logger.info({
        category: 'process',
        action: 'creating_task_stage_runs_table',
        message: 'Creating task_stage_runs table for phase system execution tracking'
      });

      this.db.exec(`
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
          exit_code INTEGER,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_task_stage_runs_task_id ON task_stage_runs(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_stage_runs_phase_index ON task_stage_runs(phase_index);
        CREATE INDEX IF NOT EXISTS idx_task_stage_runs_status ON task_stage_runs(status);
      `);

      logger.info({
        category: 'process',
        action: 'migration_complete',
        message: 'task_stage_runs table created successfully'
      });
    }
  }

  private createSchema(): void {
    // NOTE: In production, the tasks table is created by migrations (002_tasks_table.sql + 016_add_fingerprint_column.sql)
    // However, for tests and standalone usage, we need to create it here with a compatible schema
    // This table definition includes ALL columns from migrations to ensure compatibility
    
    this.db.exec(`
      -- Main tasks table (compatible with migrations schema)
      -- Includes columns from migrations: project, pr_number, pr_url, chain_id, chain_depth, etc.
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        documentation TEXT,
        notes TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout', 'assigned', 'active', 'retrying')),
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
        -- Migration 005 columns
        pr_number INTEGER,
        pr_url TEXT,
        pr_branch TEXT,
        pr_status TEXT,
        pr_checks_status TEXT,
        pr_review_status TEXT,
        pr_created_at TEXT,
        pr_merged_at TEXT,
        -- Migration 011 columns
        chain_id TEXT,
        chain_depth INTEGER,
        -- Migration 012 columns (queue_stage and original_task_id removed - phase system only)
        chain_status TEXT,
        -- Migration 013 columns (phase system)
        phase_index INTEGER DEFAULT 1,
        phase_name TEXT,
        phase_attempts INTEGER DEFAULT 1,
        -- Migration 020 columns (context management)
        context_bundle_id TEXT,
        context_cache_key TEXT,
        context_profiles TEXT,
        risk_level TEXT CHECK(risk_level IN ('minimal', 'low', 'medium', 'high'))
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
    const stmt = this.db.prepare('UPDATE workers SET last_heartbeat = ? WHERE id = ?');
    stmt.run(Date.now(), workerId);
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
      const HEARTBEAT_TIMEOUT_MS = 90000; // 90 seconds (increased from 30s to reduce false positives)
      const timeout = Date.now() - HEARTBEAT_TIMEOUT_MS;
      const now = Date.now();

      const stmt = this.db.prepare(`
        SELECT id, current_task_id, last_heartbeat
        FROM workers
        WHERE status = 'running'
        AND last_heartbeat < ?
      `);

      const stalledWorkers = stmt.all(timeout) as { id: string; current_task_id: string; last_heartbeat: number }[];

      for (const worker of stalledWorkers) {
        const timeSinceLastHeartbeat = now - worker.last_heartbeat;
        
        if (worker.current_task_id) {
          const updateTaskStmt = this.db.prepare(`
            UPDATE tasks
            SET status = 'failed',
                error = 'Worker heartbeat timeout',
                completed_at = ?
            WHERE id = ?
          `);

          updateTaskStmt.run(now, worker.current_task_id);
        }

        const updateWorkerStmt = this.db.prepare('UPDATE workers SET status = \'stopped\' WHERE id = ?');
        updateWorkerStmt.run(worker.id);

        logger.warn({
          category: 'process',
          action: 'stalled_worker_detected',
          message: `Worker ${worker.id} stalled (no heartbeat for ${Math.round(timeSinceLastHeartbeat / 1000)}s), marked task ${worker.current_task_id} as failed`,
          details: {
            workerId: worker.id,
            taskId: worker.current_task_id,
            lastHeartbeat: worker.last_heartbeat,
            timeSinceLastHeartbeat_ms: timeSinceLastHeartbeat,
            timeout_ms: HEARTBEAT_TIMEOUT_MS
          }
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
   * Get all blocked chains (Phase 2: Staged Queue)
   */
  getBlockedChains() {
    return this.chainTracker.getBlockedChains();
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

}
