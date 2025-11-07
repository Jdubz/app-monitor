# Context Blob Pre-Loading - Quick Reference

## TL;DR

**Problem:** Task execution spends 16-20 seconds on setup overhead (80% of total time)
**Solution:** Pre-load context blobs to reduce overhead by 70-80%
**Impact:** 2.85x faster task execution (20s → 7s per task)

---

## What Gets Cached

### Tier 1: Startup Cache (Load Once)
- ✅ Compiled prompt templates
- ✅ Agent personality data  
- ✅ Documentation index
- ✅ Task-type guidelines

### Tier 2: Hot Cache (Update Every 60s)
- ✅ Git repository snapshot
- ✅ Pre-built workspace Docker volume
- ✅ Credential cache

### Tier 3: Task Cache (Generate on Task Creation)
- ✅ Task-specific prompt blob
- ✅ Rendered acceptance criteria
- ✅ Custom documentation links

---

## Performance Gains

| Operation | Before | After | Savings |
|-----------|--------|-------|---------|
| Workspace Transfer | 10s | 1.5s | 8.5s (85%) |
| Git Operations | 2.5s | 0s | 2.5s (100%) |
| Prompt Generation | 300ms | 50ms | 250ms (83%) |
| Docker Setup | 1.5s | 800ms | 700ms (47%) |
| **TOTAL OVERHEAD** | **16s** | **2.95s** | **13.05s (82%)** |

**Throughput:** 6 → 17 tasks/minute (+185%)

---

## Key Files

### New Files (3)
```
backend/src/services/
├── promptCompiler.service.ts      (200 lines)
├── contextBlob.service.ts         (300 lines)
└── workspaceCache.service.ts      (400 lines)
```

### Modified Files (4)
```
backend/src/services/
├── taskExecution.service.ts       (10 lines changed)
├── taskQueue.sqlite.ts            (Add context_blob column)
├── taskPromptTemplates.ts         (Integrate compiler)
└── ephemeralWorker.service.ts     (Replace tar with volume)
```

---

## Implementation Timeline

**Week 1:** Prompt Compiler + Context Blob Service
**Week 2:** Workspace Cache + Docker Integration  
**Week 3:** Testing + Rollout

**Total:** 3 weeks, ~15 days of work

---

## Success Criteria

- [ ] Task overhead < 5 seconds (currently 16s)
- [ ] Cache hit rate > 95%
- [ ] Throughput > 15 tasks/minute (currently 6)
- [ ] Zero cache corruption in 30 days
- [ ] 99.9%+ uptime

---

## Quick Commands

```bash
# Create feature branch
git checkout -b feature/context-blob-preloading

# Run benchmarks
npm run benchmark:context-loading

# Test performance
npm run test:integration -- contextBlob

# Deploy to staging
npm run deploy:staging

# Monitor metrics
npm run monitor:cache-metrics
```

---

## Rollback Plan

1. Set `ENABLE_CONTEXT_BLOB_PRELOADING=false`
2. Restart backend services
3. Old flow automatically activated
4. No data loss (fallback to on-demand generation)

---

## Read More

- [Full Analysis](./CONTEXT_BLOB_PRELOADING_ANALYSIS.md) - Detailed performance analysis
- [Implementation Guide](./CONTEXT_BLOB_IMPLEMENTATION_GUIDE.md) - Code examples and tests

---

**Status:** Planning Complete ✅  
**Next Step:** Begin Phase 1 Implementation
