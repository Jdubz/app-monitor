import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use app-monitor.db (consolidated database)
// Support DATABASE_PATH env var for flexibility across environments
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'app-monitor.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}



type BatchApprovalRow = {
  id: number;
  approved_count: number;
  executed_count: number;
  started_at: string;
  status: string;
  paused_reason: string | null;
};

type FailurePatternRow = {
  id: number;
  task_id: string;
  category: string;
  pattern: string;
  timestamp: string;
  resolved: 0 | 1;
};

type TokenUsageStatsRow = {
  total_input: number | null;
  total_output: number | null;
  request_count: number | null;
};

type InteractiveSessionRow = {
  id: string;
  owner_email: string;
  model_provider: string;
  model_name: string;
  status: string;
  container_id: string | null;
  started_at: string;
  last_user_activity_at: string | null;
  last_agent_activity_at: string | null;
  ended_at: string | null;
  termination_reason: string | null;
  context_snapshot: string | null;
  log_path: string | null;
  metadata: string | null;
  updated_at: string;
};

export class DevBotsDatabase {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    this.db = new Database(dbPath);
    // WAL mode doesn't work with in-memory databases
    if (dbPath !== ':memory:') {
      this.db.pragma('journal_mode = WAL'); // Better concurrency
    }
    this.initialize();
  }

  /**
   * Get the underlying better-sqlite3 database instance.
   * Used by services that need direct database access.
   */
  getDb(): Database.Database {
    return this.db;
  }

  private initialize(): void {
    // Run migrations
    this.runMigrations();
    
    // Validate database integrity after migrations
    this.validateDatabaseIntegrity();
  }

  private runMigrations(): void {
    // Migration tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Apply migrations in order
    this.applyMigration('001_initial_schema', () => {
      this.db.exec(`
        -- NOTE: task_executions table is created by TaskQueueService, not here.
        -- CRITICAL: TaskQueueService must initialize BEFORE DevBotsDatabase.
        -- The factory (devBotsManager.factory.ts) ensures this initialization order.
        --
        -- TaskQueueService owns: tasks, task_executions, workers
        -- DevBotsDatabase owns: token_usage, experiments, batch_approvals, failure_patterns

        -- Token usage tracking
        CREATE TABLE IF NOT EXISTS token_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          task_id TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          cost_estimate REAL
        );

        CREATE INDEX idx_token_usage_timestamp ON token_usage(timestamp);
        CREATE INDEX idx_token_usage_provider ON token_usage(provider);

        -- Experiments
        CREATE TABLE IF NOT EXISTS experiments (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          hypothesis TEXT,
          status TEXT,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          results TEXT
        );

        -- Batch approvals
        CREATE TABLE IF NOT EXISTS batch_approvals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          approved_count INTEGER NOT NULL,
          executed_count INTEGER DEFAULT 0,
          started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status TEXT,
          paused_reason TEXT
        );

        -- Failure patterns
        CREATE TABLE IF NOT EXISTS failure_patterns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT NOT NULL,
          category TEXT NOT NULL,
          pattern TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved BOOLEAN DEFAULT 0
        );

        CREATE INDEX idx_failure_patterns_task_id ON failure_patterns(task_id);
        CREATE INDEX idx_failure_patterns_category ON failure_patterns(category);
      `);
    });

    // Migration 002: Tasks Table - SKIPPED
    // TaskQueueService.createSchema() creates the tasks table with complete schema.
    // This migration is documented but not applied to avoid conflicts.
    // See DATABASE_SCHEMA_ALIGNMENT_COMPLETE.md for architecture details.
    this.skipMigration('002_tasks_table');

    // Migration 004: Task Context & Automation Run Tracking
    this.applyMigration('004_task_context', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '004_task_context.sql'),
        'utf-8'
      ));
    });

    // Migration 005: PR Workflow - SKIPPED
    // TaskQueueService.runMigrations() adds these columns (pr_number, pr_url, etc.)
    this.skipMigration('005_pr_workflow');

    // Migration 006: Quality Observations
    this.applyMigration('006_quality_observations', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '006_quality_observations.sql'),
        'utf-8'
      ));
    });

    // Migration 007: Interactive Sessions Support
    this.applyMigration('007_interactive_sessions', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '007_interactive_sessions.sql'),
        'utf-8'
      ));
    });

    // Migration 008: PR Review Comments Tracking
    this.applyMigration('008_pr_review_comments', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '008_pr_review_comments.sql'),
        'utf-8'
      ));
    });

    // Migration 009: Task Context Storage
    this.applyMigration('009_task_context_storage', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '009_task_context_storage.sql'),
        'utf-8'
      ));
    });

    // Migration 010: PR Condition States
    // APPLIES: Creates pr_condition_states, retry_history, etc. (not tasks table)
    this.applyMigration('010_pr_condition_states', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '010_pr_condition_states.sql'),
        'utf-8'
      ));
    });

    // Migration 011: Add Chain Tracking - SKIPPED
    // TaskQueueService.createSchema() includes chain_id and chain_depth columns
    this.skipMigration('011_add_chain_tracking');

    // Migrations 012-016: Schema Unification - ALL SKIPPED
    // TaskQueueService.createSchema() handles all task table schema:
    // - Migration 012: Staged queue columns (queue_stage, chain_status, etc.)
    // - Migrations 013-015: Column removals (pr_url, pr_branch, etc.)
    // - Migration 016: Fingerprint column
    // TaskQueueService.runMigrations() applies these internally
    this.skipMigration('012_staged_queue');
    this.skipMigration('013_remove_duplicate_pr_columns');
    this.skipMigration('014_slim_pr_review_comments');
    this.skipMigration('015_clean_quality_observations');
    this.skipMigration('016_add_fingerprint_column');

    // Migration 017: Schema Alignment Marker
    this.applyMigration('017_align_with_taskqueue', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '017_align_with_taskqueue.sql'),
        'utf-8'
      ));
    });

    // Migration 019: Context Bundle Cache
    // Note: Migration 018 was skipped (never created)
    this.applyMigration('019_context_bundle_cache', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '019_context_bundle_cache.sql'),
        'utf-8'
      ));
    });

    // Migration 020: Add Context Bundle Fields to Tasks
    // Note: This adds columns to tasks table but TaskQueueService handles via inline migration
    // We mark it as applied here to track in migrations table
    this.skipMigration('020_add_context_bundle_fields');

    // Migration 021: Plans Table
    // Creates plans table and adds plan_id column to tasks (if tasks table exists)
    this.applyMigration('021_plans_table', () => {
      // Create plans table (inline for in-memory database compatibility)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS plans (
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

      // Add plan_id column to tasks table if it exists
      // The tasks table is managed by TaskQueueService and may not exist in test contexts
      const tasksTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'
      `).get();

      if (tasksTableExists) {
        // Check if column already exists
        const columns = this.db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
        const hasPlanId = columns.some(col => col.name === 'plan_id');

        if (!hasPlanId) {
          this.db.exec('ALTER TABLE tasks ADD COLUMN plan_id TEXT');
          this.db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_plan_id ON tasks(plan_id) WHERE plan_id IS NOT NULL');
        }
      }
    });

    // Migration 022: Issues Table
    // Creates storage for user-reported issues and autonomous triage
    this.applyMigration('022_issues_table', () => {
      try {
        this.db.exec(fs.readFileSync(
          path.join(__dirname, '..', '..', 'migrations', '022_issues_table.sql'),
          'utf-8'
        ));
      } catch (_err) {
        // Fallback for in-memory or when file not accessible
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
    });

    // Migration 023: Frontend Logs Table
    // Creates storage for frontend log aggregation
    this.applyMigration('023_frontend_logs_table', () => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS frontend_logs (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
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
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_timestamp ON frontend_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_traceId ON frontend_logs(traceId);
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_sessionId ON frontend_logs(sessionId);
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_level ON frontend_logs(level);
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_session_time ON frontend_logs(sessionId, timestamp);
        CREATE INDEX IF NOT EXISTS idx_frontend_logs_triage ON frontend_logs(timestamp, sessionId, traceId);
      `);
    });

    // Migration 024: Session Metadata Table
    // Creates storage for session tracking metadata
    this.applyMigration('024_session_metadata_table', () => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS session_metadata (
          session_id TEXT PRIMARY KEY,
          user_agent TEXT NOT NULL,
          viewport_width INTEGER NOT NULL,
          viewport_height INTEGER NOT NULL,
          start_time TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_session_metadata_start_time ON session_metadata(start_time);
      `);
    });

    this.applyMigration('025_issues_screenshot_columns', () => {
      // Check if columns exist before adding them (idempotent migration)
      const tableInfo = this.db.prepare('PRAGMA table_info(issues)').all() as Array<{ name: string }>;
      const columnNames = tableInfo.map(col => col.name);

      if (!columnNames.includes('screenshot')) {
        this.db.exec('ALTER TABLE issues ADD COLUMN screenshot TEXT;');
      }

      if (!columnNames.includes('screenshot_error')) {
        this.db.exec('ALTER TABLE issues ADD COLUMN screenshot_error TEXT;');
      }

      if (!columnNames.includes('meta')) {
        this.db.exec('ALTER TABLE issues ADD COLUMN meta TEXT;');
      }
    });
  }

  /**
   * Marks a migration as applied without executing it.
   * 
   * Used when migrations are handled by TaskQueueService to avoid duplication.
   * This establishes clear ownership boundaries: TaskQueueService manages core
   * task tables (tasks, workers, task_executions), while DevBotsDatabase manages 
   * supplementary analytics tables (quality, PR workflow, context).
   * 
   * **Critical**: TaskQueueService MUST be initialized BEFORE DevBotsDatabase.
   * The factory (devBotsManager.factory.ts) ensures this initialization order.
   * 
   * **Initialization Order**:
   * 1. TaskQueueService.createSchema() creates tasks, workers, task_executions
   * 2. DevBotsDatabase.runMigrations() creates supplementary tables
   * 3. DevBotsDatabase.validateDatabaseIntegrity() verifies only its tables
   * 
   * @param name - Migration name (e.g., '002_tasks_table')
   * @throws {Error} If database operation fails
   */
  private skipMigration(name: string): void {
    try {
      let applied;
      try {
        applied = this.db.prepare(
          'SELECT 1 FROM migrations WHERE name = ?'
        ).get(name);
      } catch (_err: unknown) {
        // If the migrations table does not exist, create it
        const errorMsg = _err instanceof Error ? _err.message : String(_err);
        if (errorMsg.includes('no such table: migrations')) {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
              name TEXT PRIMARY KEY,
              applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
          applied = undefined;
        } else {
          throw _err;
        }
      }

      if (!applied) {
        this.db.prepare(
          'INSERT INTO migrations (name) VALUES (?)'
        ).run(name);
        
        logger.info({
          category: 'database',
          action: 'migration_delegated_to_taskqueue',
          message: `Migration ${name} delegated to TaskQueueService (not executed here)`,
          details: { migrationName: name }
        });
      }
    } catch (error: unknown) {
      logger.error({
        category: 'database',
        action: 'skip_migration_failed',
        message: `Failed to skip migration ${name}`,
        details: { error }
      });
      throw error;
    }
  }

  private applyMigration(name: string, migration: () => void): void {
    const applied = this.db.prepare(
      'SELECT 1 FROM migrations WHERE name = ?'
    ).get(name);

    if (!applied) {
      try {
        migration();
        this.db.prepare(
          'INSERT OR IGNORE INTO migrations (name) VALUES (?)'
        ).run(name);
        logger.info({
          category: 'database',
          action: 'migration_applied',
          message: `Applied migration: ${name}`,
          details: { migrationName: name }
        });
      } catch (error: unknown) {
        // Safety check: If migration fails due to "already exists", log warning but don't crash
        const sqliteError = error as { code?: string; message?: string };
        if (sqliteError.code === 'SQLITE_ERROR' && sqliteError.message?.includes('already exists')) {
          logger.warn({
            category: 'database',
            action: 'migration_already_exists',
            message: `Migration ${name} failed with "already exists" error. This indicates the migration tracking may be out of sync.`,
            details: { migrationName: name, errorMessage: sqliteError.message || 'Unknown error' }
          });
          logger.warn({
            category: 'database',
            action: 'migration_marking_applied',
            message: `Marking migration as applied to prevent future failures: ${name}`,
            details: { migrationName: name }
          });

          // Mark as applied to prevent retry loops
          this.db.prepare(
            'INSERT OR IGNORE INTO migrations (name) VALUES (?)'
          ).run(name);

          logger.info({
            category: 'database',
            action: 'migration_marked_applied',
            message: `Migration ${name} marked as applied (with warnings)`,
            details: { migrationName: name }
          });
        } else {
          // Re-throw other errors (these are real problems)
          logger.error({
            category: 'database',
            action: 'migration_failed',
            message: `Migration ${name} failed with unexpected error`,
            details: { migrationName: name, error }
          });
          throw error;
        }
      }
    }
  }

  /**
   * Validates database integrity after migrations
   * Ensures critical tables exist and have expected schema
   */
  private validateDatabaseIntegrity(): void {
    // Note: 'tasks', 'task_executions', 'workers' NOT in this list.
    // Those are created by TaskQueueService.createSchema().
    // DevBotsDatabase only validates tables it owns (supplementary tables).
    // TaskQueueService validates its own tables separately.
    const requiredTables = [
      'migrations',
      'token_usage',
      'experiments',
      'batch_approvals',
      'failure_patterns',
      'task_automation_runs'
    ];

    try {
      // Get list of all tables
      const tables = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all() as { name: string }[];
      
      const existingTables = new Set(tables.map(t => t.name));
      
      // Check for missing critical tables
      const missingTables = requiredTables.filter(table => !existingTables.has(table));
      
      if (missingTables.length > 0) {
        logger.error({
          category: 'database',
          action: 'integrity_check_failed',
          message: 'Database integrity check failed: Missing critical tables',
          details: { missingTables }
        });
        throw new Error(`Critical database tables missing: ${missingTables.join(', ')}`);
      }

      // Verify migrations table has entries
      const migrationCount = this.db.prepare(
        'SELECT COUNT(*) as count FROM migrations'
      ).get() as { count: number };

      if (migrationCount.count === 0) {
        logger.error({
          category: 'database',
          action: 'integrity_check_failed',
          message: 'Database integrity check failed: migrations table is empty',
          details: { migrationCount: migrationCount.count }
        });
        throw new Error('Database integrity check failed: migrations table is empty. This is unexpected after initialization.');
      }

      logger.info({
        category: 'database',
        action: 'integrity_validated',
        message: 'Database integrity validated',
        details: { tableCount: requiredTables.length, tables: requiredTables }
      });
    } catch (error: unknown) {
      logger.error({
        category: 'database',
        action: 'integrity_validation_failed',
        message: 'Database integrity validation failed',
        details: { error }
      });
      throw error;
    }
  }

  // Token Usage
  recordTokenUsage(data: TokenUsage): void {
    this.db.prepare(`
      INSERT INTO token_usage (
        provider, model, task_id, input_tokens, output_tokens, cost_estimate
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.provider, data.model, data.taskId,
      data.inputTokens, data.outputTokens, data.costEstimate
    );
  }

  getDailyTokenUsage(provider: string): TokenUsageStats {
    const today = new Date().toISOString().split('T')[0];
    const result = this.db.prepare(`
      SELECT
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        COUNT(*) as request_count
      FROM token_usage
      WHERE provider = ? AND DATE(timestamp) = ?
    `).get(provider, today);

    const stats = result as TokenUsageStatsRow | undefined;
    return {
      total_input: stats?.total_input ?? 0,
      total_output: stats?.total_output ?? 0,
      request_count: stats?.request_count ?? 0
    };
  }

  // Batch Approvals
  createBatchApproval(count: number): BatchApproval {
    const result = this.db.prepare(`
      INSERT INTO batch_approvals (approved_count, status)
      VALUES (?, 'active')
    `).run(count);

    return this.getBatchApproval(result.lastInsertRowid as number)!;
  }

  getBatchApproval(id: number): BatchApproval | undefined {
    const result = this.db.prepare(
      'SELECT * FROM batch_approvals WHERE id = ?'
    ).get(id);

    if (!result) return undefined;

    return this.mapToBatchApproval(result as BatchApprovalRow);
  }

  getCurrentBatch(): BatchApproval | undefined {
    const result = this.db.prepare(
      'SELECT * FROM batch_approvals WHERE status = ? ORDER BY id DESC LIMIT 1'
    ).get('active');

    if (!result) return undefined;

    return this.mapToBatchApproval(result as BatchApprovalRow);
  }

  private mapToBatchApproval(row: BatchApprovalRow): BatchApproval {
    return {
      id: row.id,
      approved_count: row.approved_count,
      executed_count: row.executed_count,
      started_at: row.started_at,
      status: row.status,
      paused_reason: row.paused_reason ?? undefined
    };
  }

  updateBatchExecution(id: number, executedCount: number): void {
    this.db.prepare(
      'UPDATE batch_approvals SET executed_count = ? WHERE id = ?'
    ).run(executedCount, id);
  }

  pauseBatch(id: number, reason: string): void {
    this.db.prepare(
      'UPDATE batch_approvals SET status = ?, paused_reason = ? WHERE id = ?'
    ).run('paused', reason, id);
  }

  // Failure Patterns
  recordFailurePattern(data: FailurePattern): void {
    this.db.prepare(`
      INSERT INTO failure_patterns (task_id, category, pattern)
      VALUES (?, ?, ?)
    `).run(data.taskId, data.category, data.pattern);
  }

  getFailurePatterns(taskId: string): FailurePattern[] {
    const results = this.db.prepare(
      'SELECT * FROM failure_patterns WHERE task_id = ?'
    ).all(taskId) as FailurePatternRow[];

    return results.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      category: row.category,
      pattern: row.pattern,
      timestamp: row.timestamp,
      resolved: Boolean(row.resolved)
    }));
  }

  // Quality Observations
  storeQualityObservation(observation: {
    taskId: string;
    prNumber?: number | null;
    branch?: string | null;
    timestamp: string;
    overallScore: number;
    qualityLevel: string;
    readyForMerge: boolean;
    observations: {
      acceptanceCriteria?: unknown;
      testCoverage?: unknown;
      scopeBoundaries?: unknown;
      qualityGates?: unknown;
    };
    improvementOpportunities: Array<unknown>;
    blockers: Array<unknown>;
  }): number {
    // NOTE: Branch names available from GitHub via pr_number, not stored here per design principle:
    // "Any information available from GitHub should NOT be stored in our DB"
    const result = this.db.prepare(`
      INSERT INTO quality_observations (
        task_id, pr_number, timestamp,
        overall_score, quality_level, ready_for_merge,
        acceptance_criteria_observation,
        test_coverage_observation,
        scope_boundaries_observation,
        quality_gates_observation,
        improvement_opportunities,
        blockers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      observation.taskId,
      observation.prNumber || null,
      observation.timestamp,
      observation.overallScore,
      observation.qualityLevel,
      observation.readyForMerge ? 1 : 0,
      observation.observations.acceptanceCriteria ? JSON.stringify(observation.observations.acceptanceCriteria) : null,
      observation.observations.testCoverage ? JSON.stringify(observation.observations.testCoverage) : null,
      observation.observations.scopeBoundaries ? JSON.stringify(observation.observations.scopeBoundaries) : null,
      observation.observations.qualityGates ? JSON.stringify(observation.observations.qualityGates) : null,
      JSON.stringify(observation.improvementOpportunities),
      JSON.stringify(observation.blockers)
    );

    return result.lastInsertRowid as number;
  }

  getQualityObservation(taskId: string): StoredQualityObservation | null {
    const row = this.db.prepare(`
      SELECT * FROM quality_observations
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(taskId) as StoredQualityObservation | undefined;

    if (!row) return null;

    return {
      id: row.id,
      task_id: row.task_id,
      pr_number: row.pr_number,
      timestamp: row.timestamp,
      overall_score: row.overall_score,
      quality_level: row.quality_level,
      ready_for_merge: Boolean(row.ready_for_merge),
      acceptance_criteria_observation: row.acceptance_criteria_observation,
      test_coverage_observation: row.test_coverage_observation,
      scope_boundaries_observation: row.scope_boundaries_observation,
      quality_gates_observation: row.quality_gates_observation,
      improvement_opportunities: row.improvement_opportunities,
      blockers: row.blockers,
      created_at: row.created_at
    };
  }

  getVerificationResult(taskId: string): {
    taskId: string;
    passed: boolean;
    overallScore: number;
    acceptanceCriteria: unknown | null;
    testCoverage: unknown | null;
    scopeBoundaries: unknown | null;
    recommendations: Array<string>;
    timestamp: string;
  } | null {
    // Compatibility method - returns quality observation as verification result
    const observation = this.getQualityObservation(taskId);
    if (!observation) return null;

    return {
      taskId: observation.task_id,
      passed: observation.ready_for_merge,
      overallScore: observation.overall_score,
      acceptanceCriteria: observation.acceptance_criteria_observation ?
        JSON.parse(observation.acceptance_criteria_observation) : null,
      testCoverage: observation.test_coverage_observation ?
        JSON.parse(observation.test_coverage_observation) : null,
      scopeBoundaries: observation.scope_boundaries_observation ?
        JSON.parse(observation.scope_boundaries_observation) : null,
      recommendations: observation.improvement_opportunities ?
        (JSON.parse(observation.improvement_opportunities) as Array<{ suggestedFix: string }>).map((o) => o.suggestedFix) : [],
      timestamp: observation.timestamp
    };
  }

  storeVerificationResult(result: {
    taskId: string;
    passed?: boolean;
    overallScore?: number;
    acceptanceCriteria?: unknown;
    testCoverage?: unknown;
    scopeBoundaries?: unknown;
    recommendations?: Array<string>;
    timestamp?: string;
  }): void {
    // Compatibility method - converts verification result to quality observation format
    const observation = {
      taskId: result.taskId,
      timestamp: result.timestamp || new Date().toISOString(),
      overallScore: result.overallScore || 0,
      qualityLevel: result.passed ? 'good' : 'needs-improvement',
      readyForMerge: result.passed || false,
      observations: {
        acceptanceCriteria: result.acceptanceCriteria,
        testCoverage: result.testCoverage,
        scopeBoundaries: result.scopeBoundaries
      },
      improvementOpportunities: result.recommendations?.map((r: string) => ({
        type: 'criteria',
        priority: 'medium',
        description: r,
        estimatedEffort: 15,
        complexity: 'moderate',
        automatable: false,
        suggestedFix: r
      })) || [],
      blockers: []
    };

    this.storeQualityObservation(observation);
  }

  // Interactive Sessions
  createInteractiveSession(session: NewInteractiveSession): void {
    this.db.prepare(`
      INSERT INTO interactive_sessions (
        id,
        owner_email,
        model_provider,
        model_name,
        status,
        container_id,
        started_at,
        last_user_activity_at,
        last_agent_activity_at,
        ended_at,
        termination_reason,
        context_snapshot,
        log_path,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.ownerEmail,
      session.modelProvider,
      session.modelName,
      session.status,
      session.containerId ?? null,
      session.startedAt ?? new Date().toISOString(),
      session.lastUserActivityAt ?? null,
      session.lastAgentActivityAt ?? null,
      session.endedAt ?? null,
      session.terminationReason ?? null,
      this.serializeNullableJson(session.contextSnapshot),
      session.logPath ?? null,
      this.serializeNullableJson(session.metadata)
    );
  }

  getInteractiveSessionById(id: string): InteractiveSessionRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM interactive_sessions WHERE id = ?
    `).get(id) as InteractiveSessionRow | undefined;

    if (!row) {
      return null;
    }
    return this.mapInteractiveSessionRow(row);
  }

  getActiveInteractiveSession(): InteractiveSessionRecord | null {
    const activeStatuses: InteractiveSessionStatus[] = ['starting', 'running', 'disconnecting', 'terminating'];
    const row = this.db.prepare(`
      SELECT *
      FROM interactive_sessions
      WHERE status IN (${activeStatuses.map(() => '?').join(', ')})
      ORDER BY started_at DESC
      LIMIT 1
    `).get(...activeStatuses) as InteractiveSessionRow | undefined;

    if (!row) {
      return null;
    }
    return this.mapInteractiveSessionRow(row);
  }

  listRecentInteractiveSessions(limit = 20): InteractiveSessionRecord[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM interactive_sessions
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit) as InteractiveSessionRow[];

    return rows.map((row) => this.mapInteractiveSessionRow(row));
  }

  updateInteractiveSession(id: string, updates: InteractiveSessionUpdate): void {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    const push = (clause: string, value: unknown) => {
      setClauses.push(`${clause} = ?`);
      values.push(value);
    };

    if ('status' in updates && updates.status) push('status', updates.status);
    if ('containerId' in updates) push('container_id', updates.containerId ?? null);
    if ('lastUserActivityAt' in updates) push('last_user_activity_at', updates.lastUserActivityAt ?? null);
    if ('lastAgentActivityAt' in updates) push('last_agent_activity_at', updates.lastAgentActivityAt ?? null);
    if ('endedAt' in updates) push('ended_at', updates.endedAt ?? null);
    if ('terminationReason' in updates) push('termination_reason', updates.terminationReason ?? null);
    if ('contextSnapshot' in updates) push('context_snapshot', this.serializeNullableJson(updates.contextSnapshot));
    if ('logPath' in updates) push('log_path', updates.logPath ?? null);
    if ('metadata' in updates) push('metadata', this.serializeNullableJson(updates.metadata));

    if (!setClauses.length) {
      return;
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    const sql = `
      UPDATE interactive_sessions
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `;
    values.push(id);
    this.db.prepare(sql).run(...values);
  }

  private mapInteractiveSessionRow(row: InteractiveSessionRow): InteractiveSessionRecord {
    return {
      id: row.id,
      ownerEmail: row.owner_email,
      modelProvider: row.model_provider,
      modelName: row.model_name,
      status: row.status as InteractiveSessionStatus,
      containerId: row.container_id ?? undefined,
      startedAt: row.started_at,
      lastUserActivityAt: row.last_user_activity_at ?? undefined,
      lastAgentActivityAt: row.last_agent_activity_at ?? undefined,
      endedAt: row.ended_at ?? undefined,
      terminationReason: row.termination_reason ?? undefined,
      contextSnapshot: this.parseNullableJson(row.context_snapshot),
      logPath: row.log_path ?? undefined,
      metadata: this.parseNullableJson<Record<string, unknown>>(row.metadata),
      updatedAt: row.updated_at
    };
  }

  private serializeNullableJson(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    return JSON.stringify(value);
  }

  private parseNullableJson<T = unknown>(value: string | null): T | undefined {
    if (!value) {
      return undefined;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  /**
   * Get direct database connection for advanced operations
   * Used by ShutdownStateManager for state persistence
   */
  getConnection(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

// Types
export interface TokenUsage {
  provider: string;
  model: string;
  taskId?: string;
  inputTokens: number;
  outputTokens: number;
  costEstimate?: number;
}

export interface TokenUsageStats {
  total_input: number;
  total_output: number;
  request_count: number;
}

export interface BatchApproval {
  id: number;
  approved_count: number;
  executed_count: number;
  started_at: string;
  status: string;
  paused_reason?: string;
}

export interface FailurePattern {
  id?: number;
  taskId: string;
  category: string;
  pattern: string;
  timestamp?: string;
  resolved?: boolean;
}

export interface StoredQualityObservation {
  id: number;
  task_id: string;
  pr_number?: number;
  timestamp: string;
  overall_score: number;
  quality_level: string;
  ready_for_merge: boolean;
  acceptance_criteria_observation?: string;
  test_coverage_observation?: string;
  scope_boundaries_observation?: string;
  quality_gates_observation?: string;
  improvement_opportunities?: string;
  blockers?: string;
  created_at: number;
}

export type InteractiveSessionStatus =
  | 'starting'
  | 'running'
  | 'disconnected'
  | 'disconnecting'
  | 'terminating'
  | 'ended'
  | 'error';

export interface InteractiveSessionRecord {
  id: string;
  ownerEmail: string;
  modelProvider: string;
  modelName: string;
  status: InteractiveSessionStatus;
  containerId?: string;
  startedAt: string;
  lastUserActivityAt?: string;
  lastAgentActivityAt?: string;
  endedAt?: string;
  terminationReason?: string;
  contextSnapshot?: unknown;
  logPath?: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

export interface NewInteractiveSession {
  id: string;
  ownerEmail: string;
  modelProvider: string;
  modelName: string;
  status: InteractiveSessionStatus;
  containerId?: string;
  startedAt?: string;
  lastUserActivityAt?: string;
  lastAgentActivityAt?: string;
  endedAt?: string;
  terminationReason?: string;
  contextSnapshot?: unknown;
  logPath?: string;
  metadata?: Record<string, unknown>;
}

export interface InteractiveSessionUpdate {
  status?: InteractiveSessionStatus;
  containerId?: string | null;
  lastUserActivityAt?: string | null;
  lastAgentActivityAt?: string | null;
  endedAt?: string | null;
  terminationReason?: string | null;
  contextSnapshot?: unknown;
  logPath?: string | null;
  metadata?: Record<string, unknown> | null;
}

// Singleton instance
let dbInstance: DevBotsDatabase | null = null;

export function getDatabase(): DevBotsDatabase {
  if (!dbInstance) {
    dbInstance = new DevBotsDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
