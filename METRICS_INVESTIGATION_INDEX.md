# Metrics and Progress Tracking Systems Investigation - Index

## Overview

This directory contains a complete technical investigation of all metrics and progress tracking systems in the app-monitor codebase. The investigation was conducted with "very thorough" scope to identify all metrics-related services, code, and patterns.

## Deliverables

### 1. Main Technical Report
**File:** `METRICS_AND_PROGRESS_TRACKING_INVESTIGATION.md` (795 lines)

A comprehensive technical documentation covering:
- All 5 core metrics services with detailed explanations
- Database schema and storage patterns
- SQL aggregation patterns used throughout the codebase
- API endpoints for metrics exposure
- Caching strategies (LRU + persistence)
- Real-time vs batch processing models
- Reusable calculation patterns
- Performance considerations and scalability notes
- Complete data flow diagrams
- Metrics summary table
- Implementation guide for new metrics

### 2. Files Reference
**File:** `METRICS_FILES_SUMMARY.txt` (217 lines)

Organized reference of all discovered files including:
- 5 core metrics services
- Database implementation
- 4 API endpoints
- Caching system
- Central manager
- 6+ related services
- Test suites
- Type definitions
- Configuration
- Logging system

## Quick Start

### For New Contributors
1. Read the Executive Summary in `METRICS_AND_PROGRESS_TRACKING_INVESTIGATION.md`
2. Review the diagrams and tables (sections 8-9)
3. Check `METRICS_FILES_SUMMARY.txt` for file locations

### For Implementation
1. Start with section 6 (Reusable Patterns)
2. Follow section 10 (Implementation Guide)
3. Reference the SQL patterns in section 1

### For Optimization
1. Review section 7 (Performance Considerations)
2. Check the Metrics Summary Table (section 9)
3. Consider the optimization opportunities listed

## Key Findings

### Architecture
The system uses a **multi-layered metrics approach**:
- Real-time metrics via direct SQL queries (TaskQueueMetricsService)
- Periodic metrics emission every 60 seconds (MetricsEmitter)
- Quality observations computed on verification (QualityObservationService)
- Chain progress tracked in real-time (ChainTrackerService)
- Context cache with LRU + persistence (ContextCache)

### Storage
- **Primary:** SQLite database (single source of truth)
- **Tables:** tasks, task_executions, workers, context_bundle_cache
- **Indexes:** Optimized for status, agent_type, chain_id, pr_number
- **No persistent snapshots:** Metrics computed on-demand

### Calculation Patterns
All metrics use standardized patterns:
1. **Success Rate:** `(completed / (completed + failed)) * 100`
2. **Weighted Scoring:** Multi-component weighted average with normalization
3. **Time Windows:** Optional lookback periods (default 30 days)
4. **Aggregation:** GROUP BY dimensions (status, agent_type, complexity)
5. **Conditional Logic:** CASE statements for status-based counting

### API Exposure
4 main REST endpoints:
- `GET /api/dev-bots/status` - System and worker status
- `GET /api/dev-bots/metrics` - Queue metrics and duration stats
- `GET /api/dev-bots/agent-comparison` - Agent performance
- `GET /api/dev-bots/health` - Health check

## Core Services Overview

| Service | File | Purpose | Update Frequency |
|---------|------|---------|------------------|
| TaskQueueMetricsService | taskQueueMetrics.service.ts | Real-time queue metrics | On-demand (0-100ms) |
| MetricsEmitter | metricsEmitter.ts | Periodic system metrics | Every 60 seconds |
| ChainTrackerService | chainTracker.service.ts | Chain progress tracking | Real-time |
| QualityObservationService | qualityObservation.service.ts | Quality scoring | On verification |
| StatusAggregationService | statusAggregation.service.ts | Status aggregation | On-demand |
| ContextCache | contextCache.ts | Context bundle caching | On access |

## Metrics Categories

### Queue Health
- Pending/Running/Completed/Failed/Cancelled/Timeout counts
- Average completion time (24h window)
- Oldest pending task age

### Agent Performance
- Claude success rate
- Codex success rate
- Average duration by agent
- Breakdown by task type (implementation, testing, documentation)

### Quality Metrics
- Overall score (0-100)
- Acceptance criteria met percentage
- Test coverage gap
- Quality gates status
- Ready for merge determination

### Chain Progress
- Active chains count
- Blocked chains count
- Queue depths by stage
- Chain completion status

### Cache Metrics
- Hit/miss/eviction counts
- Hit ratio
- LRU ordering

## Performance Characteristics

### Query Performance
| Query Type | Typical Time | Optimization |
|-----------|-------------|--------------|
| Status count | ~1ms | Indexed on status |
| Agent comparison | ~5-20ms | Conditional aggregation |
| Duration stats | ~10-50ms | JOIN with index |

### Caching Impact
- **Cache hit:** Save 100-500ms regeneration
- **Cache miss:** Full regeneration + persistence (500-2000ms)
- **Target ratio:** >80% hits after warmup

### Scalability
- No pagination (all results fetched)
- No sampling for historical data
- Index mitigation for full table scans
- Potential: Materialized views for frequent combinations

## Files by Importance

### Critical (Start Here)
1. `backend/src/services/taskQueueMetrics.service.ts` - Core metrics
2. `backend/src/services/taskQueue.sqlite.ts` - Database schema
3. `backend/src/routes/dev-bots/status.routes.ts` - API exposure

### High Priority
4. `backend/src/services/qualityObservation.service.ts` - Quality scoring
5. `backend/src/services/chainTracker.service.ts` - Chain tracking
6. `backend/src/services/metricsEmitter.ts` - Periodic emission

### Medium Priority
7. `backend/src/services/context/contextCache.ts` - Caching
8. `backend/src/services/devBotsManager.ts` - Delegation
9. `backend/src/services/statusAggregation.service.ts` - Aggregation

## How to Use This Investigation

### For Understanding Current System
1. Read sections 1-3 of main report for service overview
2. Review section 2 for database schema
3. Check section 3 for API endpoints

### For Implementation of New Metrics
1. Follow section 6 (Patterns)
2. Use section 10 (Implementation Guide)
3. Reference SQL patterns in section 1

### For Performance Optimization
1. Review section 7 (Performance)
2. Check section 9 (Metrics Table)
3. Consider optimization opportunities

### For Caching Strategy
1. Read section 4 (Caching Strategies)
2. Review ContextCache implementation
3. Understand LRU + persistence pattern

## Related Documentation

The following architectural documents provide context:
- `docs/technicalDesigns/staged-task-queue-implementation-plan.md` - Chain tracking architecture
- `docs/technicalDesigns/app-monitor-resilience-and-deployments.md` - System resilience patterns
- `README.md` - Project overview

## Key Insights

1. **Database-Driven:** SQLite is single source of truth; metrics computed on-demand
2. **Minimal Caching:** Only ContextCache uses persistent caching (for expensive operations)
3. **Real-Time Accuracy:** No stale metric caches for primary metrics
4. **Scalable Patterns:** Reusable SQL patterns for new metric additions
5. **Well-Indexed:** Database queries optimized for metrics access patterns
6. **Clean API:** Metrics exposed via standard REST endpoints
7. **Health Detection:** Built-in system health determination logic
8. **Progress Tracking:** Chain completion detection, blocked chain management

## Questions Answered

This investigation answers these key questions:

1. **What metrics exist?** - Complete list of all 20+ metrics across 6 categories
2. **How are they computed?** - Detailed SQL patterns and calculation formulas
3. **Where are they stored?** - Database tables, schemas, and indexes documented
4. **How is progress calculated?** - Explicit formulas for completion, quality, progress
5. **What patterns are reusable?** - 6 documented patterns for new metrics
6. **What about caching?** - LRU with SQLite persistence fully documented
7. **How do I add new metrics?** - Step-by-step implementation guide provided
8. **What's the performance impact?** - Benchmarks and optimization opportunities included

## Document Versions

- **Investigation Date:** November 14, 2025
- **Scope:** Very Thorough (all metrics systems)
- **Report Version:** 1.0
- **Total Lines:** 1,012 (795 report + 217 files reference)

---

For detailed technical content, see `METRICS_AND_PROGRESS_TRACKING_INVESTIGATION.md`
For file locations and organization, see `METRICS_FILES_SUMMARY.txt`
