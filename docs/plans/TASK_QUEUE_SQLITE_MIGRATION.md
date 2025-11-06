# Task Queue SQLite Migration Plan

## Overview
Migrate dev-bot task queue from JSON file persistence to SQLite database for better reliability, concurrency, and query performance.

## Current State
- Tasks stored in JSON files via `taskPersistence.ts`
- Separate files for pending and completed tasks
- No transaction support
- File locking issues with concurrent access
- Limited query capabilities

## Target State
- All tasks in SQLite database
- ACID transactions
- Efficient indexing for common queries
- Better concurrency with WAL mode
- Unified storage with task_executions table

---

## Database Schema

### Migration: 002_task_queue_schema

```sql
-- ==============================================================================
-- TASK QUEUE TABLES
-- ==============================================================================

-- Main task queue table
CREATE TABLE IF NOT EXISTS tasks (
  -- Core identification
  id TEXT PRIMARY KEY,                    -- UUID v4
  type TEXT NOT NULL,                     -- Task type (feature, bug-fix, refactor, etc.)
  title TEXT NOT NULL CHECK(length(title) > 0 AND length(title) <= 200),

  -- Task details
  description TEXT,                       -- Detailed description of what to do
  documentation TEXT,                     -- Reference documentation or context
  notes TEXT,                             -- Additional notes or instructions
  prompt TEXT,                            -- Generated prompt sent to Claude

  -- Assignment and status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, assigned, active, completed, failed, retrying
  assigned_worker TEXT,                   -- Worker container ID if assigned
  assigned_agent TEXT NOT NULL,           -- Agent personality (backend-specialist, etc.)
  assigned_at TIMESTAMP,                  -- When task was assigned to a worker

  -- Execution tracking
  started_at TIMESTAMP,                   -- When task execution started
  completed_at TIMESTAMP,                 -- When task completed (success or failure)
  exit_code INTEGER,                      -- Docker exit code
  output TEXT,                            -- Stdout/stderr from execution
  error TEXT,                             -- Error message if failed

  -- Metadata and configuration
  project TEXT,                           -- Project name (default: current repo)
  priority INTEGER DEFAULT 5 CHECK(priority >= 0 AND priority <= 10),
  retry_count INTEGER DEFAULT 0 CHECK(retry_count >= 0),
  max_retries INTEGER DEFAULT 3 CHECK(max_retries >= 0),
  timeout INTEGER,                        -- Task timeout in milliseconds
  can_retry BOOLEAN DEFAULT 1,            -- Whether task can be retried

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Safety mechanism fields
  uncommitted_changes_warning BOOLEAN DEFAULT 0,
  patch_file TEXT,                        -- Path to uncommitted changes patch
  status_file TEXT,                       -- Path to git status file

  -- Validation
  CHECK(status IN ('pending', 'assigned', 'active', 'completed', 'failed', 'retrying'))
);

-- Task files (many-to-many relationship)
CREATE TABLE IF NOT EXISTS task_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  action TEXT,                            -- MODIFY, CREATE, READ, DELETE, etc.
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(task_id, file_path)
);

-- Task dependencies (many-to-many relationship)
CREATE TABLE IF NOT EXISTS task_dependencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(task_id, depends_on_task_id),
  CHECK(task_id != depends_on_task_id)   -- Prevent self-dependency
);

-- Task acceptance criteria (one-to-many relationship)
CREATE TABLE IF NOT EXISTS task_acceptance_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  criterion TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Task metadata (key-value store for flexible fields)
CREATE TABLE IF NOT EXISTS task_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,                   -- JSON-encoded value
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(task_id, key)
);

-- Task estimated effort (optional structured data)
CREATE TABLE IF NOT EXISTS task_estimated_effort (
  task_id TEXT PRIMARY KEY,
  hours REAL,
  complexity TEXT CHECK(complexity IN ('trivial', 'simple', 'moderate', 'complex', 'very-complex')),
  confidence TEXT CHECK(confidence IN ('low', 'medium', 'high')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- ==============================================================================
-- INDEXES FOR PERFORMANCE
-- ==============================================================================

-- Status-based queries (most common)
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at DESC);

-- Agent-based queries
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent_status ON tasks(assigned_agent, status);

-- Worker-based queries
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_worker ON tasks(assigned_worker);

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at DESC) WHERE completed_at IS NOT NULL;

-- Retry tracking
CREATE INDEX IF NOT EXISTS idx_tasks_retry ON tasks(can_retry, retry_count) WHERE status = 'failed';

-- Safety mechanism queries
CREATE INDEX IF NOT EXISTS idx_tasks_uncommitted_warning ON tasks(uncommitted_changes_warning) WHERE uncommitted_changes_warning = 1;

-- Task files index
CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files(task_id);

-- Task dependencies indexes
CREATE INDEX IF NOT EXISTS idx_task_deps_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on ON task_dependencies(depends_on_task_id);

-- ==============================================================================
-- TRIGGERS FOR AUTOMATION
-- ==============================================================================

-- Update updated_at timestamp on task changes
CREATE TRIGGER IF NOT EXISTS update_tasks_timestamp
AFTER UPDATE ON tasks
BEGIN
  UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update metadata timestamp on changes
CREATE TRIGGER IF NOT EXISTS update_task_metadata_timestamp
AFTER UPDATE ON task_metadata
BEGIN
  UPDATE task_metadata SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Prevent completed tasks from being modified
CREATE TRIGGER IF NOT EXISTS prevent_completed_task_modification
BEFORE UPDATE ON tasks
WHEN OLD.status = 'completed' AND NEW.status != 'completed'
BEGIN
  SELECT RAISE(ABORT, 'Cannot modify completed tasks');
END;

-- ==============================================================================
-- VIEWS FOR COMMON QUERIES
-- ==============================================================================

-- Active tasks with all details
CREATE VIEW IF NOT EXISTS v_active_tasks AS
SELECT
  t.*,
  GROUP_CONCAT(DISTINCT tf.file_path) as file_paths,
  GROUP_CONCAT(DISTINCT ac.criterion, '|||') as acceptance_criteria,
  COUNT(DISTINCT td.depends_on_task_id) as dependency_count
FROM tasks t
LEFT JOIN task_files tf ON t.id = tf.task_id
LEFT JOIN task_acceptance_criteria ac ON t.id = ac.task_id
LEFT JOIN task_dependencies td ON t.id = td.task_id
WHERE t.status IN ('pending', 'assigned', 'active', 'retrying')
GROUP BY t.id;

-- Task queue statistics
CREATE VIEW IF NOT EXISTS v_task_stats AS
SELECT
  COUNT(*) as total_tasks,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_tasks,
  SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned_tasks,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_tasks,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tasks,
  SUM(CASE WHEN status = 'retrying' THEN 1 ELSE 0 END) as retrying_tasks,
  AVG(CASE
    WHEN status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL
    THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60
  END) as avg_completion_time_minutes,
  CAST(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS FLOAT) /
  NULLIF(SUM(CASE WHEN status IN ('completed', 'failed') THEN 1 ELSE 0 END), 0) * 100
  as success_rate_percent
FROM tasks;

-- Tasks with uncommitted changes (safety net)
CREATE VIEW IF NOT EXISTS v_tasks_with_uncommitted_changes AS
SELECT
  t.id,
  t.title,
  t.status,
  t.completed_at,
  t.patch_file,
  t.status_file,
  t.assigned_agent
FROM tasks t
WHERE t.uncommitted_changes_warning = 1
ORDER BY t.completed_at DESC;
```

---

## Data Migration Strategy

### Phase 1: Dual-Write Mode (Week 1)
1. Keep existing JSON persistence
2. Add SQLite writes alongside JSON writes
3. Validate data consistency
4. Monitor for issues

### Phase 2: Read Migration (Week 2)
1. Migrate existing JSON tasks to SQLite
2. Verify all data transferred correctly
3. Update reads to use SQLite as primary
4. Keep JSON as backup

### Phase 3: SQLite-Only Mode (Week 3)
1. Remove JSON write operations
2. Archive JSON files
3. Update all code to use SQLite exclusively
4. Remove taskPersistence.ts

### Phase 4: Cleanup (Week 4)
1. Remove JSON-related code
2. Add database maintenance scripts
3. Implement backup/restore procedures
4. Performance tuning

---

## Migration Script

```typescript
// backend/src/services/taskMigration.ts

import { DevBotsDatabase } from './database.js';
import { TaskPersistence } from './taskPersistence.js';
import { logger } from '../utils/logger.js';

export class TaskQueueMigration {
  private db: DevBotsDatabase;
  private persistence: TaskPersistence;

  constructor() {
    this.db = new DevBotsDatabase();
    this.persistence = new TaskPersistence();
  }

  /**
   * Migrate all tasks from JSON to SQLite
   */
  async migrateToSQLite(): Promise<void> {
    logger.info({
      category: 'migration',
      action: 'starting_task_migration',
      message: 'Starting migration of tasks from JSON to SQLite'
    });

    try {
      // Load tasks from JSON
      const pendingTasks = await this.persistence.loadPendingTasks();
      const completedTasks = await this.persistence.loadCompletedTasks();
      const allTasks = [...pendingTasks, ...completedTasks];

      logger.info({
        category: 'migration',
        action: 'tasks_loaded',
        message: `Loaded ${allTasks.length} tasks from JSON`,
        details: { pending: pendingTasks.length, completed: completedTasks.length }
      });

      // Migrate each task
      let migrated = 0;
      let failed = 0;

      for (const task of allTasks) {
        try {
          await this.db.insertTask(task);
          migrated++;
        } catch (error) {
          logger.error({
            category: 'migration',
            action: 'task_migration_failed',
            message: `Failed to migrate task ${task.id}`,
            error,
            details: { taskId: task.id, title: task.title }
          });
          failed++;
        }
      }

      logger.info({
        category: 'migration',
        action: 'migration_complete',
        message: `Migration complete: ${migrated} succeeded, ${failed} failed`,
        details: { migrated, failed, total: allTasks.length }
      });

    } catch (error) {
      logger.error({
        category: 'migration',
        action: 'migration_error',
        message: 'Task migration failed',
        error
      });
      throw error;
    }
  }

  /**
   * Verify data integrity after migration
   */
  async verifyMigration(): Promise<boolean> {
    const jsonPending = await this.persistence.loadPendingTasks();
    const jsonCompleted = await this.persistence.loadCompletedTasks();
    const jsonTotal = jsonPending.length + jsonCompleted.length;

    const sqliteTotal = await this.db.getTaskCount();

    const verified = jsonTotal === sqliteTotal;

    logger.info({
      category: 'migration',
      action: 'verification_result',
      message: verified ? 'Migration verified successfully' : 'Migration verification FAILED',
      details: { jsonTotal, sqliteTotal, match: verified }
    });

    return verified;
  }
}
```

---

## Implementation Checklist

### Database Layer
- [x] Define schema in migration 002
- [ ] Add schema to database.ts runMigrations()
- [ ] Create TaskRepository class for CRUD operations
- [ ] Add transaction support methods
- [ ] Implement query builders for complex queries

### Service Layer Updates
- [ ] Update TaskQueueManager to use SQLite
- [ ] Add dual-write support (Phase 1)
- [ ] Implement migration script
- [ ] Add data verification
- [ ] Update TaskBridge to use new repository

### API Layer Updates
- [ ] Update dev-bots.routes.ts to use SQLite queries
- [ ] Add migration endpoint (admin only)
- [ ] Update task statistics endpoints
- [ ] Add database health checks

### Testing
- [ ] Unit tests for TaskRepository
- [ ] Integration tests for migration
- [ ] Performance tests for common queries
- [ ] Stress tests for concurrent access

### Deployment
- [ ] Backup existing JSON files
- [ ] Run migration in production
- [ ] Verify data integrity
- [ ] Monitor for issues
- [ ] Rollback plan if needed

---

## Benefits

### Performance
- **Faster queries**: Indexed lookups vs full JSON parsing
- **Better concurrency**: WAL mode vs file locking
- **Efficient filtering**: SQL WHERE clauses vs JavaScript array filtering

### Reliability
- **ACID transactions**: No partial writes
- **Data integrity**: Foreign keys and constraints
- **Automatic timestamps**: Triggers handle updated_at

### Features
- **Complex queries**: JOINs, aggregations, subqueries
- **Task dependencies**: Proper relational modeling
- **Metadata flexibility**: Key-value store for custom fields
- **Safety tracking**: Built-in uncommitted changes tracking

### Observability
- **Query statistics**: SQLite analyze for optimization
- **Views for dashboards**: Pre-computed aggregations
- **Audit trail**: Timestamp tracking on all changes

---

## Rollback Plan

If migration fails:
1. Stop all dev-bot operations
2. Restore JSON files from backup
3. Revert code to use JSON persistence
4. Investigate and fix issues
5. Retry migration after fixes

---

## Future Enhancements

### Phase 5+
- Add task history table (audit log)
- Implement task scheduling (cron-like)
- Add task priority auto-adjustment
- Implement task batching
- Add task analytics dashboard
- Support for distributed task queue
