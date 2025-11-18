/**
 * Tests for PhaseObservabilityService
 * 
 * Validates agent-first observability features:
 * - Task execution tracing
 * - Phase log querying
 * - Anomaly detection
 * - Diagnostic queries
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PhaseObservabilityService } from '../phaseObservability.service.js';

describe('PhaseObservabilityService', () => {
  let db: Database.Database;
  let service: PhaseObservabilityService;

  beforeEach(() => {
    db = new Database(':memory:');
    
    // Create minimal schema
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        phase_index INTEGER,
        phase_status TEXT,
        phase_attempts INTEGER
      );

      CREATE TABLE task_stage_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        phase_index INTEGER NOT NULL,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        validator_results TEXT,
        recovery_diagnosis TEXT,
        error TEXT
      );

      CREATE TABLE logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT
      );
    `);

    service = new PhaseObservabilityService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getTaskTrace', () => {
    it('should return null for non-existent task', () => {
      const trace = service.getTaskTrace('non-existent');
      expect(trace).toBeNull();
    });

    it('should return complete timeline for a task', () => {
      const taskId = 'task-123';
      const now = new Date().toISOString();
      const later = new Date(Date.now() + 5000).toISOString();

      db.prepare(`
        INSERT INTO tasks (id, type, status, created_at, completed_at, phase_index, phase_status, phase_attempts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(taskId, 'implementation', 'completed', now, later, 7, 'complete', 1);

      db.prepare(`
        INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, 1, 1, 'success', now, later);

      const trace = service.getTaskTrace(taskId);

      expect(trace).not.toBeNull();
      expect(trace?.taskId).toBe(taskId);
      expect(trace?.phases).toHaveLength(1);
      expect(trace?.phases[0].phaseName).toBe('Planning');
      expect(trace?.phases[0].status).toBe('success');
    });

    it('should detect loops in phase execution', () => {
      const taskId = 'looping-task';
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO tasks (id, type, status, created_at, phase_index, phase_status, phase_attempts)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(taskId, 'fix', 'running', now, 4, 'running', 3);

      // Simulate Phase 3↔4 loop
      db.prepare(`
        INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, 3, 1, 'success', now, now);
      
      db.prepare(`
        INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, 4, 1, 'failed', now, now);
      
      db.prepare(`
        INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, 3, 2, 'success', now, now);

      const trace = service.getTaskTrace(taskId);

      expect(trace?.loopCount).toBeGreaterThan(0);
    });

    it('should count recovery attempts', () => {
      const taskId = 'recovered-task';
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO tasks (id, type, status, created_at, phase_index)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, 'implementation', 'running', now, 2);

      db.prepare(`
        INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, recovery_diagnosis)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, 2, 1, 'recovered', now, JSON.stringify({ success: true, category: 'retry' }));

      db.prepare(`
        INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, recovery_diagnosis)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, 2, 2, 'recovered', now, JSON.stringify({ success: true, category: 'context_update' }));

      const trace = service.getTaskTrace(taskId);

      expect(trace?.recoveryCount).toBe(2);
    });

    it('should detect stuck tasks', () => {
      const taskId = 'stuck-task';
      const longAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

      db.prepare(`
        INSERT INTO tasks (id, type, status, created_at, phase_index, phase_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, 'implementation', 'running', longAgo, 2, 'running');

      db.prepare(`
        INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, 1, 1, 'success', longAgo, longAgo);

      const trace = service.getTaskTrace(taskId);

      expect(trace?.isStuck).toBe(true);
    });
  });

  describe('getPhaseLogs', () => {
    beforeEach(() => {
      // Create sample logs
      const taskId = 'task-logs';
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO tasks (id, type, status, created_at, phase_index)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, 'test', 'running', now, 3);

      db.prepare(`
        INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, 3, 1, 'running', now);

      db.prepare(`
        INSERT INTO logs (timestamp, level, category, action, message, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(now, 'info', 'phase', 'validation', 'Validating phase 3', JSON.stringify({ taskId }));
    });

    it('should query logs with filters', () => {
      const result = service.getPhaseLogs({
        level: 'info',
        limit: 10,
      });

      expect(result.logs.length).toBeGreaterThan(0);
      expect(result.total).toBe(result.logs.length);
    });

    it('should respect limit parameter', () => {
      const result = service.getPhaseLogs({
        limit: 1,
      });

      expect(result.logs.length).toBeLessThanOrEqual(1);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect stuck loops', () => {
      const taskId = 'looping-task';
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO tasks (id, type, status, created_at, phase_index)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, 'fix', 'running', now, 4);

      // Create 6 loop iterations
      for (let i = 0; i < 6; i++) {
        const phase = i % 2 === 0 ? 3 : 4;
        db.prepare(`
          INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(taskId, phase, i + 1, 'success', now, now);
      }

      const anomalies = service.detectAnomalies();

      const taskAnomaly = anomalies.tasks.find(t => t.taskId === taskId);
      expect(taskAnomaly).toBeDefined();
      expect(taskAnomaly?.anomalies.some(a => a.type === 'stuck_loop')).toBe(true);
    });

    it('should detect excessive recovery', () => {
      const taskId = 'recovery-heavy';
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO tasks (id, type, status, created_at, phase_index)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, 'implementation', 'running', now, 2);

      // Create 5 recovery attempts
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, recovery_diagnosis)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(taskId, 2, i + 1, 'recovered', now, JSON.stringify({ success: true, category: 'retry' }));
      }

      const anomalies = service.detectAnomalies();

      const taskAnomaly = anomalies.tasks.find(t => t.taskId === taskId);
      expect(taskAnomaly).toBeDefined();
      expect(taskAnomaly?.anomalies.some(a => a.type === 'excessive_recovery')).toBe(true);
    });

    it('should detect system-wide patterns', () => {
      const now = new Date().toISOString();

      // Create 4 tasks with stuck loops
      for (let i = 0; i < 4; i++) {
        const taskId = `stuck-${i}`;
        
        db.prepare(`
          INSERT INTO tasks (id, type, status, created_at, phase_index)
          VALUES (?, ?, ?, ?, ?)
        `).run(taskId, 'fix', 'running', now, 4);

        // Create loop iterations
        for (let j = 0; j < 6; j++) {
          const phase = j % 2 === 0 ? 3 : 4;
          db.prepare(`
            INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(taskId, phase, j + 1, 'success', now, now);
        }
      }

      const anomalies = service.detectAnomalies();

      expect(anomalies.systemPatterns.length).toBeGreaterThan(0);
      expect(anomalies.systemPatterns.some(p => p.type === 'widespread_stuck_loops')).toBe(true);
    });
  });

  describe('getDiagnosticQueries', () => {
    it('should return list of available queries', () => {
      const queries = service.getDiagnosticQueries();

      expect(queries.length).toBeGreaterThan(0);
      expect(queries.every(q => q.id && q.name && q.category)).toBe(true);
    });

    it('should include all expected query types', () => {
      const queries = service.getDiagnosticQueries();
      const ids = queries.map(q => q.id);

      expect(ids).toContain('slow_phases');
      expect(ids).toContain('high_failure_phases');
      expect(ids).toContain('loop_iterations');
      expect(ids).toContain('recovery_effectiveness');
      expect(ids).toContain('validation_patterns');
    });
  });

  describe('executeDiagnosticQuery', () => {
    it('should throw for unknown query', () => {
      expect(() => {
        service.executeDiagnosticQuery('unknown-query');
      }).toThrow('Unknown diagnostic query');
    });

    it('should execute slow_phases query', () => {
      const result = service.executeDiagnosticQuery('slow_phases');

      expect(result.query.id).toBe('slow_phases');
      expect(result.executedAt).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.summary).toBeDefined();
    });

    it('should execute loop_iterations query', () => {
      const taskId = 'looping';
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO tasks (id, type, status, created_at, phase_index)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, 'fix', 'running', now, 4);

      // Create loop
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(taskId, 3, i + 1, 'success', now, now);
      }

      const result = service.executeDiagnosticQuery('loop_iterations');

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.summary).toContain('tasks');
    });

    it('should execute recovery_effectiveness query', () => {
      const taskId = 'recovered';
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO tasks (id, type, status, created_at, phase_index)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, 'implementation', 'running', now, 2);

      db.prepare(`
        INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, recovery_diagnosis)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, 2, 1, 'recovered', now, JSON.stringify({
        success: true,
        category: 'retry',
        action: 'retry_phase'
      }));

      const result = service.executeDiagnosticQuery('recovery_effectiveness');

      expect(Array.isArray(result.results)).toBe(true);
      expect(result.summary).toBeDefined();
    });

    it('should provide recommendations for concerning patterns', () => {
      const now = new Date().toISOString();

      // Create many slow phases
      for (let i = 0; i < 15; i++) {
        const taskId = `slow-${i}`;
        const createdAt = new Date(Date.now() - 600000).toISOString(); // 10 min ago
        
        db.prepare(`
          INSERT INTO tasks (id, type, status, created_at, phase_index)
          VALUES (?, ?, ?, ?, ?)
        `).run(taskId, 'test', 'running', createdAt, 5);

        db.prepare(`
          INSERT INTO task_stage_runs (task_id, phase_index, attempt, status, created_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(taskId, 5, 1, 'success', createdAt, now);
      }

      const result = service.executeDiagnosticQuery('slow_phases');

      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});
