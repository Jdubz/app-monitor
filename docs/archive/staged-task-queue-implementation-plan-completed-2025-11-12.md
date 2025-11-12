# Staged Task Queue Implementation Plan

## Analysis Summary

### Current State Assessment

#### ✅ What Exists Today
1. **Chain Tracking Foundation**
   - Migration `011_add_chain_tracking.sql` adds `chain_id` and `chain_depth` columns
   - Columns are indexed: `idx_tasks_chain_id`
   - Used for PR fix chain depth limiting

2. **Task Queue Service (SQLite)**
   - Location: `backend/src/services/taskQueue.sqlite.ts`
   - FIFO queue with priority: `ORDER BY priority DESC, created_at ASC`
   - File conflict detection prevents parallel execution on same files
   - Worker heartbeat tracking for hung detection
   - Atomic task assignment with transactions

3. **Task Schema**
   - Core fields: `id`, `type`, `title`, `status`, `priority`, `assigned_agent`
   - Repair tracking: `is_repair_bot`, `original_task_id`, `repair_stage`
   - PR tracking: `pr_number`, `pr_url`, `pr_branch`, `pr_status`
   - Chain tracking: `chain_id`, `chain_depth` (from migration 011)
   - Follow-up tracking: `followup_for_pr`, `followup_tasks`

4. **Existing Chain Awareness**
   - Chain depth limiting in PR self-healing (max 4 reviews/fixes)
   - Follow-up task linking via `followup_for_pr`
   - Original task tracking via `original_task_id`

#### ❌ What's Missing (Per Design Document)
1. **`queue_stage` enum** - No separation between implementation and follow-up queues
2. **`chain_status`** - No tracking of active/blocked/closed chains
3. **Chain-aware scheduling** - Current FIFO doesn't respect concurrency limits
4. **Active chain counting** - No logic to count active chains
5. **Staged dequeue logic** - No distinction between starting new chains vs continuing existing ones
6. **Blocked chain exclusion** - No mechanism to exclude blocked chains from active count
7. **Chain completion detection** - No automatic chain closure on PR merge

### Gap Analysis: Design vs Master Intent

#### ✅ Alignments
1. **Chain Tracking**: Design aligns with master intent on chain depth limiting
2. **SQLite Authority**: Design correctly uses SQLite as single source of truth
3. **Transaction Safety**: Design preserves atomic operations
4. **Worker Heartbeats**: Design maintains existing heartbeat mechanism
5. **Manual Intervention**: Design provides UI controls per master intent

#### ⚠️ Clarifications Needed
1. **Copilot Delegation**: Master intent says delegated tasks "do not count toward bot concurrency limit"
   - Design doesn't mention this exception
   - Need to clarify if Copilot tasks are in followup queue or exempted entirely

2. **Blocked Chain Behavior**: Master intent says "temporarily cause activeChains > maxBots"
   - Design says blocked chains "do not count against concurrency cap"
   - Need consistent definition of what happens when chain is unblocked

3. **Follow-up Task Prioritization**: Design has "Open Question #1" about FIX vs REVIEW priority
   - Master intent doesn't specify priority within follow-up queue
   - Default to FIFO for now, can enhance later

#### 🔴 Critical Observations
1. **Implementation Definition**: What exactly is an "implementation task"?
   - Tasks with `type` in ['feature', 'bug-fix', 'refactor', 'infrastructure']?
   - Tasks without `original_task_id`?
   - Tasks not marked as `is_repair_bot`?
   - **Decision**: Use `original_task_id IS NULL` as the indicator

2. **Chain ID Assignment**: When is `chain_id` set?
   - Design says "The `id` of the implementation task"
   - But migration 011 doesn't set this automatically
   - **Decision**: Set `chain_id = id` for implementation tasks, inherit for follow-ups

3. **Chain Closure**: What triggers chain closure?
   - PR merge (per design)
   - All follow-up tasks completed (per design)
   - **Decision**: Need to query for `chain_id` with no pending/active tasks AND pr_status = 'merged'

## Implementation Plan

### Phase 1: Schema & Data Model (Week 1)

#### Migration: `012_staged_queue.sql`

```sql
-- Add queue_stage enum
ALTER TABLE tasks ADD COLUMN queue_stage TEXT 
  CHECK(queue_stage IN ('implementation', 'followup')) 
  DEFAULT 'implementation';

-- Add chain_status enum
ALTER TABLE tasks ADD COLUMN chain_status TEXT 
  CHECK(chain_status IN ('pending', 'active', 'blocked', 'closed')) 
  DEFAULT 'pending';

-- Add blocked reason for human intervention
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN blocked_at INTEGER;
ALTER TABLE tasks ADD COLUMN blocked_by TEXT; -- user who blocked it

-- Create indexes for staged queue queries
CREATE INDEX IF NOT EXISTS idx_tasks_queue_stage ON tasks(queue_stage);
CREATE INDEX IF NOT EXISTS idx_tasks_chain_status ON tasks(chain_status);
CREATE INDEX IF NOT EXISTS idx_tasks_queue_stage_status ON tasks(queue_stage, status, priority DESC, created_at);

-- Create index for active chain counting
CREATE INDEX IF NOT EXISTS idx_tasks_active_chains ON tasks(chain_id, chain_status) 
  WHERE chain_status IN ('pending', 'active');

-- Backfill logic for existing tasks
UPDATE tasks 
SET 
  queue_stage = CASE 
    WHEN original_task_id IS NULL AND is_repair_bot IS NOT 1 THEN 'implementation'
    ELSE 'followup'
  END,
  chain_id = CASE 
    WHEN chain_id IS NULL AND original_task_id IS NULL THEN id
    WHEN chain_id IS NULL AND original_task_id IS NOT NULL THEN (
      SELECT COALESCE(chain_id, id) FROM tasks t WHERE t.id = tasks.original_task_id
    )
    ELSE chain_id
  END,
  chain_status = CASE
    WHEN status IN ('completed', 'failed', 'cancelled') THEN 'closed'
    WHEN status IN ('pending', 'assigned', 'active', 'retrying') THEN 'active'
    ELSE 'pending'
  END
WHERE queue_stage IS NULL OR chain_id IS NULL;
```

#### TypeScript Types

Update `backend/src/services/taskQueue.sqlite.ts`:

```typescript
export type QueueStage = 'implementation' | 'followup';
export type ChainStatus = 'pending' | 'active' | 'blocked' | 'closed';

export interface Task {
  // ... existing fields ...
  queue_stage?: QueueStage;
  chain_status?: ChainStatus;
  blocked_reason?: string;
  blocked_at?: number;
  blocked_by?: string;
}

export interface ChainStats {
  activeChains: number;
  blockedChains: number;
  implementationQueueDepth: number;
  followupQueueDepth: number;
  maxConcurrentChains: number;
}
```

#### Configuration

Add to `backend/.env`:
```env
MAX_DEV_BOTS=3  # Maximum concurrent dev-bot workers (matches chain concurrency limit)
```

Add to `backend/src/config.ts`:
```typescript
devBots: {
  // Maximum concurrent dev-bot workers (implementation chains)
  maxWorkers: parseInt(process.env.MAX_DEV_BOTS || '3', 10),
},
```

**Note**: Chain concurrency limit = MAX_DEV_BOTS (not a separate config)

### Phase 2: Chain Tracker Service (Week 1-2)

Create `backend/src/services/chainTracker.service.ts`:

```typescript
/**
 * Chain Lifecycle Management Service
 * 
 * Responsibilities:
 * - Count active chains
 * - Detect chain completion (PR merged + all tasks done)
 * - Mark chains as closed
 * - Handle blocked/unblocked transitions
 * - Provide chain statistics for UI
 */

import type { Database } from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export class ChainTrackerService {
  constructor(private db: Database) {}

  /**
   * Count active chains (non-blocked)
   * 
   * A chain is active if:
   * 1. chain_status = 'active'
   * 2. Has at least one task with status IN ('pending', 'assigned', 'active', 'retrying')
   * 3. PR is not merged (pr_status != 'merged')
   */
  countActiveChains(): number {
    const result = this.db.prepare(`
      SELECT COUNT(DISTINCT chain_id) as count
      FROM tasks
      WHERE chain_status = 'active'
      AND chain_id IS NOT NULL
      AND status IN ('pending', 'assigned', 'active', 'retrying')
    `).get() as { count: number };
    
    return result.count;
  }

  /**
   * Count blocked chains
   */
  countBlockedChains(): number {
    const result = this.db.prepare(`
      SELECT COUNT(DISTINCT chain_id) as count
      FROM tasks
      WHERE chain_status = 'blocked'
      AND chain_id IS NOT NULL
    `).get() as { count: number };
    
    return result.count;
  }

  /**
   * Get queue depths
   */
  getQueueDepths(): { implementation: number; followup: number } {
    const implResult = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM tasks
      WHERE queue_stage = 'implementation'
      AND status = 'pending'
    `).get() as { count: number };

    const followupResult = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM tasks
      WHERE queue_stage = 'followup'
      AND status = 'pending'
      AND chain_status != 'blocked'  -- Don't count blocked chains
    `).get() as { count: number };

    return {
      implementation: implResult.count,
      followup: followupResult.count
    };
  }

  /**
   * Check if a chain is complete and mark it closed
   * 
   * Complete means:
   * 1. PR is merged (pr_status = 'merged')
   * 2. No pending/active tasks in the chain
   */
  closeCompletedChains(): number {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET chain_status = 'closed'
      WHERE chain_id IN (
        SELECT DISTINCT t1.chain_id
        FROM tasks t1
        WHERE t1.chain_id IS NOT NULL
        AND t1.pr_status = 'merged'
        AND NOT EXISTS (
          SELECT 1 FROM tasks t2
          WHERE t2.chain_id = t1.chain_id
          AND t2.status IN ('pending', 'assigned', 'active', 'retrying')
        )
        AND t1.chain_status != 'closed'
      )
    `);

    const result = stmt.run();
    const closedCount = result.changes;

    if (closedCount > 0) {
      logger.info({
        category: 'process',
        action: 'chains_closed',
        message: `Closed ${closedCount} completed chain(s)`,
        details: { closedCount }
      });
    }

    return closedCount;
  }

  /**
   * Mark a chain as blocked
   */
  blockChain(chainId: string, reason: string, blockedBy: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET chain_status = 'blocked',
          blocked_reason = ?,
          blocked_at = ?,
          blocked_by = ?
      WHERE chain_id = ?
      AND chain_status != 'closed'
    `);

    stmt.run(reason, now, blockedBy, chainId);

    logger.warn({
      category: 'process',
      action: 'chain_blocked',
      message: `Chain ${chainId} blocked: ${reason}`,
      details: { chainId, reason, blockedBy, blockedAt: now }
    });
  }

  /**
   * Unblock a chain
   */
  unblockChain(chainId: string, unblockedBy: string): void {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET chain_status = 'active',
          blocked_reason = NULL,
          blocked_at = NULL
      WHERE chain_id = ?
      AND chain_status = 'blocked'
    `);

    stmt.run(chainId);

    logger.info({
      category: 'process',
      action: 'chain_unblocked',
      message: `Chain ${chainId} unblocked by ${unblockedBy}`,
      details: { chainId, unblockedBy }
    });
  }

  /**
   * Get all blocked chains with details
   */
  getBlockedChains(): Array<{
    chain_id: string;
    blocked_reason: string;
    blocked_at: number;
    blocked_by: string;
    task_count: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT 
        chain_id,
        blocked_reason,
        blocked_at,
        blocked_by,
        COUNT(*) as task_count
      FROM tasks
      WHERE chain_status = 'blocked'
      AND chain_id IS NOT NULL
      GROUP BY chain_id, blocked_reason, blocked_at, blocked_by
      ORDER BY blocked_at DESC
    `);

    return stmt.all() as any;
  }

  /**
   * Get comprehensive chain statistics
   */
  getChainStats(maxConcurrentChains: number): ChainStats {
    const activeChains = this.countActiveChains();
    const blockedChains = this.countBlockedChains();
    const depths = this.getQueueDepths();

    return {
      activeChains,
      blockedChains,
      implementationQueueDepth: depths.implementation,
      followupQueueDepth: depths.followup,
      maxConcurrentChains
    };
  }
}
```

### Phase 3: Staged Queue Worker Logic (Week 2)

Update `backend/src/services/taskQueue.sqlite.ts`:

```typescript
import { ChainTrackerService } from './chainTracker.service.js';

export class TaskQueueService {
  private chainTracker: ChainTrackerService;
  private maxConcurrentChains: number;

  constructor(dbPath: string) {
    // ... existing constructor code ...
    this.chainTracker = new ChainTrackerService(this.db);
    this.maxConcurrentChains = parseInt(process.env.MAX_CONCURRENT_CHAINS || '3', 10);
  }

  /**
   * NEW: Chain-aware task assignment
   * 
   * Logic:
   * 1. Close any completed chains
   * 2. Count active chains
   * 3. If activeChains < maxChains:
   *    - Dequeue implementation task
   *    - Mark chain as active
   * 4. Else:
   *    - Dequeue followup task (skip blocked chains)
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
            details: { chainId: task.chain_id, taskId: task.id }
          });
        }
      }

      // Step 4: If no implementation task (or can't start new chain), try followup
      if (!task) {
        task = this.dequeueFollowupTask();
        
        if (task) {
          logger.info({
            category: 'process',
            action: 'followup_task_dequeued',
            message: `Dequeued followup task for chain ${task.chain_id}`,
            details: { chainId: task.chain_id, taskId: task.id }
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

      // Step 5: Assign task (existing logic with file conflict check)
      return this.assignTaskToWorker(task);
    });
  }

  /**
   * Dequeue next implementation task
   */
  private dequeueImplementationTask(): Task | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'pending'
      AND queue_stage = 'implementation'
      AND chain_status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `);

    return stmt.get() as Task | undefined;
  }

  /**
   * Dequeue next followup task (skip blocked chains)
   */
  private dequeueFollowupTask(): Task | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'pending'
      AND queue_stage = 'followup'
      AND chain_status != 'blocked'
      ORDER BY priority DESC, created_at ASC
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
   * Assign task to worker (extracted from existing assignNextTask logic)
   */
  private assignTaskToWorker(task: Task): Task | null {
    // Check for file conflicts (existing logic)
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

    // Assign task atomically (existing logic)
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

    // Create worker record (existing logic)
    const workerStmt = this.db.prepare(`
      INSERT INTO workers (id, agent_id, status, current_task_id, created_at, last_heartbeat)
      VALUES (?, ?, 'running', ?, ?, ?)
    `);

    workerStmt.run(workerId, task.assigned_agent, task.id, now, now);

    // Record execution attempt (existing logic)
    const executionStmt = this.db.prepare(`
      INSERT INTO task_executions (task_id, worker_id, attempt_number, started_at)
      VALUES (?, ?, ?, ?)
    `);

    executionStmt.run(task.id, workerId, task.retry_count + 1, now);

    logger.info({
      category: 'process',
      action: 'task_assigned',
      message: `Assigned task ${task.id} to worker ${workerId}`,
      details: { taskId: task.id, workerId, chainId: task.chain_id, queueStage: task.queue_stage }
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
   * Updated createTask to set queue_stage and chain_id
   */
  createTask(taskData: Partial<Task>): Task {
    return this.transaction(() => {
      // Determine queue_stage
      const isImplementation = !taskData.original_task_id && !taskData.is_repair_bot;
      const queueStage: QueueStage = isImplementation ? 'implementation' : 'followup';

      // Set chain_id
      let chainId = taskData.chain_id;
      if (!chainId) {
        if (isImplementation) {
          // Implementation tasks: chain_id = task id (will be set after insert)
          chainId = undefined; // Will be set in UPDATE below
        } else if (taskData.original_task_id) {
          // Follow-up tasks: inherit chain_id from original task
          const originalStmt = this.db.prepare('SELECT chain_id FROM tasks WHERE id = ?');
          const original = originalStmt.get(taskData.original_task_id) as { chain_id?: string } | undefined;
          chainId = original?.chain_id || taskData.original_task_id;
        }
      }

      // ... existing task creation logic ...
      
      const task: Task = {
        id: randomUUID(),
        // ... existing fields ...
        queue_stage: queueStage,
        chain_status: 'pending',
        chain_id: chainId || undefined,
        chain_depth: taskData.chain_depth || 0,
      };

      // Insert task
      // ... existing insert logic ...

      // If implementation task, set chain_id = id
      if (isImplementation && !chainId) {
        this.db.prepare(`
          UPDATE tasks SET chain_id = id WHERE id = ?
        `).run(task.id);
        task.chain_id = task.id;
      }

      return task;
    });
  }

  /**
   * Expose chain tracker methods
   */
  getChainStats(): ChainStats {
    return this.chainTracker.getChainStats(this.maxConcurrentChains);
  }

  blockChain(chainId: string, reason: string, blockedBy: string): void {
    return this.chainTracker.blockChain(chainId, reason, blockedBy);
  }

  unblockChain(chainId: string, unblockedBy: string): void {
    return this.chainTracker.unblockChain(chainId, unblockedBy);
  }

  getBlockedChains() {
    return this.chainTracker.getBlockedChains();
  }
}
```

### Phase 4: API Routes (Week 2)

Add to `backend/src/routes/tasks.routes.ts`:

```typescript
// GET /api/queue/stats - Get queue statistics
router.get('/queue/stats', (_req, res) => {
  try {
    const queueService = getTaskQueueService();
    const stats = queueService.getChainStats();
    res.json(stats);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'get_queue_stats_failed',
      message: 'Failed to get queue stats',
      error
    });
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// GET /api/chains/blocked - Get blocked chains
router.get('/chains/blocked', (_req, res) => {
  try {
    const queueService = getTaskQueueService();
    const blocked = queueService.getBlockedChains();
    res.json(blocked);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'get_blocked_chains_failed',
      message: 'Failed to get blocked chains',
      error
    });
    res.status(500).json({ error: 'Failed to get blocked chains' });
  }
});

// POST /api/chains/:chainId/block - Block a chain
router.post('/chains/:chainId/block', (req, res) => {
  try {
    const { chainId } = req.params;
    const { reason, blockedBy } = req.body;
    
    if (!reason || !blockedBy) {
      return res.status(400).json({ error: 'Missing reason or blockedBy' });
    }

    const queueService = getTaskQueueService();
    queueService.blockChain(chainId, reason, blockedBy);
    
    res.json({ success: true, chainId });
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'block_chain_failed',
      message: 'Failed to block chain',
      error
    });
    res.status(500).json({ error: 'Failed to block chain' });
  }
});

// POST /api/chains/:chainId/unblock - Unblock a chain
router.post('/chains/:chainId/unblock', (req, res) => {
  try {
    const { chainId } = req.params;
    const { unblockedBy } = req.body;
    
    if (!unblockedBy) {
      return res.status(400).json({ error: 'Missing unblockedBy' });
    }

    const queueService = getTaskQueueService();
    queueService.unblockChain(chainId, unblockedBy);
    
    res.json({ success: true, chainId });
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'unblock_chain_failed',
      message: 'Failed to unblock chain',
      error
    });
    res.status(500).json({ error: 'Failed to unblock chain' });
  }
});
```

### Phase 5: Frontend Observability (Week 3)

Create `frontend/src/components/QueueStatus.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';

interface ChainStats {
  activeChains: number;
  blockedChains: number;
  implementationQueueDepth: number;
  followupQueueDepth: number;
  maxConcurrentChains: number;
}

export function QueueStatus() {
  const [stats, setStats] = useState<ChainStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await apiClient.get('/api/queue/stats');
        setStats(response.data);
      } catch (error) {
        console.error('Failed to fetch queue stats:', error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div>Loading...</div>;

  const utilizationPercent = (stats.activeChains / stats.maxConcurrentChains) * 100;

  return (
    <div className="queue-status">
      <h3>Queue Status</h3>
      
      <div className="chain-utilization">
        <label>Chain Utilization:</label>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${utilizationPercent}%` }}
          />
        </div>
        <span>{stats.activeChains} / {stats.maxConcurrentChains} active chains</span>
      </div>

      <div className="queue-depths">
        <div className="queue-metric">
          <label>Implementation Queue:</label>
          <span className="badge">{stats.implementationQueueDepth}</span>
        </div>
        
        <div className="queue-metric">
          <label>Follow-up Queue:</label>
          <span className="badge">{stats.followupQueueDepth}</span>
        </div>

        {stats.blockedChains > 0 && (
          <div className="queue-metric warning">
            <label>Blocked Chains:</label>
            <span className="badge blocked">{stats.blockedChains}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

Create `frontend/src/components/BlockedChains.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';

interface BlockedChain {
  chain_id: string;
  blocked_reason: string;
  blocked_at: number;
  blocked_by: string;
  task_count: number;
}

export function BlockedChains() {
  const [chains, setChains] = useState<BlockedChain[]>([]);

  useEffect(() => {
    const fetchChains = async () => {
      try {
        const response = await apiClient.get('/api/chains/blocked');
        setChains(response.data);
      } catch (error) {
        console.error('Failed to fetch blocked chains:', error);
      }
    };

    fetchChains();
    const interval = setInterval(fetchChains, 10000); // Poll every 10s

    return () => clearInterval(interval);
  }, []);

  const handleUnblock = async (chainId: string) => {
    try {
      await apiClient.post(`/api/chains/${chainId}/unblock`, {
        unblockedBy: 'user' // TODO: Get from auth context
      });
      // Refresh list
      setChains(chains.filter(c => c.chain_id !== chainId));
    } catch (error) {
      console.error('Failed to unblock chain:', error);
    }
  };

  if (chains.length === 0) {
    return <div className="no-blocked-chains">No blocked chains</div>;
  }

  return (
    <div className="blocked-chains">
      <h3>Blocked Chains</h3>
      <table>
        <thead>
          <tr>
            <th>Chain ID</th>
            <th>Reason</th>
            <th>Blocked At</th>
            <th>Blocked By</th>
            <th>Tasks</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {chains.map(chain => (
            <tr key={chain.chain_id}>
              <td><code>{chain.chain_id.slice(0, 8)}</code></td>
              <td>{chain.blocked_reason}</td>
              <td>{new Date(chain.blocked_at).toLocaleString()}</td>
              <td>{chain.blocked_by}</td>
              <td>{chain.task_count}</td>
              <td>
                <button onClick={() => handleUnblock(chain.chain_id)}>
                  Unblock
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## Testing Strategy

### Unit Tests

Create `backend/src/services/__tests__/chainTracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ChainTrackerService } from '../chainTracker.service';

describe('ChainTrackerService', () => {
  let db: Database.Database;
  let service: ChainTrackerService;

  beforeEach(() => {
    db = new Database(':memory:');
    // Run migrations
    // ...
    service = new ChainTrackerService(db);
  });

  it('should count active chains correctly', () => {
    // Setup: 2 active chains, 1 blocked
    // ...
    
    const count = service.countActiveChains();
    expect(count).toBe(2);
  });

  it('should exclude blocked chains from active count', () => {
    // ...
  });

  it('should close completed chains', () => {
    // ...
  });

  it('should block and unblock chains', () => {
    // ...
  });
});
```

Create `backend/src/services/__tests__/stagedQueue.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskQueueService } from '../taskQueue.sqlite';

describe('Staged Queue', () => {
  let queueService: TaskQueueService;

  beforeEach(() => {
    queueService = new TaskQueueService(':memory:');
  });

  describe('Queue Selection', () => {
    it('should start implementation when under capacity', () => {
      // Create 3 implementation tasks
      // Active chains = 2
      // Should dequeue implementation task
    });

    it('should start followup when at capacity', () => {
      // Create 3 active chains
      // Create followup tasks
      // Should dequeue followup task
    });

    it('should skip blocked chains in followup queue', () => {
      // Create blocked chain with followup tasks
      // Should skip blocked chain tasks
    });
  });

  describe('Chain Lifecycle', () => {
    it('should set chain_id = id for implementation tasks', () => {
      // ...
    });

    it('should inherit chain_id for followup tasks', () => {
      // ...
    });

    it('should mark chain as active when first task starts', () => {
      // ...
    });

    it('should close chain when PR merges and all tasks done', () => {
      // ...
    });
  });
});
```

## Open Questions & Decisions

### Q1: Copilot Delegation Handling
**Question**: Master intent says Copilot delegation tasks "do not count toward bot concurrency limit". How should these be handled?

**Options**:
A. Copilot tasks go in followup queue but don't trigger chain counting
B. Copilot tasks are exempt from both queues and always run immediately
C. Copilot tasks have separate tracking but share same dequeue logic

**Recommendation**: Option A - Put in followup queue, mark with `agent_type='copilot'`, and exclude from active chain counting. This maintains queue visibility while respecting the concurrency exemption.

**Implementation**: Add check in `countActiveChains()`:
```sql
WHERE chain_status = 'active'
AND assigned_agent != 'copilot'  -- Exclude Copilot tasks
```

### Q2: Blocked Chain Temporary Overcapacity
**Question**: When unblocking a chain, master intent says "may temporarily cause activeChains > maxBots". How long is "temporary"?

**Decision**: 
- Unblocking a chain changes its status to 'active'
- This may cause `activeChains > maxConcurrentChains`
- Queue worker will NOT start new implementation tasks until count drops
- Natural attrition as chains complete will bring it back under capacity
- No forced termination of active chains

**Implementation**: The `canStartNewChain` check handles this automatically.

### Q3: Follow-up Task Priority
**Question**: Design asks "Should follow-up task ordering be purely FIFO, or should certain types (e.g., FIX vs REVIEW) have priority?"

**Decision**: Start with FIFO (simpler), add priority later if needed.

**Future Enhancement**: Add `followup_priority` column:
- REVIEW = 1 (highest)
- FIX = 2
- VALIDATION = 3
- COMPLETE = 4
- Other = 5

## Risk Mitigation

### Risk 1: Migration Data Loss
**Risk**: Backfill logic might incorrectly assign queue_stage or chain_id

**Mitigation**:
1. Test migration on copy of production database
2. Add validation queries to check backfill correctness
3. Keep migration reversible for first 24 hours
4. Log all backfill decisions for audit

### Risk 2: Performance Degradation
**Risk**: Additional queries for chain counting might slow dequeue

**Mitigation**:
1. Indexes on `queue_stage`, `chain_status`, `chain_id`
2. Benchmark dequeue time: target < 100ms p95
3. Consider caching chain counts with 1-second TTL if needed

### Risk 3: Race Conditions
**Risk**: Multiple workers might dequeue simultaneously

**Mitigation**:
1. All dequeue logic wrapped in transaction
2. File conflict checks remain in place
3. Test with concurrent workers

## Success Metrics

### Week 1 Targets
- ✅ Migration 012 written and tested
- ✅ ChainTrackerService implemented
- ✅ Unit tests pass
- ✅ Backfill tested on dev database

### Week 2 Targets
- ✅ Staged queue logic implemented
- ✅ API routes added
- ✅ Integration tests pass
- ✅ Concurrency limits enforced

### Week 3 Targets
- ✅ Frontend components complete
- ✅ End-to-end testing done
- ✅ Performance benchmarks met
- ✅ Documentation updated

### Production Readiness
- [ ] 95%+ test coverage on queue worker
- [ ] 90%+ test coverage on chain tracker
- [ ] Dequeue < 100ms at p95
- [ ] Chain count query < 50ms at p95
- [ ] Zero data loss in migration
- [ ] UI shows accurate queue state with < 5s lag

## Next Steps

1. **Review this plan** with architecture owners
2. **Clarify open questions** (Q1-Q3 above)
3. **Start Phase 1** - Write and test migration
4. **Set up branch** - `feature/staged-task-queue`
5. **Daily standups** - Track progress against week targets

## Related Documents
- `/docs/technicalDesigns/staged-task-queue.md` - Original design
- `/docs/architecture/master-design-intent.md` - Master intent
- `/docs/architecture/dev-bots-overview.md` - Dev-bot architecture
- `/backend/migrations/011_add_chain_tracking.sql` - Existing chain columns
