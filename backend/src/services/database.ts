import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'dev-bots.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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

    // Migration 004: Task Context & Automation Run Tracking
    this.applyMigration('004_task_context', () => {
      this.db.exec(fs.readFileSync(
        path.join(__dirname, '..', '..', 'migrations', '004_task_context.sql'),
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

    return this.mapToTaskExecution(result as any);
  }

  private mapToTaskExecution(row: any): TaskExecution {
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

    return result as TokenUsageStats;
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

    return this.mapToBatchApproval(result as any);
  }

  getCurrentBatch(): BatchApproval | undefined {
    const result = this.db.prepare(
      'SELECT * FROM batch_approvals WHERE status = ? ORDER BY id DESC LIMIT 1'
    ).get('active');

    if (!result) return undefined;

    return this.mapToBatchApproval(result as any);
  }

  private mapToBatchApproval(row: any): BatchApproval {
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
    ).all(taskId);

    return results.map((row: any) => ({
      id: row.id,
      taskId: row.task_id,
      category: row.category,
      pattern: row.pattern,
      timestamp: row.timestamp,
      resolved: Boolean(row.resolved)
    }));
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
