# Database Consolidation Plan
**Date:** 2025-11-11  
**Objective:** Consolidate all SQLite databases into single source of truth

---

## Current State Assessment

### Databases Found
```
1. app-monitor.db       - Main application database (dev-bots service)
2. dev-bots.db         - Duplicate/legacy dev-bots database
3. task-queue.db       - Task queue service (separate implementation)
4. tasks.db            - Legacy tasks database
5. tasks/queue.db      - Another queue database
```

### Database Services

#### 1. DevBotsDatabase (`backend/src/services/database.ts`)
- **Location:** `backend/data/dev-bots.db`
- **Purpose:** Main application data
- **Tables:**
  - tasks
  - task_creation_context
  - task_failure_recovery
  - review_comments
  - review_comment_resolutions
  - pr_condition_states
  - followup_fingerprints
  - task_relationships

#### 2. TaskQueueService (`backend/src/services/taskQueue.sqlite.ts`)
- **Location:** `backend/data/task-queue.db`
- **Purpose:** Task queue management (DUPLICATE!)
- **Tables:**
  - tasks (DUPLICATE!)
  - task_relationships (DUPLICATE!)
  - followup_fingerprints (DUPLICATE!)

---

## Problems with Current Architecture

### 1. Data Duplication
- Tasks table exists in BOTH databases
- Risk of data divergence
- No single source of truth

### 2. No Cross-Database JOINs
- Can't efficiently query related data
- Must make multiple queries and join in application code
- Performance issues

### 3. Transaction Inconsistency
- Can't have atomic transactions across databases
- Risk of partial failures

### 4. Backup Complexity
- Must backup multiple databases
- Risk of inconsistent backups

### 5. Migration Hell
- Schema changes must be applied to multiple databases
- Easy to forget one database

---

## Consolidation Strategy

### Goal
**Single Database: `app-monitor.db`**
- All tables in one place
- Single connection pool
- Atomic transactions
- Simplified backups
- Easier migrations

### Migration Approach
1. **Audit** - Identify all tables and their relationships
2. **Merge Schema** - Combine schemas into single migration
3. **Data Migration** - Move data with integrity checks
4. **Service Updates** - Update all services to use single DB
5. **Verification** - Ensure data integrity
6. **Cleanup** - Archive old databases

---

## Detailed Implementation Plan

### Phase 1: Schema Audit (Day 1)

#### Step 1.1: Document Current Schemas
```bash
# Export schema from each database
sqlite3 backend/data/dev-bots.db ".schema" > schema-dev-bots.sql
sqlite3 backend/data/task-queue.db ".schema" > schema-task-queue.sql
sqlite3 backend/data/tasks.db ".schema" > schema-tasks.sql 2>/dev/null || true
```

#### Step 1.2: Identify Conflicts
- Compare table structures
- Check for naming conflicts
- Identify duplicate tables

#### Step 1.3: Design Unified Schema
```sql
-- Combined schema in app-monitor.db
-- All tables from both services

-- Tasks (merged from both DBs)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  -- ... all fields from both implementations
  -- Add source_db TEXT to track migration
);

-- Other tables...
```

### Phase 2: Create Migration Scripts (Day 1-2)

#### Script 1: Consolidate Databases
```typescript
// backend/scripts/consolidate-databases.ts
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

interface MigrationConfig {
  sourceDb: string;
  targetDb: string;
  tables: string[];
}

async function consolidateDatabases() {
  const dataDir = path.join(__dirname, '../data');
  const targetDbPath = path.join(dataDir, 'app-monitor.db');
  
  // Backup target database
  const backupPath = path.join(dataDir, 'backups', 
    `app-monitor-pre-consolidation-${new Date().toISOString()}.db`);
  fs.copyFileSync(targetDbPath, backupPath);
  console.log(`✅ Backed up to: ${backupPath}`);
  
  const targetDb = new Database(targetDbPath);
  
  // Migration configurations
  const migrations: MigrationConfig[] = [
    {
      sourceDb: path.join(dataDir, 'task-queue.db'),
      targetDb: targetDbPath,
      tables: ['tasks', 'task_relationships', 'followup_fingerprints']
    },
    {
      sourceDb: path.join(dataDir, 'dev-bots.db'),
      targetDb: targetDbPath,
      tables: ['tasks', 'review_comments', 'pr_condition_states']
    }
  ];
  
  for (const config of migrations) {
    if (!fs.existsSync(config.sourceDb)) {
      console.log(`⚠️  Source database not found: ${config.sourceDb}`);
      continue;
    }
    
    console.log(`\n📦 Migrating from: ${config.sourceDb}`);
    const sourceDb = new Database(config.sourceDb, { readonly: true });
    
    for (const table of config.tables) {
      await migrateTable(sourceDb, targetDb, table);
    }
    
    sourceDb.close();
  }
  
  targetDb.close();
  console.log('\n✅ Database consolidation complete!');
}

async function migrateTable(
  sourceDb: Database.Database,
  targetDb: Database.Database,
  tableName: string
) {
  console.log(`  Migrating table: ${tableName}`);
  
  // Get row count from source
  const sourceCount = sourceDb.prepare(
    `SELECT COUNT(*) as count FROM ${tableName}`
  ).get() as { count: number };
  
  if (sourceCount.count === 0) {
    console.log(`    ⏭️  No data to migrate`);
    return;
  }
  
  // Get all rows from source
  const rows = sourceDb.prepare(`SELECT * FROM ${tableName}`).all();
  console.log(`    📊 Found ${rows.length} rows`);
  
  // Get column names
  const columns = Object.keys(rows[0] || {});
  if (columns.length === 0) {
    console.log(`    ⚠️  No columns found`);
    return;
  }
  
  // Prepare insert statement
  const placeholders = columns.map(() => '?').join(', ');
  const insertSql = `
    INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')})
    VALUES (${placeholders})
  `;
  const insert = targetDb.prepare(insertSql);
  
  // Migrate data in transaction
  targetDb.transaction(() => {
    let migrated = 0;
    let skipped = 0;
    
    for (const row of rows) {
      try {
        const values = columns.map(col => row[col]);
        insert.run(...values);
        migrated++;
      } catch (error) {
        console.log(`    ⚠️  Skipped row due to conflict: ${error.message}`);
        skipped++;
      }
    }
    
    console.log(`    ✅ Migrated: ${migrated}, Skipped: ${skipped}`);
  })();
  
  // Verify migration
  const targetCount = targetDb.prepare(
    `SELECT COUNT(*) as count FROM ${tableName}`
  ).get() as { count: number };
  
  if (targetCount.count < sourceCount.count) {
    console.log(`    ⚠️  Warning: Target has fewer rows than source!`);
    console.log(`       Source: ${sourceCount.count}, Target: ${targetCount.count}`);
  } else {
    console.log(`    ✅ Verification passed: ${targetCount.count} rows`);
  }
}

// Run migration
consolidateDatabases().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
```

#### Script 2: Verify Data Integrity
```typescript
// backend/scripts/verify-consolidation.ts
async function verifyConsolidation() {
  const db = new Database('./backend/data/app-monitor.db');
  
  const checks = [
    { name: 'tasks', expectedMin: 0 },
    { name: 'review_comments', expectedMin: 0 },
    { name: 'pr_condition_states', expectedMin: 0 }
  ];
  
  let allPassed = true;
  
  for (const check of checks) {
    const result = db.prepare(
      `SELECT COUNT(*) as count FROM ${check.name}`
    ).get() as { count: number };
    
    const passed = result.count >= check.expectedMin;
    console.log(
      `${passed ? '✅' : '❌'} ${check.name}: ${result.count} rows`
    );
    
    if (!passed) allPassed = false;
  }
  
  db.close();
  
  if (!allPassed) {
    console.error('❌ Verification failed!');
    process.exit(1);
  }
  
  console.log('\n✅ All verification checks passed!');
}
```

### Phase 3: Update Services (Day 2-3)

#### Step 3.1: Remove TaskQueueService Database
```typescript
// backend/src/services/taskQueue.sqlite.ts
// BEFORE
export class TaskQueueService {
  private db: Database.Database;
  
  constructor() {
    const dbPath = path.join(__dirname, '../data/task-queue.db');
    this.db = new Database(dbPath);
  }
}

// AFTER
import { getDatabase } from './database.js';

export class TaskQueueService {
  private db: DevBotsDatabase;
  
  constructor() {
    this.db = getDatabase(); // Use singleton!
  }
}
```

#### Step 3.2: Update All Database References
```bash
# Find all references to task-queue.db
grep -r "task-queue.db" backend/src

# Find all Database instantiations
grep -r "new Database" backend/src
```

Update each file to use `getDatabase()` instead.

#### Step 3.3: Remove Duplicate Code
- Delete duplicate table creation logic
- Consolidate migration files
- Remove redundant interfaces

### Phase 4: Testing (Day 3-4)

#### Unit Tests
```typescript
describe('Database Consolidation', () => {
  it('should use single database instance', () => {
    const db1 = getDatabase();
    const db2 = getDatabase();
    expect(db1).toBe(db2); // Same instance!
  });
  
  it('should have all tables', () => {
    const db = getDatabase();
    const tables = db.getConnection().prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    
    expect(tables).toContainEqual({ name: 'tasks' });
    expect(tables).toContainEqual({ name: 'review_comments' });
    // ... etc
  });
});
```

#### Integration Tests
```typescript
describe('Task Queue Integration', () => {
  it('should create and retrieve tasks', async () => {
    const queue = new TaskQueueService();
    const task = await queue.createTask({
      type: 'bugfix',
      title: 'Test task',
      description: 'Test'
    });
    
    const retrieved = await queue.getTask(task.id);
    expect(retrieved).toEqual(task);
  });
});
```

### Phase 5: Deployment (Day 4-5)

#### Step 5.1: Staging Deployment
1. Deploy to staging environment
2. Run migration script
3. Verify data integrity
4. Run full test suite
5. Monitor for 24 hours

#### Step 5.2: Production Deployment
```bash
# 1. Backup all databases
cd /opt/app-monitor/current/backend/data
tar -czf backups/pre-consolidation-$(date +%Y%m%d-%H%M%S).tar.gz *.db

# 2. Run migration
node dist/scripts/consolidate-databases.js

# 3. Verify
node dist/scripts/verify-consolidation.js

# 4. Restart services
sudo systemctl restart app-monitor-backend@5001

# 5. Monitor logs
sudo journalctl -fu app-monitor-backend@5001
```

### Phase 6: Cleanup (Day 5)

#### Archive Old Databases
```bash
# Move old databases to archive
mkdir -p backend/data/archive
mv backend/data/dev-bots.db backend/data/archive/
mv backend/data/task-queue.db backend/data/archive/
mv backend/data/tasks.db backend/data/archive/ 2>/dev/null || true
mv backend/data/tasks/ backend/data/archive/ 2>/dev/null || true

# After 1 week of successful operation, can delete archive
```

#### Update Documentation
```markdown
# Database Architecture

**Single Database:** `app-monitor.db`

All application data stored in one SQLite database.

## Tables
- tasks - All task queue data
- review_comments - PR review tracking
- pr_condition_states - PR workflow state machine
- ... (full schema)

## Usage
```typescript
import { getDatabase } from './services/database.js';

const db = getDatabase(); // Singleton instance
```
```

---

## Rollback Plan

If consolidation fails:

```bash
# 1. Stop services
sudo systemctl stop app-monitor-backend@5001

# 2. Restore from backup
cd /opt/app-monitor/current/backend/data
cp backups/app-monitor-pre-consolidation-*.db app-monitor.db
cp archive/task-queue.db ./

# 3. Restart services
sudo systemctl start app-monitor-backend@5001

# 4. Verify
curl http://localhost:5001/api/health
```

---

## Success Criteria

- ✅ Single database file: `app-monitor.db`
- ✅ All tables migrated successfully
- ✅ Zero data loss
- ✅ All tests passing
- ✅ Production running stable for 7 days
- ✅ Old databases archived
- ✅ Documentation updated

---

## Timeline

| Day | Tasks | Status |
|-----|-------|--------|
| 1 | Schema audit, migration scripts | ⏳ Pending |
| 2 | Service updates, initial testing | ⏳ Pending |
| 3 | Integration testing, staging deploy | ⏳ Pending |
| 4 | Production deployment | ⏳ Pending |
| 5 | Cleanup, documentation | ⏳ Pending |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | HIGH | Full backups, verification scripts |
| Service downtime | MEDIUM | Deploy during low-traffic window |
| Schema conflicts | MEDIUM | Thorough schema audit, testing |
| Performance degradation | LOW | Monitor query performance |

---

## Next Steps

1. Review this plan
2. Get approval
3. Schedule migration window
4. Execute Phase 1 (audit)
5. Continue with implementation

