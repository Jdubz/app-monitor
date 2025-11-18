/**
 * Phase Metrics Service Tests
 * 
 * Tests the PhaseMetricsService which provides aggregated metrics
 * and analytics for the 7-phase task processing system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PhaseMetricsService } from '../phaseMetrics.service.js';
import { PhaseOrchestratorService } from '../phaseOrchestrator.service.js';

describe('PhaseMetricsService', () => {
  let db: Database.Database;
  let service: PhaseMetricsService;
  let orchestrator: PhaseOrchestratorService;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');
    
    // Create tables
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER DEFAULT 5,
        created_at INTEGER NOT NULL,
        assigned_agent TEXT NOT NULL,
        can_retry BOOLEAN DEFAULT 1,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        timeout_ms INTEGER,
        phase_index INTEGER,
        phase_name TEXT,
        phase_status TEXT,
        phase_attempts INTEGER,
        phase_payload TEXT
      );

      CREATE TABLE task_stage_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        phase_index INTEGER NOT NULL,
        phase_name TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed', 'recovered', 'blocked')),
        artifacts_blob TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        recovery_diagnosis TEXT,
        exit_code INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
    `);

    service = new PhaseMetricsService(db);
    orchestrator = new PhaseOrchestratorService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getMetrics', () => {
    it('should return complete metrics snapshot', () => {
      const metrics = service.getMetrics();

      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('phaseStats');
      expect(metrics).toHaveProperty('loopStats');
      expect(metrics).toHaveProperty('recoveryStats');
      expect(metrics).toHaveProperty('activeTaskDistribution');

      expect(metrics.phaseStats).toHaveLength(7);
      expect(metrics.loopStats).toHaveLength(2); // Review/Fix loop + Test loop
    });

    it('should cache metrics for 5 minutes', () => {
      const metrics1 = service.getMetrics();
      const metrics2 = service.getMetrics();

      expect(metrics1.timestamp).toBe(metrics2.timestamp);
    });

    it('should return fresh metrics after cache clear', async () => {
      const metrics1 = service.getMetrics();
      service.clearCache();
      // Wait a tiny bit to ensure new timestamp
      await new Promise(resolve => setTimeout(resolve, 2));
      const metrics2 = service.getMetrics();

      expect(metrics1.timestamp).not.toBe(metrics2.timestamp);
    });
  });

  describe('calculatePhaseStats', () => {
    it('should calculate success rates correctly', () => {
      // Create tasks first
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO tasks (id, type, title, status, created_at, assigned_agent)
          VALUES ('task-${i}', 'test', 'Test ${i}', 'running', ${Date.now()}, 'agent-1')
        `).run();
      }

      // Add some stage runs for Phase 1
      for (let i = 0; i < 10; i++) {
        orchestrator.recordStageRun({
          task_id: `task-${i}`,
          phase_index: 1,
          phase_name: 'Planning',
          attempt: 1,
          status: i < 8 ? 'success' : 'failed',
          created_at: Date.now(),
          completed_at: Date.now() + 1000,
        });
      }

      const metrics = service.getMetrics();
      const phase1Stats = metrics.phaseStats.find(s => s.phaseIndex === 1);

      expect(phase1Stats).toBeDefined();
      expect(phase1Stats!.totalRuns).toBe(10);
      expect(phase1Stats!.successfulRuns).toBe(8);
      expect(phase1Stats!.failedRuns).toBe(2);
      expect(phase1Stats!.successRate).toBeCloseTo(0.8);
    });

    it('should calculate average durations correctly', () => {
      const now = Date.now();
      
      // Create tasks
      db.prepare(`
        INSERT INTO tasks (id, type, title, status, created_at, assigned_agent)
        VALUES ('task-1', 'test', 'Test 1', 'running', ${now}, 'agent-1'),
               ('task-2', 'test', 'Test 2', 'running', ${now}, 'agent-1')
      `).run();
      
      // Add stage runs with known durations
      orchestrator.recordStageRun({
        task_id: 'task-1',
        phase_index: 2,
        phase_name: 'Implementation',
        attempt: 1,
        status: 'success',
        created_at: now,
        completed_at: now + 5000, // 5 seconds
      });

      orchestrator.recordStageRun({
        task_id: 'task-2',
        phase_index: 2,
        phase_name: 'Implementation',
        attempt: 1,
        status: 'success',
        created_at: now,
        completed_at: now + 15000, // 15 seconds
      });

      const metrics = service.getMetrics();
      const phase2Stats = metrics.phaseStats.find(s => s.phaseIndex === 2);

      expect(phase2Stats).toBeDefined();
      expect(phase2Stats!.averageDurationMs).toBeCloseTo(10000); // Average of 5000 and 15000
      expect(phase2Stats!.minDurationMs).toBe(5000);
      expect(phase2Stats!.maxDurationMs).toBe(15000);
    });

    it('should handle phases with no runs', () => {
      const metrics = service.getMetrics();
      const phase7Stats = metrics.phaseStats.find(s => s.phaseIndex === 7);

      expect(phase7Stats).toBeDefined();
      expect(phase7Stats!.totalRuns).toBe(0);
      expect(phase7Stats!.successRate).toBe(0);
      expect(phase7Stats!.averageDurationMs).toBeNull();
    });
  });

  describe('calculateLoopStats', () => {
    it('should calculate Review/Fix loop statistics', () => {
      // Simulate a task going through Review/Fix loop
      const taskId = 'task-loop-1';
      
      // Create task first
      db.prepare(`
        INSERT INTO tasks (id, type, title, status, created_at, assigned_agent)
        VALUES ('${taskId}', 'test', 'Test Loop', 'running', ${Date.now()}, 'agent-1')
      `).run();
      
      // First review
      orchestrator.recordStageRun({
        task_id: taskId,
        phase_index: 3,
        phase_name: 'Review',
        attempt: 1,
        status: 'success',
        created_at: Date.now(),
        completed_at: Date.now() + 1000,
      });

      // First fix
      orchestrator.recordStageRun({
        task_id: taskId,
        phase_index: 4,
        phase_name: 'Fixes',
        attempt: 1,
        status: 'success',
        created_at: Date.now(),
        completed_at: Date.now() + 1000,
      });

      // Second review
      orchestrator.recordStageRun({
        task_id: taskId,
        phase_index: 3,
        phase_name: 'Review',
        attempt: 2,
        status: 'success',
        created_at: Date.now(),
        completed_at: Date.now() + 1000,
      });

      const metrics = service.getMetrics();
      const reviewFixLoop = metrics.loopStats.find(s => s.phaseIndex === 3);

      expect(reviewFixLoop).toBeDefined();
      expect(reviewFixLoop!.totalLoops).toBe(1); // One task with loop
      expect(reviewFixLoop!.maxIterations).toBeGreaterThan(1);
    });

    it('should calculate Test loop statistics', () => {
      const taskId = 'task-test-loop';
      
      // Create task first
      db.prepare(`
        INSERT INTO tasks (id, type, title, status, created_at, assigned_agent)
        VALUES ('${taskId}', 'test', 'Test Loop', 'running', ${Date.now()}, 'agent-1')
      `).run();
      
      // Multiple attempts in Phase 5
      for (let attempt = 1; attempt <= 3; attempt++) {
        orchestrator.recordStageRun({
          task_id: taskId,
          phase_index: 5,
          phase_name: 'Test & Validate',
          attempt,
          status: attempt < 3 ? 'failed' : 'success',
          created_at: Date.now(),
          completed_at: Date.now() + 1000,
        });
      }

      const metrics = service.getMetrics();
      const testLoop = metrics.loopStats.find(s => s.phaseIndex === 5);

      expect(testLoop).toBeDefined();
      expect(testLoop!.totalLoops).toBe(1);
      expect(testLoop!.maxIterations).toBe(3);
    });

    it('should identify tasks exceeding attempt limits', () => {
      const taskId = 'task-exceed-limit';
      
      // Create task first
      db.prepare(`
        INSERT INTO tasks (id, type, title, status, created_at, assigned_agent)
        VALUES ('${taskId}', 'test', 'Test Exceed', 'running', ${Date.now()}, 'agent-1')
      `).run();
      
      // 4 attempts (at the limit)
      for (let attempt = 1; attempt <= 4; attempt++) {
        orchestrator.recordStageRun({
          task_id: taskId,
          phase_index: 5,
          phase_name: 'Test & Validate',
          attempt,
          status: 'failed',
          created_at: Date.now(),
          completed_at: Date.now() + 1000,
        });
      }

      const metrics = service.getMetrics();
      const testLoop = metrics.loopStats.find(s => s.phaseIndex === 5);

      expect(testLoop!.tasksExceedingLimit).toBe(1);
    });
  });

  describe('calculateRecoveryStats', () => {
    it('should count recovery attempts by category', () => {
      // Create tasks first
      db.prepare(`
        INSERT INTO tasks (id, type, title, status, created_at, assigned_agent)
        VALUES ('task-1', 'test', 'Test 1', 'running', ${Date.now()}, 'agent-1'),
               ('task-2', 'test', 'Test 2', 'running', ${Date.now()}, 'agent-1')
      `).run();

      // Add recovery attempts with different categories
      orchestrator.recordStageRun({
        task_id: 'task-1',
        phase_index: 2,
        phase_name: 'Implementation',
        attempt: 1,
        status: 'failed',
        created_at: Date.now(),
        completed_at: Date.now() + 1000,
        recovery_diagnosis: JSON.stringify({
          category: 'retry',
          success: true,
          diagnosis: 'Network timeout',
        }),
      });

      orchestrator.recordStageRun({
        task_id: 'task-2',
        phase_index: 3,
        phase_name: 'Review',
        attempt: 1,
        status: 'failed',
        created_at: Date.now(),
        completed_at: Date.now() + 1000,
        recovery_diagnosis: JSON.stringify({
          category: 'context_update',
          success: false,
          diagnosis: 'Missing context',
        }),
      });

      const metrics = service.getMetrics();
      const recoveryStats = metrics.recoveryStats;

      expect(recoveryStats.totalRecoveryAttempts).toBe(2);
      expect(recoveryStats.successfulRecoveries).toBe(1);
      expect(recoveryStats.failedRecoveries).toBe(1);
      expect(recoveryStats.categoryCounts.retry).toBe(1);
      expect(recoveryStats.categoryCounts.context_update).toBe(1);
    });

    it('should calculate recovery success rate', () => {
      // Create tasks first
      const tasks = [];
      for (let i = 0; i < 10; i++) {
        tasks.push(`('task-${i}', 'test', 'Test ${i}', 'running', ${Date.now()}, 'agent-1')`);
      }
      db.prepare(`INSERT INTO tasks (id, type, title, status, created_at, assigned_agent) VALUES ${tasks.join(', ')}`).run();

      // Add 10 recovery attempts, 7 successful
      for (let i = 0; i < 10; i++) {
        orchestrator.recordStageRun({
          task_id: `task-${i}`,
          phase_index: 3,
          phase_name: 'Review',
          attempt: 1,
          status: 'failed',
          created_at: Date.now(),
          completed_at: Date.now() + 1000,
          recovery_diagnosis: JSON.stringify({
            category: 'retry',
            success: i < 7,
            diagnosis: 'Test recovery',
          }),
        });
      }

      const metrics = service.getMetrics();
      expect(metrics.recoveryStats.recoverySuccessRate).toBeCloseTo(0.7);
    });
  });

  describe('getActiveTaskDistribution', () => {
    it('should count tasks by phase', () => {
      // Create tasks in different phases
      db.prepare(`
        INSERT INTO tasks (id, type, title, status, created_at, assigned_agent, phase_index)
        VALUES 
          ('task-1', 'test', 'Task 1', 'pending', ${Date.now()}, 'agent-1', 1),
          ('task-2', 'test', 'Task 2', 'pending', ${Date.now()}, 'agent-1', 1),
          ('task-3', 'test', 'Task 3', 'running', ${Date.now()}, 'agent-1', 3),
          ('task-4', 'test', 'Task 4', 'running', ${Date.now()}, 'agent-1', 5),
          ('task-5', 'test', 'Task 5', 'completed', ${Date.now()}, 'agent-1', 7)
      `).run();

      const metrics = service.getMetrics();
      const distribution = metrics.activeTaskDistribution;

      expect(distribution.phase1).toBe(2);
      expect(distribution.phase3).toBe(1);
      expect(distribution.phase5).toBe(1);
      expect(distribution.phase7).toBe(0); // Completed tasks not counted
      expect(distribution.total).toBe(4);
    });
  });

  describe('getPhaseMetrics', () => {
    it('should return metrics for specific phase', () => {
      // Create task first
      db.prepare(`
        INSERT INTO tasks (id, type, title, status, created_at, assigned_agent)
        VALUES ('task-1', 'test', 'Test 1', 'running', ${Date.now()}, 'agent-1')
      `).run();

      // Add some data for Phase 2
      orchestrator.recordStageRun({
        task_id: 'task-1',
        phase_index: 2,
        phase_name: 'Implementation',
        attempt: 1,
        status: 'success',
        created_at: Date.now(),
        completed_at: Date.now() + 1000,
      });

      const phase2Metrics = service.getPhaseMetrics(2);

      expect(phase2Metrics).toBeDefined();
      expect(phase2Metrics!.phaseIndex).toBe(2);
      expect(phase2Metrics!.phaseName).toBe('Implementation');
      expect(phase2Metrics!.totalRuns).toBe(1);
    });

    it('should return null for invalid phase index', () => {
      const invalidMetrics = service.getPhaseMetrics(10);
      expect(invalidMetrics).toBeNull();
    });
  });
});
