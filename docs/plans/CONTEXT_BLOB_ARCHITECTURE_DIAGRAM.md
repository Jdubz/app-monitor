# Context Blob Pre-Loading Architecture

## System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         CONTEXT BLOB PRE-LOADING SYSTEM                     │
└────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          TIER 1: STARTUP CACHE (Singleton)                  │
│                          Initialized Once on Boot                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────┐      ┌──────────────────────┐                  │
│  │ PromptCompilerService  │      │ AgentPersonality     │                  │
│  │ ─────────────────────  │      │ Manager              │                  │
│  │ • Parse template       │      │ ──────────────────   │                  │
│  │ • Create AST           │      │ • Load all agents    │                  │
│  │ • Pre-compile sections │      │ • Cache expertise    │                  │
│  │ • Store variable map   │      │ • Serialize to JSON  │                  │
│  └────────────────────────┘      └──────────────────────┘                  │
│                                                                              │
│  ┌────────────────────────┐      ┌──────────────────────┐                  │
│  │ DocumentationIndex     │      │ TaskTypeGuidelines   │                  │
│  │ ────────────────────   │      │ ───────────────────  │                  │
│  │ • Index all docs       │      │ • Load guidelines    │                  │
│  │ • Build keyword map    │      │ • Cache by type      │                  │
│  │ • Pre-format links     │      │ • Pre-render MD      │                  │
│  └────────────────────────┘      └──────────────────────┘                  │
│                                                                              │
│  Time to Build: ~500ms            Memory: ~50MB                             │
│  Refresh: Never (static)          Hit Rate: 100%                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TIER 2: HOT CACHE (Warm)                           │
│                       Refreshed Every 30-60 Seconds                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │ WorkspaceCacheService                                        │           │
│  │ ───────────────────────────────────────────────────────────  │           │
│  │                                                               │           │
│  │  Base Docker Volume:                                         │           │
│  │  ┌────────────────────────────────────────────────────┐     │           │
│  │  │ workspace-base-<timestamp>                          │     │           │
│  │  │ ──────────────────────────────                      │     │           │
│  │  │ • Full repository clone                             │     │           │
│  │  │ • All source code                                   │     │           │
│  │  │ • Dependencies installed                            │     │           │
│  │  │ • Git configured                                    │     │           │
│  │  │ • Branch: staging                                   │     │           │
│  │  └────────────────────────────────────────────────────┘     │           │
│  │                                                               │           │
│  │  Background Refresh Job (every 60s):                         │           │
│  │  1. git fetch origin                                         │           │
│  │  2. git pull origin staging                                  │           │
│  │  3. Update volume in-place                                   │           │
│  │                                                               │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │ Git Repository Snapshot                                      │           │
│  │ ─────────────────────────────────────────────────────────    │           │
│  │ • Current HEAD SHA                                           │           │
│  │ • Latest commit info                                         │           │
│  │ • Branch status                                              │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                              │
│  Time to Build: ~10s              Memory: ~500MB (volume)                   │
│  Refresh: Every 60s               Hit Rate: 99%+                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TIER 3: TASK CACHE (Per-Task)                      │
│                       Generated on Task Creation                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │ ContextBlobService                                           │           │
│  │ ────────────────────────────────────────────────────────────  │           │
│  │                                                               │           │
│  │  For Each Task Created:                                      │           │
│  │  1. Get compiled template (Tier 1)                           │           │
│  │  2. Inject task-specific variables                           │           │
│  │  3. Resolve documentation links                              │           │
│  │  4. Render full prompt                                       │           │
│  │  5. Store in SQLite (context_blob column)                    │           │
│  │                                                               │           │
│  │  TaskContextBlob {                                           │           │
│  │    version: "1.0",                                           │           │
│  │    taskId: "abc-123",                                        │           │
│  │    generatedAt: 1234567890,                                  │           │
│  │    prompt: "... full 1000+ line prompt ...",                 │           │
│  │    agentId: "backend-specialist",                            │           │
│  │    workspaceSnapshot: "workspace-base-1234567890"            │           │
│  │  }                                                            │           │
│  │                                                               │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                              │
│  Time to Build: ~50ms             Storage: ~200KB per blob                  │
│  Lifetime: Until task complete    Hit Rate: 100% (after first gen)          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TASK EXECUTION FLOW (Optimized)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Task Assignment (200ms)                                                 │
│     ┌─────────────────────────────────────────────────────┐                │
│     │ TaskExecutionService.assignNextTask()               │                │
│     │ ────────────────────────────────────────────────    │                │
│     │ • Get next task from SQLite (50ms)                  │                │
│     │ • Retrieve context blob from task.context_blob      │                │
│     │   (already pre-generated, just JSON.parse) (10ms)   │                │
│     │ • Get agent data from Tier 1 cache (10ms)           │                │
│     │ • Prompt = blob.prompt (instant, no generation!)    │                │
│     └─────────────────────────────────────────────────────┘                │
│                                                                              │
│  2. Container Initialization (2s)                                           │
│     ┌─────────────────────────────────────────────────────┐                │
│     │ WorkspaceCacheService.cloneForTask()                │                │
│     │ ───────────────────────────────────────────────     │                │
│     │ • Clone base volume for task (1.5s)                 │                │
│     │   docker volume create workspace-task-123           │                │
│     │   docker cp base-volume:/ task-volume:/             │                │
│     │ • Mount credentials (100ms)                         │                │
│     │ • NO tar/docker cp pipeline! (HUGE WIN)             │                │
│     └─────────────────────────────────────────────────────┘                │
│                                                                              │
│  3. Docker Run (300ms)                                                      │
│     ┌─────────────────────────────────────────────────────┐                │
│     │ docker run --rm                                     │                │
│     │   -v workspace-task-123:/workspace:rw               │                │
│     │   -v ~/.claude:/tmp/creds:ro                        │                │
│     │   dev-bot:latest                                    │                │
│     │   claude --print "[pre-generated prompt]"           │                │
│     └─────────────────────────────────────────────────────┘                │
│                                                                              │
│  4. Task Execution (Variable: 30s - 20min)                                  │
│     ┌─────────────────────────────────────────────────────┐                │
│     │ Claude/Codex CLI executes task...                   │                │
│     └─────────────────────────────────────────────────────┘                │
│                                                                              │
│  TOTAL SETUP TIME: ~2.5s (vs 16-20s before)                                │
│  PERFORMANCE GAIN: 84% faster initialization                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
TASK CREATION FLOW:
═══════════════════

User/System
    │
    ├─> Create Task
    │   ├─> Validate inputs
    │   ├─> Assign to agent
    │   └─> Generate context blob ──┐
    │                                ├─> PromptCompilerService (Tier 1)
    │                                │   └─> Render with task vars
    │                                ├─> AgentManager (Tier 1)
    │                                │   └─> Get agent data
    │                                └─> DocumentationIndex (Tier 1)
    │                                    └─> Resolve doc links
    │
    └─> Store in SQLite
        └─> tasks.context_blob = JSON.stringify(blob)


TASK EXECUTION FLOW:
═══════════════════

Task Queue
    │
    ├─> Dequeue next task
    │   └─> SELECT * FROM tasks WHERE status = 'pending' LIMIT 1
    │
    ├─> Load context blob
    │   └─> blob = JSON.parse(task.context_blob)  [FAST: ~10ms]
    │
    ├─> Clone workspace volume
    │   └─> WorkspaceCacheService.cloneForTask()
    │       ├─> Source: workspace-base-123 (Tier 2)
    │       └─> Dest: workspace-task-456 (new volume)
    │           └─> Copy-on-write (Docker magic) [FAST: ~1.5s]
    │
    ├─> Execute in Docker
    │   └─> docker run --rm -v workspace-task-456:/workspace
    │       └─> claude --print "[blob.prompt]"
    │
    └─> Cleanup
        └─> docker volume rm workspace-task-456
```

## Cache Invalidation Strategy

```
┌─────────────────────────────────────────────────────────────┐
│               CACHE INVALIDATION TRIGGERS                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Tier 1 (Startup Cache):                                    │
│  • Invalidate on: Service restart                           │
│  • TTL: Infinite (until restart)                            │
│  • Strategy: Full rebuild on boot                           │
│                                                              │
│  Tier 2 (Hot Cache):                                        │
│  • Invalidate on: Git changes detected                      │
│  • TTL: 60 seconds (background refresh)                     │
│  • Strategy: Incremental update (git pull)                  │
│                                                              │
│  Tier 3 (Task Cache):                                       │
│  • Invalidate on: Task update/modification                  │
│  • TTL: Until task completion                               │
│  • Strategy: Regenerate if task changed                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Invalidation Logic:

if (tier1.needsRefresh()) {
  // Service restart - rebuild everything
  tier1.rebuild();
}

if (tier2.isStale() || tier2.age > 60000) {
  // Background job every 60s
  tier2.refresh();
}

if (tier3.taskModified(taskId)) {
  // Task changed - regenerate blob
  tier3.invalidate(taskId);
  tier3.generate(taskId);
}
```

## Memory and Storage Impact

```
┌──────────────────────────────────────────────────────────────┐
│                  RESOURCE UTILIZATION                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Tier 1 (In-Memory):                                         │
│  ┌────────────────────────────────────────────────┐          │
│  │ Compiled Templates:    ~5MB                    │          │
│  │ Agent Personalities:   ~500KB                  │          │
│  │ Documentation Index:   ~2MB                    │          │
│  │ Task Type Guidelines:  ~1MB                    │          │
│  │ ─────────────────────────────────              │          │
│  │ TOTAL:                ~8.5MB                   │          │
│  └────────────────────────────────────────────────┘          │
│                                                               │
│  Tier 2 (Docker Volumes):                                    │
│  ┌────────────────────────────────────────────────┐          │
│  │ Base Volume:          ~500MB                   │          │
│  │ Task Volumes (x10):   ~50MB each (COW)         │          │
│  │ ─────────────────────────────────              │          │
│  │ TOTAL:                ~1GB                     │          │
│  └────────────────────────────────────────────────┘          │
│                                                               │
│  Tier 3 (SQLite Database):                                   │
│  ┌────────────────────────────────────────────────┐          │
│  │ Context Blobs (x100): ~200KB each              │          │
│  │ ─────────────────────────────────              │          │
│  │ TOTAL:                ~20MB                    │          │
│  └────────────────────────────────────────────────┘          │
│                                                               │
│  GRAND TOTAL: ~1.03GB                                        │
│  (Acceptable for 50-80% performance improvement)             │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Error Handling and Fallback

```
┌──────────────────────────────────────────────────────────────┐
│               GRACEFUL DEGRADATION STRATEGY                   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  try {                                                        │
│    // Attempt to use cached context blob                     │
│    blob = contextBlobService.getBlob(task, agent);           │
│  } catch (error) {                                           │
│    // Fallback to original flow (no performance gain)        │
│    logger.warn("Cache miss, falling back to generation");    │
│    blob = contextBlobService.generateBlob(task, agent);      │
│  }                                                            │
│                                                               │
│  try {                                                        │
│    // Attempt to clone workspace volume                      │
│    volumeId = workspaceCache.cloneForTask(taskId);           │
│  } catch (error) {                                           │
│    // Fallback to tar+docker cp (slower but reliable)        │
│    logger.warn("Volume clone failed, using tar pipeline");   │
│    await copyWorkspaceToContainer(containerId, repoRoot);    │
│  }                                                            │
│                                                               │
│  RESULT: System continues to work even if cache fails        │
│          (just slower, not broken)                            │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Performance Comparison

```
BEFORE (Without Context Blob Pre-loading):
═══════════════════════════════════════════

Task 1: ████████████████████ 20s (16s overhead + 4s work)
Task 2: ████████████████████ 20s (16s overhead + 4s work)
Task 3: ████████████████████ 20s (16s overhead + 4s work)
Task 4: ████████████████████ 20s (16s overhead + 4s work)
Task 5: ████████████████████ 20s (16s overhead + 4s work)
─────────────────────────────────────────────────────────
Total:  100s (80s overhead + 20s actual work)
Throughput: 3 tasks/minute


AFTER (With Context Blob Pre-loading):
══════════════════════════════════════

Task 1: ██████ 7s (3s overhead + 4s work)
Task 2: ██████ 7s (3s overhead + 4s work)
Task 3: ██████ 7s (3s overhead + 4s work)
Task 4: ██████ 7s (3s overhead + 4s work)
Task 5: ██████ 7s (3s overhead + 4s work)
─────────────────────────────────────────────────────────
Total:  35s (15s overhead + 20s actual work)
Throughput: 8.6 tasks/minute

IMPROVEMENT: 65% faster (100s → 35s)
             +186% throughput increase
```

---

**See Also:**
- [Full Analysis](./CONTEXT_BLOB_PRELOADING_ANALYSIS.md)
- [Implementation Guide](./CONTEXT_BLOB_IMPLEMENTATION_GUIDE.md)
- [Quick Reference](./CONTEXT_BLOB_QUICK_REFERENCE.md)
