/**
 * Worker Lifecycle Service Unit Tests
 * 
 * Tests worker registration, heartbeats, and stalled worker detection.
 * Part of P1 refactoring plan - Week 2: Extract Worker Management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { WorkerLifecycleService } from '../WorkerLifecycleService.js';

describe('WorkerLifecycleService', () => {
  let db: Database.Database;
  let service: WorkerLifecycleService;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    
    // Create workers table
    db.exec(`
      CREATE TABLE workers (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('starting', 'running', 'stopping', 'stopped')),
        current_task_id TEXT,
        created_at INTEGER NOT NULL,
        last_heartbeat INTEGER NOT NULL,
        heartbeat_timeout_ms INTEGER DEFAULT 90000
      );

      CREATE INDEX idx_workers_status ON workers(status);
      CREATE INDEX idx_workers_last_heartbeat ON workers(last_heartbeat);
    `);

    service = new WorkerLifecycleService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('registerWorker', () => {
    it('should register a new worker', () => {
      const worker = service.registerWorker(
        'worker-1',
        'claude',
        'task-1'
      );

      expect(worker.id).toBe('worker-1');
      expect(worker.agent_id).toBe('claude');
      expect(worker.status).toBe('running');
      expect(worker.current_task_id).toBe('task-1');
      expect(worker.created_at).toBeDefined();
      expect(worker.last_heartbeat).toBeDefined();
      expect(worker.heartbeat_timeout_ms).toBe(90000);
    });

    it('should allow custom heartbeat timeout', () => {
      const worker = service.registerWorker(
        'worker-1',
        'claude',
        'task-1',
        { heartbeatTimeoutMs: 60000 }
      );

      expect(worker.heartbeat_timeout_ms).toBe(60000);
    });

    it('should store worker in database', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');

      const stmt = db.prepare('SELECT * FROM workers WHERE id = ?');
      const row = stmt.get('worker-1');

      expect(row).toBeDefined();
      expect(row).toHaveProperty('agent_id', 'claude');
    });
  });

  describe('updateHeartbeat', () => {
    it('should update worker heartbeat timestamp', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');
      
      const originalHeartbeat = service.getWorker('worker-1')!.last_heartbeat;
      
      // Wait a tiny bit to ensure timestamp changes
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      return delay(10).then(() => {
        service.updateHeartbeat('worker-1');
        
        const updatedHeartbeat = service.getWorker('worker-1')!.last_heartbeat;
        expect(updatedHeartbeat).toBeGreaterThan(originalHeartbeat);
      });
    });

    it('should handle non-existent worker gracefully', () => {
      // Should not throw
      expect(() => service.updateHeartbeat('non-existent')).not.toThrow();
    });
  });

  describe('getWorker', () => {
    it('should retrieve worker by ID', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');

      const worker = service.getWorker('worker-1');

      expect(worker).not.toBeNull();
      expect(worker?.id).toBe('worker-1');
      expect(worker?.agent_id).toBe('claude');
    });

    it('should return null for non-existent worker', () => {
      const worker = service.getWorker('non-existent');
      expect(worker).toBeNull();
    });
  });

  describe('getActiveWorkers', () => {
    it('should return all running workers', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');
      service.registerWorker('worker-2', 'codex', 'task-2');
      
      const activeWorkers = service.getActiveWorkers();

      expect(activeWorkers).toHaveLength(2);
      expect(activeWorkers.every(w => w.status === 'running')).toBe(true);
    });

    it('should not include stopped workers', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');
      service.registerWorker('worker-2', 'codex', 'task-2');
      
      service.stopWorker('worker-1');
      
      const activeWorkers = service.getActiveWorkers();

      expect(activeWorkers).toHaveLength(1);
      expect(activeWorkers[0].id).toBe('worker-2');
    });

    it('should return empty array when no active workers', () => {
      const activeWorkers = service.getActiveWorkers();
      expect(activeWorkers).toEqual([]);
    });
  });

  describe('getMetrics', () => {
    it('should return correct worker counts', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');
      service.registerWorker('worker-2', 'codex', 'task-2');
      service.stopWorker('worker-1');

      const metrics = service.getMetrics();

      expect(metrics.total).toBe(2);
      expect(metrics.running).toBe(1);
      expect(metrics.stopped).toBe(1);
    });

    it('should detect stalled workers in metrics', () => {
      // Register worker with old heartbeat
      const workerId = 'worker-1';
      service.registerWorker(workerId, 'claude', 'task-1');

      // Manually set old heartbeat (120 seconds ago)
      const oldHeartbeat = Date.now() - 120000;
      db.prepare('UPDATE workers SET last_heartbeat = ? WHERE id = ?')
        .run(oldHeartbeat, workerId);

      const metrics = service.getMetrics();

      expect(metrics.stalled).toBe(1);
    });
  });

  describe('detectStalledWorkers', () => {
    it('should detect workers with old heartbeats', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');
      service.registerWorker('worker-2', 'codex', 'task-2');

      // Make worker-1 stalled (120 seconds old heartbeat)
      const oldHeartbeat = Date.now() - 120000;
      db.prepare('UPDATE workers SET last_heartbeat = ? WHERE id = ?')
        .run(oldHeartbeat, 'worker-1');

      const stalledWorkers = service.detectStalledWorkers();

      expect(stalledWorkers).toHaveLength(1);
      expect(stalledWorkers[0].id).toBe('worker-1');
      expect(stalledWorkers[0].task_id).toBe('task-1');
      expect(stalledWorkers[0].time_since_heartbeat_ms).toBeGreaterThan(100000);
    });

    it('should not detect workers with recent heartbeats', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');
      service.updateHeartbeat('worker-1');

      const stalledWorkers = service.detectStalledWorkers();

      expect(stalledWorkers).toHaveLength(0);
    });

    it('should not detect stopped workers as stalled', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');
      
      // Set old heartbeat
      const oldHeartbeat = Date.now() - 120000;
      db.prepare('UPDATE workers SET last_heartbeat = ? WHERE id = ?')
        .run(oldHeartbeat, 'worker-1');
      
      // Stop the worker
      service.stopWorker('worker-1');

      const stalledWorkers = service.detectStalledWorkers();

      expect(stalledWorkers).toHaveLength(0);
    });
  });

  describe('stopWorker', () => {
    it('should mark worker as stopped', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');
      
      service.stopWorker('worker-1');

      const worker = service.getWorker('worker-1');
      expect(worker?.status).toBe('stopped');
    });
  });

  describe('handleStalledWorkers', () => {
    it('should stop stalled workers', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');

      // Make worker stalled
      const oldHeartbeat = Date.now() - 120000;
      db.prepare('UPDATE workers SET last_heartbeat = ? WHERE id = ?')
        .run(oldHeartbeat, 'worker-1');

      const stalledWorkers = service.handleStalledWorkers();

      expect(stalledWorkers).toHaveLength(1);
      expect(stalledWorkers[0].id).toBe('worker-1');

      // Verify worker is stopped
      const worker = service.getWorker('worker-1');
      expect(worker?.status).toBe('stopped');
    });

    it('should handle multiple stalled workers', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');
      service.registerWorker('worker-2', 'codex', 'task-2');
      service.registerWorker('worker-3', 'gemini', 'task-3');

      // Make workers 1 and 2 stalled
      const oldHeartbeat = Date.now() - 120000;
      db.prepare('UPDATE workers SET last_heartbeat = ? WHERE id IN (?, ?)')
        .run(oldHeartbeat, 'worker-1', 'worker-2');

      const stalledWorkers = service.handleStalledWorkers();

      expect(stalledWorkers).toHaveLength(2);
      expect(stalledWorkers.map(w => w.id).sort()).toEqual(['worker-1', 'worker-2']);

      // Verify workers are stopped
      expect(service.getWorker('worker-1')?.status).toBe('stopped');
      expect(service.getWorker('worker-2')?.status).toBe('stopped');
      expect(service.getWorker('worker-3')?.status).toBe('running');
    });

    it('should return empty array when no stalled workers', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');

      const stalledWorkers = service.handleStalledWorkers();

      expect(stalledWorkers).toEqual([]);
    });
  });

  describe('clearAllWorkers', () => {
    it('should delete all worker records', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');
      service.registerWorker('worker-2', 'codex', 'task-2');

      service.clearAllWorkers();

      const workers = db.prepare('SELECT * FROM workers').all();
      expect(workers).toHaveLength(0);
    });
  });

  describe('cleanupOldWorkers', () => {
    it('should remove old stopped workers', () => {
      // Create worker with old timestamp
      const oldTimestamp = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago
      
      db.prepare(`
        INSERT INTO workers (id, agent_id, status, current_task_id, created_at, last_heartbeat)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('worker-old', 'claude', 'stopped', 'task-1', oldTimestamp, oldTimestamp);

      // Create recent worker
      service.registerWorker('worker-new', 'codex', 'task-2');
      service.stopWorker('worker-new');

      const count = service.cleanupOldWorkers(24 * 60 * 60 * 1000); // 24 hours

      expect(count).toBe(1);

      // Verify old worker removed, new worker remains
      expect(service.getWorker('worker-old')).toBeNull();
      expect(service.getWorker('worker-new')).not.toBeNull();
    });

    it('should not remove running workers', () => {
      // Create old running worker
      const oldTimestamp = Date.now() - (48 * 60 * 60 * 1000);
      
      db.prepare(`
        INSERT INTO workers (id, agent_id, status, current_task_id, created_at, last_heartbeat)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('worker-old', 'claude', 'running', 'task-1', oldTimestamp, Date.now());

      const count = service.cleanupOldWorkers(24 * 60 * 60 * 1000);

      expect(count).toBe(0);
      expect(service.getWorker('worker-old')).not.toBeNull();
    });

    it('should return 0 when no old workers to clean', () => {
      service.registerWorker('worker-1', 'claude', 'task-1');

      const count = service.cleanupOldWorkers();

      expect(count).toBe(0);
    });
  });

  describe('transaction', () => {
    it('should execute operations in a transaction', () => {
      const result = service.transaction(() => {
        service.registerWorker('worker-1', 'claude', 'task-1');
        service.registerWorker('worker-2', 'codex', 'task-2');
        return 'success';
      });

      expect(result).toBe('success');
      expect(service.getActiveWorkers()).toHaveLength(2);
    });

    it('should rollback on error', () => {
      expect(() => {
        service.transaction(() => {
          service.registerWorker('worker-1', 'claude', 'task-1');
          throw new Error('Rollback test');
        });
      }).toThrow('Rollback test');

      expect(service.getActiveWorkers()).toHaveLength(0);
    });
  });
});
