import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { TaskCreationContext } from '../types/taskContext.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'dev-bots.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

type TaskExecutionRow = {
  id: string;
  task_id: string;
  agent_id: string;
  model_provider: string | null;
  model_name: string | null;
  started_at: string;
  completed_at: string | null;
  status: string;
  token_input: number | null;
  token_output: number | null;
  complexity_estimated: number | null;
  complexity_actual: number | null;
  quality_score_completion: number;
  quality_score_code_quality: number;
  quality_score_test_coverage: number;
  quality_score_process: number;
  quality_score_efficiency: number;
  quality_score_overall: number;
  git_commit: string | null;
  output: string | null;
};

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
    this.db.pragma('journal_mode = WAL'); // Better concurrency
    this.initialize();
  }

  private initialize(): void {
    // Run migrations
    this.runMigrations();
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
        -- Task execution history
        CREATE TABLE task_executions (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          model_provider TEXT,
          model_name TEXT,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          status TEXT,
          token_input INTEGER,
          token_output INTEGER,
          complexity_estimated INTEGER,
          complexity_actual INTEGER,
          quality_score_completion INTEGER,
          quality_score_code_quality INTEGER,
          quality_score_test_coverage INTEGER,
          quality_score_process INTEGER,
          quality_score_efficiency INTEGER,
          quality_score_overall INTEGER,
          git_commit TEXT,
          output TEXT
        );

        CREATE INDEX idx_task_executions_task_id ON task_executions(task_id);
        CREATE INDEX idx_task_executions_agent_id ON task_executions(agent_id);
        CREATE INDEX idx_task_executions_completed_at ON task_executions(completed_at);

        -- Token usage tracking
        CREATE TABLE token_usage (
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
        CREATE TABLE experiments (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          hypothesis TEXT,
          status TEXT,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          results TEXT
        );

        -- Batch approvals
        CREATE TABLE batch_approvals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          approved_count INTEGER NOT NULL,
          executed_count INTEGER DEFAULT 0,
          started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status TEXT,
          paused_reason TEXT
        );

        -- Failure patterns
        CREATE TABLE failure_patterns (
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

    // Migration 002: Tasks Table
    this.applyMigration('002_tasks_table', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '002_tasks_table.sql'),
        'utf-8'
      ));
    });

    // Migration 004: Task Context & Automation Run Tracking
    this.applyMigration('004_task_context', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '004_task_context.sql'),
        'utf-8'
      ));
    });

    // Migration 005: PR-Based Workflow Support
    this.applyMigration('005_pr_workflow', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '005_pr_workflow.sql'),
        'utf-8'
      ));
    });

    // Migration 006: Quality Observations
    this.applyMigration('006_quality_observations', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '005_quality_observations.sql'),
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

    // Migration 010: PR Condition States for Self-Healing Workflow
    this.applyMigration('010_pr_condition_states', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '009_pr_condition_states.sql'),
        'utf-8'
      ));
    });
  }

  private applyMigration(name: string, migration: () => void): void {
    const applied = this.db.prepare(
      'SELECT 1 FROM migrations WHERE name = ?'
    ).get(name);

    if (!applied) {
      migration();
      this.db.prepare(
        'INSERT INTO migrations (name) VALUES (?)'
      ).run(name);
      console.log(`✅ Applied migration: ${name}`);
    }
  }

  // Task Executions
  recordTaskExecution(data: TaskExecution): void {
    this.db.prepare(`
      INSERT INTO task_executions (
        id, task_id, agent_id, model_provider, model_name,
        started_at, completed_at, status,
        token_input, token_output,
        complexity_estimated, complexity_actual,
        quality_score_completion, quality_score_code_quality,
        quality_score_test_coverage, quality_score_process,
        quality_score_efficiency, quality_score_overall,
        git_commit, output
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      data.id, data.taskId, data.agentId, data.modelProvider, data.modelName,
      data.startedAt, data.completedAt, data.status,
      data.tokenInput, data.tokenOutput,
      data.complexityEstimated, data.complexityActual,
      data.qualityScores.completion, data.qualityScores.codeQuality,
      data.qualityScores.testCoverage, data.qualityScores.process,
      data.qualityScores.efficiency, data.qualityScores.overall,
      data.gitCommit, data.output
    );
  }

  getTaskExecution(id: string): TaskExecution | undefined {
    const result = this.db.prepare(
      'SELECT * FROM task_executions WHERE id = ?'
    ).get(id);

    if (!result) return undefined;

    return this.mapToTaskExecution(result as TaskExecutionRow);
  }

  private mapToTaskExecution(row: TaskExecutionRow): TaskExecution {
    return {
      id: row.id,
      taskId: row.task_id,
      agentId: row.agent_id,
      modelProvider: row.model_provider ?? undefined,
      modelName: row.model_name ?? undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      status: row.status,
      tokenInput: row.token_input ?? undefined,
      tokenOutput: row.token_output ?? undefined,
      complexityEstimated: row.complexity_estimated ?? undefined,
      complexityActual: row.complexity_actual ?? undefined,
      qualityScores: {
        completion: row.quality_score_completion,
        codeQuality: row.quality_score_code_quality,
        testCoverage: row.quality_score_test_coverage,
        process: row.quality_score_process,
        efficiency: row.quality_score_efficiency,
        overall: row.quality_score_overall
      },
      gitCommit: row.git_commit ?? undefined,
      output: row.output ?? undefined
    };
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
    const result = this.db.prepare(`
      INSERT INTO quality_observations (
        task_id, pr_number, branch, timestamp,
        overall_score, quality_level, ready_for_merge,
        acceptance_criteria_observation,
        test_coverage_observation,
        scope_boundaries_observation,
        quality_gates_observation,
        improvement_opportunities,
        blockers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      observation.taskId,
      observation.prNumber || null,
      observation.branch || null,
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
      branch: row.branch,
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

  // Task Creation Context
  saveTaskCreationContext(taskId: string, context: TaskCreationContext): void {
    this.db.prepare(`
      UPDATE tasks
      SET context_json = ?
      WHERE id = ?
    `).run(
      this.serializeNullableJson(context),
      taskId
    );
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
export interface TaskExecution {
  id: string;
  taskId: string;
  agentId: string;
  modelProvider?: string;
  modelName?: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  tokenInput?: number;
  tokenOutput?: number;
  complexityEstimated?: number;
  complexityActual?: number;
  qualityScores: QualityScores;
  gitCommit?: string;
  output?: string;
}

export interface QualityScores {
  completion: number;
  codeQuality: number;
  testCoverage: number;
  process: number;
  efficiency: number;
  overall: number;
}

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
  branch?: string;
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
