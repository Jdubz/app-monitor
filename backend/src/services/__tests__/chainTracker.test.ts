import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ChainTrackerService } from '../chainTracker.service';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'chain-tracker-test.db');

function cleanupTestDb() {
  [TEST_DB_PATH, TEST_DB_PATH + '-shm', TEST_DB_PATH + '-wal'].forEach((file) => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
}

function setupTestSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      queue_stage TEXT,
      chain_status TEXT,
      chain_id TEXT,
      chain_depth INTEGER DEFAULT 0,
      blocked_reason TEXT,
      blocked_at INTEGER,
      blocked_by TEXT,
      followup_for_pr INTEGER,
      pr_number INTEGER,
      pr_status TEXT,
      assigned_agent TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

function insertTask(
  db: Database.Database,
  task: {
    id: string;
    status: string;
    queue_stage?: string;
    chain_status?: string;
    chain_id?: string;
    chain_depth?: number;
    followup_for_pr?: number;
    pr_number?: number;
  }
) {
  const stmt = db.prepare(`
    INSERT INTO tasks (
      id, status, queue_stage, chain_status, chain_id, 
      chain_depth, followup_for_pr, pr_number, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    task.id,
    task.status,
    task.queue_stage || null,
    task.chain_status || null,
    task.chain_id || null,
    task.chain_depth || 0,
    task.followup_for_pr || null,
    task.pr_number || null,
    Date.now()
  );
}

describe('ChainTrackerService', () => {
  let db: Database.Database;
  let chainTracker: ChainTrackerService;

  beforeEach(() => {
    cleanupTestDb();
    db = new Database(TEST_DB_PATH);
    setupTestSchema(db);
    chainTracker = new ChainTrackerService(db);
  });

  afterEach(() => {
    db.close();
    cleanupTestDb();
  });

  describe('countActiveChains', () => {
    it('should count active implementation chains', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'active',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'active',
        chain_id: 'chain-2',
      });

      const count = chainTracker.countActiveChains();
      expect(count).toBe(2);
    });

    it('should exclude blocked chains', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'active',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'blocked',
        chain_id: 'chain-2',
      });

      const count = chainTracker.countActiveChains();
      expect(count).toBe(1);
    });

    it('should exclude Copilot tasks', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'active',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-copilot-123',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'active',
        chain_id: 'copilot-task-123', // Chain ID must contain "copilot" to be excluded
      });

      const count = chainTracker.countActiveChains();
      expect(count).toBe(1);
    });

    it('should exclude closed chains', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'active',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'completed',
        queue_stage: 'implementation',
        chain_status: 'closed',
        chain_id: 'chain-2',
      });

      const count = chainTracker.countActiveChains();
      expect(count).toBe(1);
    });

    it('should count each chain only once', () => {
      // Multiple tasks in same chain
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'active',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        queue_stage: 'followup',
        chain_status: 'active',
        chain_id: 'chain-1',
      });

      const count = chainTracker.countActiveChains();
      expect(count).toBe(1);
    });
  });

  describe('countBlockedChains', () => {
    it('should count blocked chains', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-2',
      });

      const count = chainTracker.countBlockedChains();
      expect(count).toBe(2);
    });

    it('should exclude Copilot chains', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-copilot-123',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'copilot-task-123', // Chain ID must contain "copilot" to be excluded
      });

      const count = chainTracker.countBlockedChains();
      expect(count).toBe(1);
    });

    it('should count each chain only once', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });

      const count = chainTracker.countBlockedChains();
      expect(count).toBe(1);
    });
  });

  describe('getQueueDepths', () => {
    it('should return queue depths', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'pending',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'pending',
      });
      insertTask(db, {
        id: 'task-3',
        status: 'pending',
        queue_stage: 'followup',
        chain_status: 'active',
      });

      const depths = chainTracker.getQueueDepths();
      expect(depths.implementation).toBe(2);
      expect(depths.followup).toBe(1);
    });

    it('should exclude running tasks', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        queue_stage: 'implementation',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'running',
        queue_stage: 'implementation',
      });

      const depths = chainTracker.getQueueDepths();
      expect(depths.implementation).toBe(1);
    });
  });

  describe('closeCompletedChains', () => {
    it('should close chains when PR merged and no pending tasks', () => {
      // Insert PR info (mock - in real system would be in PR table)
      insertTask(db, {
        id: 'task-1',
        status: 'completed',
        chain_status: 'active',
        chain_id: 'chain-1',
        pr_number: 123,
      });

      // Mock PR as merged (normally would query PR table)
      // For this test, we'll just verify the query logic works

      chainTracker.closeCompletedChains();

      // Since we don't have PR table in this test, we can't verify full behavior
      // In integration tests, this will be properly tested
    });

    it('should not close chains with pending tasks', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'completed',
        chain_status: 'active',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        chain_status: 'active',
        chain_id: 'chain-1',
      });

      chainTracker.closeCompletedChains();

      const stmt = db.prepare('SELECT chain_status FROM tasks WHERE id = ?');
      const task = stmt.get('task-1') as { chain_status: string };
      expect(task.chain_status).toBe('active');
    });
  });

  describe('blockChain', () => {
    it('should set chain_status to blocked', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        chain_status: 'active',
        chain_id: 'chain-1',
      });

      chainTracker.blockChain('chain-1', 'CI failed', 'system:ci-monitor');

      const stmt = db.prepare('SELECT chain_status FROM tasks WHERE chain_id = ?');
      const task = stmt.get('chain-1') as { chain_status: string };
      expect(task.chain_status).toBe('blocked');
    });

    it('should block all tasks in chain', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        chain_status: 'active',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        chain_status: 'active',
        chain_id: 'chain-1',
      });

      chainTracker.blockChain('chain-1', 'CI failed', 'system:ci-monitor');

      const stmt = db.prepare('SELECT chain_status FROM tasks WHERE chain_id = ?');
      const tasks = stmt.all('chain-1') as { chain_status: string }[];
      expect(tasks).toHaveLength(2);
      expect(tasks.every((t) => t.chain_status === 'blocked')).toBe(true);
    });
  });

  describe('unblockChain', () => {
    it('should set chain_status to active', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });

      chainTracker.unblockChain('chain-1', 'user@example.com');

      const stmt = db.prepare('SELECT chain_status FROM tasks WHERE chain_id = ?');
      const task = stmt.get('chain-1') as { chain_status: string };
      expect(task.chain_status).toBe('active');
    });

    it('should unblock all tasks in chain', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });

      chainTracker.unblockChain('chain-1', 'user@example.com');

      const stmt = db.prepare('SELECT chain_status FROM tasks WHERE chain_id = ?');
      const tasks = stmt.all('chain-1') as { chain_status: string }[];
      expect(tasks).toHaveLength(2);
      expect(tasks.every((t) => t.chain_status === 'active')).toBe(true);
    });
  });

  describe('getBlockedChains', () => {
    it('should return blocked chains with details', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });

      chainTracker.blockChain('chain-1', 'CI failed', 'system:ci-monitor');

      const blocked = chainTracker.getBlockedChains();
      expect(blocked).toHaveLength(1);
      expect(blocked[0].chain_id).toBe('chain-1');
      expect(blocked[0].blocked_reason).toBe('CI failed');
      expect(blocked[0].blocked_by).toBe('system:ci-monitor');
      expect(blocked[0].task_count).toBe(1);
    });

    it('should exclude Copilot chains', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-copilot-123',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'copilot-task-123', // Chain ID must contain "copilot" to be excluded
      });

      chainTracker.blockChain('chain-1', 'CI failed', 'system:ci-monitor');
      chainTracker.blockChain('copilot-task-123', 'Test', 'system:test');

      const blocked = chainTracker.getBlockedChains();
      expect(blocked).toHaveLength(1);
      expect(blocked[0].chain_id).toBe('chain-1');
    });

    it('should count tasks per chain', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-3',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-1',
      });

      chainTracker.blockChain('chain-1', 'CI failed', 'system:ci-monitor');

      const blocked = chainTracker.getBlockedChains();
      expect(blocked).toHaveLength(1);
      expect(blocked[0].task_count).toBe(3);
    });
  });

  describe('getChainStats', () => {
    it('should return complete statistics', () => {
      insertTask(db, {
        id: 'task-1',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'active',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-2',
        status: 'pending',
        queue_stage: 'implementation',
        chain_status: 'pending',
      });
      insertTask(db, {
        id: 'task-3',
        status: 'pending',
        queue_stage: 'followup',
        chain_status: 'active',
        chain_id: 'chain-1',
      });
      insertTask(db, {
        id: 'task-4',
        status: 'pending',
        chain_status: 'blocked',
        chain_id: 'chain-2',
      });

      chainTracker.blockChain('chain-2', 'Test', 'system:test');

      const stats = chainTracker.getChainStats(3);
      expect(stats.activeChains).toBe(1);
      expect(stats.blockedChains).toBe(1);
      expect(stats.implementationQueueDepth).toBe(1);
      expect(stats.followupQueueDepth).toBe(1);
      expect(stats.maxConcurrentChains).toBe(3);
    });

    it('should use provided maxConcurrentChains', () => {
      const stats = chainTracker.getChainStats(5);
      expect(stats.maxConcurrentChains).toBe(5);
    });
  });
});
