# Complete Metrics and Progress Tracking Systems Investigation

## Executive Summary

This investigation documents all existing metrics and progress tracking systems in the app-monitor codebase. The system implements a multi-layered metrics architecture with:

1. **Real-time metrics** from database queries (TaskQueueMetricsService)
2. **Periodic metrics emission** (MetricsEmitter - 1-minute intervals)
3. **Quality observation tracking** (QualityObservationService)
4. **Chain lifecycle metrics** (ChainTrackerService)
5. **Caching strategies** (ContextCache with LRU + SQLite persistence)
6. **Status aggregation** (StatusAggregationService)

---

## 1. Core Metrics Services

### 1.1 TaskQueueMetricsService
**File:** `/home/jdubz/Development/app-monitor/backend/src/services/taskQueueMetrics.service.ts`

#### Metrics Collected
- Task duration statistics (by type and complexity)
- Queue health metrics (pending, running, completed, failed, cancelled, timeout)
- Agent performance comparison (Claude vs Codex)
- Task type breakdown by agent

#### How Metrics are Computed
- **Real-time** via SQL queries against SQLite database
- **No caching** - queries execute on-demand
- **Time-windowed** - optional lookback period (default: 30 days)

#### Stored Metrics
- **Database:** SQLite (`task_executions`, `tasks` tables)
- **Columns Tracked:**
  - `tasks.status` (pending, running, completed, failed, cancelled, timeout)
  - `tasks.agent_type` (claude, codex)
  - `tasks.type` (implementation, testing, documentation)
  - `tasks.complexity` (unknown, simple, medium, complex)
  - `tasks.started_at`, `tasks.completed_at` (duration calculation)
  - `task_executions.duration_ms` (execution history)
  - `task_executions.exit_code` (0 = success, non-zero = failure)

#### SQL Aggregation Patterns

**Queue Metrics:**
```sql
SELECT status, COUNT(*) as count FROM tasks GROUP BY status
SELECT AVG(duration_ms) as avg_duration FROM task_executions 
  WHERE exit_code = 0 AND ended_at > [24h ago]
SELECT MIN(created_at) as oldest FROM tasks WHERE status = 'pending'
```

**Agent Comparison:**
```sql
SELECT
  agent_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  AVG(CASE WHEN status = 'completed' AND completed_at IS NOT NULL 
    THEN completed_at - started_at ELSE NULL END) as avg_duration_ms
FROM tasks
WHERE agent_type IN ('claude', 'codex')
GROUP BY agent_type
```

**Task Duration Stats:**
```sql
SELECT
  t.type,
  COALESCE(t.complexity, 'unknown') as complexity,
  COUNT(*) as completed_count,
  AVG(te.duration_ms) / 60000.0 as avg_minutes,
  MAX(te.duration_ms) / 60000.0 as max_minutes,
  MIN(te.duration_ms) / 60000.0 as min_minutes
FROM task_executions te
JOIN tasks t ON te.task_id = t.id
WHERE te.exit_code = 0 AND te.ended_at > [time window]
GROUP BY t.type, t.complexity
```

#### Success Rate Calculation
```typescript
successRate = (completed / (completed + failed)) * 100
// Handles edge case: 0% if no attempts
```

#### Exposed Data Structure
```typescript
export type AgentMetrics = {
  total: number;
  completed: number;
  failed: number;
  avg_duration_ms?: number;
  success_rate: number; // Percentage 0-100
};

export type AgentComparisonMetrics = {
  claude: AgentMetrics;
  codex: AgentMetrics;
  task_type_breakdown: {
    claude: AgentTaskTypeBreakdown;  // By implementation, testing, documentation
    codex: AgentTaskTypeBreakdown;
  };
};

export interface QueueMetrics {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  timeout: number;
  total: number;
  avg_completion_time_ms?: number;
  oldest_pending_age_ms?: number;
}
```

---

### 1.2 MetricsEmitter Service
**File:** `/home/jdubz/Development/app-monitor/backend/src/services/metricsEmitter.ts`

#### Periodic Metrics Emission
- **Interval:** 1 minute (configurable, default 60000ms)
- **Mechanism:** EventEmitter pattern
- **Storage:** Emitted as events (not persisted)

#### Metrics Emitted
```typescript
export interface SystemMetrics {
  timestamp: number;
  queueDepth: number;           // Pending tasks count
  activeWorkers: number;         // Active ephemeral workers
  completedTasks: number;        // Cumulative completed tasks
  failedTasks: number;           // Cumulative failed tasks
  pendingTasks: number;          // Current pending count
  avgCompletionTimeMs: number;   // Last 24h average
  successRate: number;           // Percentage 0-1
  circuitBreakerStatus?: {       // Optional circuit breaker info
    state: string;
    failureCount: number;
  };
}
```

#### Health Status Determination
```typescript
private getHealthStatus(metrics: SystemMetrics): 'HEALTHY' | 'DEGRADED' | 'CRITICAL'
// CRITICAL: successRate < 50% || (queueDepth > 20 && activeWorkers === 0)
// DEGRADED: queueDepth > 10 || successRate < 80%
// HEALTHY: Otherwise
```

#### Success Rate Calculation
```typescript
successRate = completed / (completed + failed)
// 0-1 scale (0-100% when multiplied by 100)
```

#### Performance Considerations
- Metrics pulled from in-memory queue state + database on each emission
- No caching layer
- Emits immediately on start, then periodically
- Can consume events via `.on('metrics', handler)`

---

### 1.3 ChainTrackerService
**File:** `/home/jdubz/Development/app-monitor/backend/src/services/chainTracker.service.ts`

#### Chain Metrics Tracked
```typescript
export interface ChainStats {
  activeChains: number;                    // Non-blocked chains with active tasks
  blockedChains: number;                   // Chains blocked pending manual intervention
  implementationQueueDepth: number;        // Pending implementation stage tasks
  followupQueueDepth: number;              // Pending followup stage tasks
  maxConcurrentChains: number;             // Configuration limit
}
```

#### SQL Patterns for Chain Metrics

**Active Chain Count:**
```sql
SELECT COUNT(DISTINCT chain_id) as count
FROM tasks
WHERE chain_status = 'active'
  AND chain_id IS NOT NULL
  AND status IN ('pending', 'assigned', 'active', 'retrying')
  AND (assigned_agent IS NULL OR assigned_agent != 'copilot')
```

**Blocked Chain Count:**
```sql
SELECT COUNT(DISTINCT chain_id) as count
FROM tasks
WHERE chain_status = 'blocked'
  AND chain_id IS NOT NULL
  AND (assigned_agent IS NULL OR assigned_agent != 'copilot')
```

**Queue Depths:**
```sql
-- Implementation stage
SELECT COUNT(*) as count
FROM tasks
WHERE queue_stage = 'implementation' AND status = 'pending'

-- Followup stage
SELECT COUNT(*) as count
FROM tasks
WHERE queue_stage = 'followup'
  AND status = 'pending'
  AND chain_status != 'blocked'
```

#### Progress Calculation
- **Chain Completion:** PR merged AND no pending/active/retrying tasks
- **Blocked Detection:** `chain_status = 'blocked'` with reason + blocker info
- **No automatic completion** - relies on explicit state transitions

---

### 1.4 QualityObservationService
**File:** `/home/jdubz/Development/app-monitor/backend/src/services/qualityObservation.service.ts`

#### Quality Metrics Calculated
```typescript
export interface QualityObservation {
  taskId: string;
  prNumber?: number;
  timestamp: string;
  
  observations: {
    acceptanceCriteria?: {
      totalCriteria: number;
      metCriteria: number;
      unmetCriteria: string[];
      percentMet: number;              // 0-100
      needsImprovement: boolean;
    };
    
    testCoverage?: {
      currentCoverage: number;         // 0-100%
      targetCoverage: number;          // 0-100%
      gap: number;                     // percentage points
      lineCoverage: number;
      branchCoverage: number;
      functionCoverage: number;
      needsImprovement: boolean;
    };
    
    scopeBoundaries?: {
      violationCount: number;
      violations: ScopeViolation[];
      filesChanged: number;
      filesCreated: number;
      needsImprovement: boolean;
    };
    
    qualityGates?: {
      gate: string;                    // 'linting', 'typechecking', 'testing', 'build', 'documentation'
      passed: boolean;
      score: number;                   // 0-100
      issues?: string[];
      needsImprovement: boolean;
    }[];
  };
  
  overallScore: number;                // 0-100 weighted score
  qualityLevel: 'excellent' | 'good' | 'fair' | 'needs-improvement';
  readyForMerge: boolean;              // Boolean determination
  blockers: string[];                  // Specific blocking issues
}
```

#### Score Calculation Methodology

**Overall Score Weighting:**
- Acceptance Criteria: 30% weight
- Test Coverage: 30% weight
- Quality Gates (avg of all gates): 30% weight
- Scope Boundaries: 10% weight

**Formula:**
```typescript
weightedScore = 0
totalWeight = 0

// Acceptance Criteria
weightedScore += (percentMet) * (30 / 100)
totalWeight += 30

// Test Coverage
coverageScore = MIN(100, (currentCoverage / targetCoverage) * 100)
weightedScore += coverageScore * (30 / 100)
totalWeight += 30

// Quality Gates
if (gates.length > 0) {
  avgGateScore = SUM(gate.score) / gates.length
  weightedScore += avgGateScore * (30 / 100)
  totalWeight += 30
}

// Scope Boundaries
scopeScore = (violationCount === 0) ? 100 : 0
weightedScore += scopeScore * (10 / 100)
totalWeight += 10

// Normalize
if (totalWeight < 100) {
  finalScore = (weightedScore / totalWeight) * 100
} else {
  finalScore = weightedScore
}

overallScore = ROUND(finalScore)
```

**Quality Level Thresholds:**
- EXCELLENT: >= 90
- GOOD: >= 75
- FAIR: >= 60
- NEEDS-IMPROVEMENT: < 60

**Ready for Merge Determination:**
```typescript
readyForMerge = 
  (overallScore >= GOOD_THRESHOLD) AND
  (acceptanceCriteria.percentMet === 100) AND
  (qualityGates filter for testing/build/linting all pass) AND
  (scopeBoundaries.violationCount === 0)
```

#### Improvement Opportunities Generation
- **Coverage Gap:** Gap-based priority (critical if > 20%, high if > 10%, medium if > 10%)
- **Estimated Effort:** ~2 minutes per percentage point for coverage
- **Automatable Determination:** Based on issue type (lint = automatable, test/scope = manual)

---

### 1.5 StatusAggregationService
**File:** `/home/jdubz/Development/app-monitor/backend/src/services/statusAggregation.service.ts`

#### Aggregated Status Structure
```typescript
export interface DevBotsStatus {
  systemStatus: 'running' | 'stopped' | 'error';
  workers: Record<string, WorkerStatus>;     // By worker ID
  queueSize: number;                         // Pending tasks
  activeTasks: number;                       // Running tasks
  uptime: number;                            // ms since start
  workerCount: number;                       // Active workers
  maxWorkers: number;                        // Configuration limit
  activeWorkerTypes: string[];               // Worker IDs
  availableWorkerTypes: string[];            // Empty slots
  tasks: {
    pending: Task[];                         // All pending tasks
    active: Task[];                          // All active tasks
    completed: Task[];                       // Last 50 completed tasks
  };
}
```

#### Aggregation Pattern
- **Source:** EphemeralWorkerService + TaskQueueService
- **Grouping:** By worker status (idle, busy, stopped)
- **Filtering:** Last 50 completed tasks (memory optimization)

---

## 2. Database Storage Schema

### Core Metrics Tables

**tasks** table (primary metrics source)
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout', ...)),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  assigned_agent TEXT,
  assigned_worker TEXT,
  agent_type TEXT CHECK(agent_type IN ('claude', 'codex')),
  type TEXT,                              -- Task type: implementation, testing, documentation
  complexity TEXT,                        -- Task complexity
  priority INTEGER,
  retry_count INTEGER,
  max_retries INTEGER,
  
  -- Chain tracking
  chain_id TEXT,
  chain_status TEXT CHECK(chain_status IN ('pending', 'active', 'blocked', 'closed')),
  chain_depth INTEGER,
  queue_stage TEXT CHECK(queue_stage IN ('implementation', 'followup')),
  
  -- PR workflow
  pr_number INTEGER,
  pr_status TEXT,
  
  -- Quality verification
  verification_passed INTEGER,            -- 0 or 1
  verification_results TEXT,              -- JSON stringified results
  verification_timestamp INTEGER,
  
  -- Indexes for metrics queries
  INDEX idx_tasks_status ON tasks(status),
  INDEX idx_tasks_agent_type ON tasks(agent_type),
  INDEX idx_tasks_chain_status ON tasks(chain_status),
  INDEX idx_tasks_queue_stage ON tasks(queue_stage),
  INDEX idx_tasks_pr_number ON tasks(pr_number)
}
```

**task_executions** table (execution history metrics)
```sql
CREATE TABLE task_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  exit_code INTEGER,                      -- 0 = success, non-zero = failure
  duration_ms INTEGER,                    -- Execution duration
  error TEXT,
  
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  INDEX idx_executions_task_id ON task_executions(task_id),
  INDEX idx_executions_exit_code_ended_at (exit_code, ended_at)
}
```

**context_bundle_cache** table (context cache metrics)
```sql
CREATE TABLE context_bundle_cache (
  bundle_id TEXT PRIMARY KEY,
  cache_key TEXT UNIQUE,
  task_type TEXT,
  profiles TEXT,                          -- JSON array
  mount_path TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMP,
  expires_at TIMESTAMP,
  hit_count INTEGER DEFAULT 0,            -- Cache hit tracking
  last_accessed_at TIMESTAMP,
  bundle_data LONGTEXT
  
  INDEX idx_cache_key ON context_bundle_cache(cache_key),
  INDEX idx_hit_count ON context_bundle_cache(hit_count)
}
```

### Indexing Strategy for Metrics Queries
- **Status queries:** `idx_tasks_status`, `idx_tasks_chain_status`
- **Agent comparison:** `idx_tasks_agent_type`
- **Time-based:** Implicit in sorting by `created_at`, `started_at`, `ended_at`
- **PR tracking:** `idx_tasks_pr_number`

---

## 3. API Endpoints for Metrics

### Status Routes (`/status`)
**File:** `/home/jdubz/Development/app-monitor/backend/src/routes/dev-bots/status.routes.ts`

```
GET /api/dev-bots/status
  - Returns: DevBotsStatus (system status, workers, queue depth, active tasks)
  - Source: StatusAggregationService

GET /api/dev-bots/health
  - Returns: { healthy: boolean, status: string }
  - Source: DevBotsManager.isHealthy()

GET /api/dev-bots/metrics
  - Returns: { metrics: QueueMetrics, stats: TaskDurationStats[] }
  - Source: TaskQueueMetricsService

GET /api/dev-bots/agent-comparison
  - Returns: { comparison: AgentComparisonMetrics }
  - Source: TaskQueueMetricsService.getAgentComparisonMetrics()
```

### Method Exposure in DevBotsManager
```typescript
public getQueueMetrics(): QueueMetrics
public getTaskDurationStats(daysBack?: number): TaskDurationStats[]
public getAgentComparisonMetrics(): AgentComparisonMetrics
public getSystemStatus(): Promise<DevBotsStatus>
```

---

## 4. Caching Strategies

### 4.1 Context Cache (LRU + SQLite Persistence)
**File:** `/home/jdubz/Development/app-monitor/backend/src/services/context/contextCache.ts`

#### Cache Metrics
```typescript
private stats = {
  hits: number;      // Cache hit count
  misses: number;    // Cache miss count
  evictions: number; // LRU evictions
}
```

#### Cache Key Generation
- **Hash based on:** Task type + profiles + target files + git commit hash
- **Invalidation:** Automatic on git commit change

#### LRU Eviction Policy
- **Max entries:** 100 (configurable)
- **Max total bytes:** 100MB (configurable)
- **Eviction trigger:** Max exceeded or expired TTL
- **Cleanup job:** Runs hourly to remove expired entries

#### Two-Level Caching
```
Memory Cache (Map<cacheKey, BundleEntry>)
    ↓ (on miss)
SQLite Database (context_bundle_cache table)
    ↓ (on miss)
Regenerate from source
```

#### Cache Hit Tracking
- `hit_count` incremented on access
- `last_accessed_at` updated for LRU ordering
- `access_sequence` for stable ordering when times are equal

#### Size Calculation
```typescript
calculateBundleSize(bundle): sizeBytes
  // Sums size of all bundle components (files, metadata, etc.)
```

---

## 5. Real-Time vs Batch Processing

### Real-Time Metrics (On-Demand)
- **TaskQueueMetricsService methods:** All execute SQL queries immediately
- **No caching** - fresh data on each call
- **Latency:** 10-100ms per query (depends on task count)
- **Use case:** API endpoints for UI dashboards

### Periodic Metrics (Batch)
- **MetricsEmitter:** 1-minute interval
- **Method:** Executes at fixed interval, emits to EventEmitter
- **Use case:** Monitoring systems, logging

### Batch with Persistence
- **ContextCache cleanup:** Hourly cleanup job
- **Method:** Async cleanup checks for expired entries
- **Use case:** Cache management, disk space control

---

## 6. Reusable Patterns & Components

### Pattern 1: SQL Aggregation for Metrics
```typescript
// Template for status-based aggregation
const countStmt = db.prepare(`
  SELECT status, COUNT(*) as count
  FROM tasks
  GROUP BY status
`);
const counts = countStmt.all();
const metrics = {};
for (const { status, count } of counts) {
  metrics[status] = count;
}
```

### Pattern 2: Success Rate Calculation
```typescript
const successRate = (completed / (completed + failed)) * 100 || 0
// With safe division guard
```

### Pattern 3: Weighted Score Calculation
```typescript
let score = 0, weight = 0;
if (component1) {
  score += component1.value * (component1.weight / 100);
  weight += component1.weight;
}
// ... additional components
if (weight < 100) score = (score / weight) * 100;
return Math.round(score);
```

### Pattern 4: Time Window Filtering
```typescript
const timeWindow = Date.now() - (days * 86400000);
const results = db.prepare(`
  SELECT ... WHERE created_at > ?
`).all(timeWindow);
```

### Pattern 5: Aggregation by Multiple Dimensions
```typescript
const results = db.prepare(`
  SELECT dimension1, dimension2, COUNT(*) as count, AVG(value) as avg_value
  FROM table
  WHERE filters
  GROUP BY dimension1, dimension2
`).all();
```

### Pattern 6: LRU Cache with TTL
```typescript
// Check expiry
if (entry.expiresAt && entry.expiresAt < new Date()) {
  cache.delete(key);
  return null;
}
// Update access time for LRU
entry.lastAccessedAt = new Date();
entry.accessSequence = ++accessSequence;
```

---

## 7. Performance Considerations

### Query Performance
- **Status by COUNT:** ~1ms (indexed)
- **Duration stats with JOIN:** ~10-50ms (depends on task count)
- **Agent comparison with CASE:** ~5-20ms (conditional aggregation)

### Caching Impact
- **Context bundle hits:** Save 100-500ms regeneration time
- **Cache miss penalty:** Full regeneration + DB persistence (500-2000ms)
- **Hit ratio target:** >80% after warmup

### Scalability Concerns
- **No pagination** in metrics queries (all results fetched)
- **No sampling** for large datasets
- **Full table scans** for queue metrics (mitigated by status index)

### Optimization Opportunities
1. Add materialized views for frequently accessed metric combinations
2. Implement sampling for 30+ day statistics
3. Cache top-level metrics (queue count, agent stats) with 5-10s TTL
4. Add metrics aggregation triggers on task completion

---

## 8. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     API Endpoints                             │
│  /status, /metrics, /agent-comparison, /health               │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┬───────────────┐
        │                             │               │
        ▼                             ▼               ▼
┌─────────────────┐      ┌──────────────────┐  ┌──────────────┐
│ DevBotsManager  │      │ StatusAggregation│  │ QualityObs   │
│                 │      │ Service          │  │ Service      │
└────────┬────────┘      └─────────┬────────┘  └──────┬───────┘
         │                         │                   │
         ▼                         ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│              TaskQueueMetricsService                         │
│                                                              │
│  - getQueueMetrics()                                        │
│  - getTaskDurationStats()                                   │
│  - getAgentComparisonMetrics()                              │
└──────────────────┬───────────────────────────────────────┬──┘
                   │                                       │
                   ▼                                       ▼
        ┌──────────────────┐               ┌──────────────────────┐
        │  ChainTracker    │               │  MetricsEmitter      │
        │  Service         │               │                      │
        │                  │               │ Emits every 60000ms  │
        │ - getChainStats()│               │ (events via observer)│
        └────────┬─────────┘               └────────┬─────────────┘
                 │                                  │
                 └──────────────┬───────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │    SQLite Database    │
                    │                       │
                    │  - tasks              │
                    │  - task_executions    │
                    │  - workers            │
                    │  - context_bundle_cache
                    └───────────────────────┘
```

---

## 9. Metrics Summary Table

| Metric Category | Metric | Computation | Storage | Update Frequency | Use Case |
|---|---|---|---|---|---|
| Queue Health | Pending/Running/Completed counts | SQL COUNT by status | tasks table | Real-time | Monitoring |
| Queue Health | Avg completion time (24h) | SQL AVG(duration_ms) | task_executions | Real-time | SLA tracking |
| Queue Health | Oldest pending task age | SQL MIN(created_at) | tasks table | Real-time | Bottleneck detection |
| Agent Performance | Claude success rate | (completed / (completed + failed)) * 100 | tasks table | Real-time | Agent comparison |
| Agent Performance | Codex success rate | (completed / (completed + failed)) * 100 | tasks table | Real-time | Agent comparison |
| Agent Performance | Avg task duration by agent | SQL AVG(duration_ms) WHERE agent_type | task_executions | Real-time | Performance profiling |
| Task Duration | By type/complexity (min/avg/max) | SQL MIN/AVG/MAX GROUP BY type | task_executions | Real-time | Timeout configuration |
| Chain Progress | Active chains | SQL COUNT DISTINCT WHERE status='active' | tasks table | Real-time | Concurrency tracking |
| Chain Progress | Blocked chains | SQL COUNT DISTINCT WHERE status='blocked' | tasks table | Real-time | Bottleneck detection |
| Chain Progress | Queue depths | SQL COUNT by queue_stage | tasks table | Real-time | Scheduling |
| Quality | Overall score | Weighted average (30/30/30/10) | Calculated on-demand | On verification | Quality gates |
| Quality | Acceptance criteria met % | met_count / total_count * 100 | Calculated | On verification | Merge gates |
| Quality | Test coverage gap | target - current | Calculated | On verification | Coverage tracking |
| Quality | Ready for merge determination | Boolean logic | Calculated | On verification | Workflow automation |
| Cache | Hit/miss/eviction counts | Increment counters | Memory | Continuous | Cache optimization |
| Cache | Hit ratio | hits / (hits + misses) | Calculated | On request | Cache health |

---

## 10. Implementation Guide for New Metrics

### To Add a New Metric (3 steps)

**Step 1: Define the type**
```typescript
export interface NewMetric {
  value: number;
  unit: string;
  timestamp: number;
}
```

**Step 2: Implement collection in service**
```typescript
export class MyMetricsService {
  constructor(private db: Database.Database) {}
  
  getNewMetric(): NewMetric {
    const result = this.db.prepare(`
      SELECT ... FROM table WHERE ...
    `).get();
    return { value: result.value, unit: 'ms', timestamp: Date.now() };
  }
}
```

**Step 3: Expose via API**
```typescript
router.get('/new-metric', (req, res) => {
  const metric = metricsService.getNewMetric();
  res.json({ data: metric });
});
```

### To Add Caching (optional)**
```typescript
private cachedMetric: NewMetric | null = null;
private cacheTime: number = 0;
private CACHE_TTL = 10000; // 10 seconds

getNewMetric(): NewMetric {
  if (this.cachedMetric && Date.now() - this.cacheTime < this.CACHE_TTL) {
    return this.cachedMetric;
  }
  const result = this.computeMetric();
  this.cachedMetric = result;
  this.cacheTime = Date.now();
  return result;
}
```

---

## Conclusion

The app-monitor system implements a comprehensive, multi-layered metrics infrastructure with:

- **Real-time metrics** via TaskQueueMetricsService for on-demand accuracy
- **Periodic emissions** via MetricsEmitter for monitoring integration
- **Quality observations** via QualityObservationService for workflow gates
- **Chain tracking** via ChainTrackerService for concurrency management
- **Intelligent caching** via ContextCache for expensive operations
- **Clean API exposure** via status routes for UI consumption

The architecture emphasizes **database-driven metrics** (SQLite as single source of truth) with **minimal caching** except for expensive operations like context bundle generation. All major calculation patterns (aggregation, weighting, rate calculation) are reusable across new metric implementations.

