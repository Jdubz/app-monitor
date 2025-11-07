# Context Blob Pre-Loading - Implementation Guide

**Quick Reference for Implementation**
**See:** [Full Analysis](./CONTEXT_BLOB_PRELOADING_ANALYSIS.md)

---

## Quick Start

### 1. Files to Create

```
backend/src/services/
├── promptCompiler.service.ts          (NEW - 200 lines)
├── contextBlob.service.ts             (NEW - 300 lines)
└── workspaceCache.service.ts          (NEW - 400 lines)
```

### 2. Files to Modify

```
backend/src/services/
├── taskExecution.service.ts           (Modify: lines 370-380)
├── taskQueue.sqlite.ts                (Add column, update queries)
├── taskPromptTemplates.ts             (Integrate compiler)
└── ephemeralWorker.service.ts         (Replace tar+copy with volume clone)
```

---

## Code Snippets

### 1. Prompt Compiler Service (Minimal Implementation)

```typescript
// backend/src/services/promptCompiler.service.ts

export interface TemplateSection {
  type: 'static' | 'variable';
  content?: string;
  variableName?: string;
}

export class PromptCompilerService {
  private compiledTemplate: TemplateSection[] | null = null;

  /**
   * Compile template once on startup
   */
  compileTemplate(template: string): void {
    const sections: TemplateSection[] = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(template)) !== null) {
      if (match.index > lastIndex) {
        sections.push({
          type: 'static',
          content: template.substring(lastIndex, match.index)
        });
      }
      sections.push({
        type: 'variable',
        variableName: match[1].trim()
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < template.length) {
      sections.push({
        type: 'static',
        content: template.substring(lastIndex)
      });
    }

    this.compiledTemplate = sections;
    logger.info({
      category: 'prompt-compiler',
      action: 'template_compiled',
      message: `Compiled template with ${sections.length} sections`
    });
  }

  /**
   * Fast render with pre-compiled template
   */
  render(variableMap: Map<string, string>): string {
    if (!this.compiledTemplate) {
      throw new Error('Template not compiled');
    }

    return this.compiledTemplate.map(section => {
      if (section.type === 'static') {
        return section.content || '';
      } else {
        return variableMap.get(section.variableName || '') || '';
      }
    }).join('');
  }
}
```

### 2. Context Blob Service (Minimal Implementation)

```typescript
// backend/src/services/contextBlob.service.ts

export interface TaskContextBlob {
  version: string;
  taskId: string;
  generatedAt: number;
  prompt: string;
  agentId: string;
  workspaceSnapshot: string;
}

export class ContextBlobService {
  constructor(
    private templateManager: TaskPromptTemplateManager,
    private agentManager: AgentPersonalityManager
  ) {}

  /**
   * Generate context blob for task
   */
  generateBlob(task: Task, agent: AgentPersonality): TaskContextBlob {
    const taskContext = {
      task,
      agent,
      project: 'dev-monitor',
      worktree: '[dynamic]',
      environment: 'development' as const
    };

    const prompt = this.templateManager.generatePrompt(taskContext);

    const blob: TaskContextBlob = {
      version: '1.0',
      taskId: task.id,
      generatedAt: Date.now(),
      prompt,
      agentId: agent.id,
      workspaceSnapshot: 'current'
    };

    logger.info({
      category: 'context-blob',
      action: 'blob_generated',
      message: `Generated blob for task ${task.id}`,
      details: { size: JSON.stringify(blob).length }
    });

    return blob;
  }

  /**
   * Retrieve blob (from cache or generate)
   */
  getBlob(task: Task, agent: AgentPersonality): TaskContextBlob {
    // Try to get from task.context_blob
    if ((task as any).context_blob) {
      try {
        return JSON.parse((task as any).context_blob);
      } catch (error) {
        logger.warn({
          category: 'context-blob',
          action: 'blob_parse_failed',
          message: 'Failed to parse cached blob'
        });
      }
    }

    // Generate new blob
    return this.generateBlob(task, agent);
  }
}
```

### 3. Workspace Cache Service (Minimal Implementation)

```typescript
// backend/src/services/workspaceCache.service.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WorkspaceCacheService {
  private baseVolumeId: string | null = null;
  private isInitialized = false;

  /**
   * Initialize base workspace volume
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info({
      category: 'workspace-cache',
      action: 'initializing',
      message: 'Creating base workspace volume'
    });

    try {
      // Create base volume
      const volumeName = `workspace-base-${Date.now()}`;
      await execAsync(`docker volume create ${volumeName}`);

      this.baseVolumeId = volumeName;
      this.isInitialized = true;

      // Start background refresh (every 60 seconds)
      this.startRefreshTimer();

      logger.info({
        category: 'workspace-cache',
        action: 'initialized',
        message: `Base volume created: ${volumeName}`
      });
    } catch (error) {
      logger.error({
        category: 'workspace-cache',
        action: 'init_failed',
        message: 'Failed to initialize workspace cache',
        error
      });
      throw error;
    }
  }

  /**
   * Clone volume for task (fast copy-on-write)
   */
  async cloneForTask(taskId: string): Promise<string> {
    if (!this.baseVolumeId) {
      throw new Error('Base volume not initialized');
    }

    const taskVolume = `workspace-task-${taskId}`;

    try {
      // Create new volume
      await execAsync(`docker volume create ${taskVolume}`);

      // Copy from base volume (fast operation)
      // This is a simplified version - production would use docker cp
      logger.info({
        category: 'workspace-cache',
        action: 'volume_cloned',
        message: `Cloned volume for task ${taskId}`
      });

      return taskVolume;
    } catch (error) {
      logger.error({
        category: 'workspace-cache',
        action: 'clone_failed',
        message: `Failed to clone volume for task ${taskId}`,
        error
      });
      throw error;
    }
  }

  /**
   * Cleanup task volume
   */
  async cleanupTaskVolume(volumeId: string): Promise<void> {
    try {
      await execAsync(`docker volume rm ${volumeId}`);
      logger.info({
        category: 'workspace-cache',
        action: 'volume_cleaned',
        message: `Cleaned up volume ${volumeId}`
      });
    } catch (error) {
      logger.warn({
        category: 'workspace-cache',
        action: 'cleanup_failed',
        message: `Failed to cleanup volume ${volumeId}`,
        error
      });
    }
  }

  /**
   * Background refresh of base volume
   */
  private startRefreshTimer(): void {
    setInterval(async () => {
      await this.refreshBaseVolume();
    }, 60000); // 60 seconds
  }

  /**
   * Refresh base volume with latest git changes
   */
  private async refreshBaseVolume(): Promise<void> {
    if (!this.baseVolumeId) return;

    try {
      logger.info({
        category: 'workspace-cache',
        action: 'refreshing',
        message: 'Updating base volume'
      });

      // Update base volume (simplified - production would use git pull)
      // ... refresh logic here

      logger.info({
        category: 'workspace-cache',
        action: 'refreshed',
        message: 'Base volume updated'
      });
    } catch (error) {
      logger.error({
        category: 'workspace-cache',
        action: 'refresh_failed',
        message: 'Failed to refresh base volume',
        error
      });
    }
  }
}
```

### 4. Database Migration

```typescript
// backend/src/migrations/add_context_blob_column.ts

export function up(db: Database): void {
  db.exec(`
    ALTER TABLE tasks ADD COLUMN context_blob TEXT;
  `);

  logger.info({
    category: 'migration',
    action: 'migration_applied',
    message: 'Added context_blob column to tasks table'
  });
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN easily
  // This is a simplified version
  db.exec(`
    CREATE TABLE tasks_backup AS SELECT * FROM tasks;
    DROP TABLE tasks;
    CREATE TABLE tasks AS
      SELECT * EXCEPT (context_blob) FROM tasks_backup;
    DROP TABLE tasks_backup;
  `);
}
```

### 5. Integration with Task Execution

```typescript
// backend/src/services/taskExecution.service.ts

// BEFORE (lines 370-378):
const taskContext: TaskContext = {
  task: nextTask,
  agent: agent,
  project: (nextTask as any).project || 'dev-monitor',
  worktree: '[dynamic workspace provisioned per task]',
  environment: 'development'
};
nextTask.prompt = this.templateManager.generatePrompt(taskContext);

// AFTER:
const taskContext: TaskContext = {
  task: nextTask,
  agent: agent,
  project: (nextTask as any).project || 'dev-monitor',
  worktree: '[dynamic workspace provisioned per task]',
  environment: 'development'
};

// Use cached context blob if available
const contextBlob = this.contextBlobService.getBlob(nextTask, agent);
nextTask.prompt = contextBlob.prompt;

logger.info({
  category: 'task-execution',
  action: 'context_loaded',
  message: `Loaded context blob for task ${nextTask.id}`,
  details: {
    cached: !!(nextTask as any).context_blob,
    blobAge: Date.now() - contextBlob.generatedAt
  }
});
```

### 6. Service Initialization

```typescript
// backend/src/services/devBotsManager.factory.ts

export function createDevBotsManager(config: DevBotsManagerConfig) {
  // Initialize new services
  const promptCompiler = new PromptCompilerService();
  const contextBlobService = new ContextBlobService(
    templateManager,
    agentManager
  );
  const workspaceCache = new WorkspaceCacheService();

  // Initialize workspace cache
  await workspaceCache.initialize();

  // Compile prompt template
  const template = templateManager.getTemplate();
  promptCompiler.compileTemplate(template.template);

  // Pass to TaskExecutionService
  const taskExecutionService = new TaskExecutionService(
    taskQueue,
    agentManager,
    templateManager,
    workspaceOrchestrator,
    ephemeralWorkerService,
    taskPersistence,
    {
      ...config,
      contextBlobService,  // NEW
      workspaceCache       // NEW
    }
  );

  return devBotsManager;
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// backend/src/services/__tests__/promptCompiler.test.ts

describe('PromptCompilerService', () => {
  it('should compile template on initialization', () => {
    const compiler = new PromptCompilerService();
    const template = 'Hello {{name}}, welcome to {{project}}!';

    compiler.compileTemplate(template);

    const result = compiler.render(new Map([
      ['name', 'Alice'],
      ['project', 'DevBots']
    ]));

    expect(result).toBe('Hello Alice, welcome to DevBots!');
  });

  it('should be faster than string replacement', () => {
    const compiler = new PromptCompilerService();
    const largeTemplate = '{{var1}}'.repeat(1000);

    compiler.compileTemplate(largeTemplate);

    const start = Date.now();
    compiler.render(new Map([['var1', 'test']]));
    const compiledTime = Date.now() - start;

    // Should be < 10ms
    expect(compiledTime).toBeLessThan(10);
  });
});
```

### Integration Tests

```typescript
// backend/src/services/__tests__/contextBlob.integration.test.ts

describe('Context Blob Integration', () => {
  it('should generate and cache context blob', async () => {
    const task = createTestTask();
    const agent = createTestAgent();

    // First generation
    const blob1 = contextBlobService.generateBlob(task, agent);

    // Store in database
    taskQueue.updateTask(task.id, { context_blob: JSON.stringify(blob1) });

    // Retrieve from cache
    const blob2 = contextBlobService.getBlob(task, agent);

    expect(blob2.taskId).toBe(blob1.taskId);
    expect(blob2.prompt).toBe(blob1.prompt);
  });

  it('should improve performance by 70%+', async () => {
    const task = createTestTask();
    const agent = createTestAgent();

    // Measure without cache
    const start1 = Date.now();
    for (let i = 0; i < 100; i++) {
      templateManager.generatePrompt({ task, agent, ... });
    }
    const uncachedTime = Date.now() - start1;

    // Measure with cache
    const blob = contextBlobService.generateBlob(task, agent);
    const start2 = Date.now();
    for (let i = 0; i < 100; i++) {
      contextBlobService.getBlob(task, agent);
    }
    const cachedTime = Date.now() - start2;

    const improvement = (uncachedTime - cachedTime) / uncachedTime;
    expect(improvement).toBeGreaterThan(0.7); // 70% improvement
  });
});
```

---

## Performance Benchmarks

### Benchmark Script

```typescript
// scripts/benchmark-context-loading.ts

import { performance } from 'perf_hooks';

async function benchmarkContextLoading() {
  const iterations = 100;

  console.log('Benchmarking context loading performance...\n');

  // Benchmark 1: Original prompt generation
  const start1 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const prompt = templateManager.generatePrompt(taskContext);
  }
  const originalTime = performance.now() - start1;

  // Benchmark 2: Cached blob retrieval
  const blob = contextBlobService.generateBlob(task, agent);
  const start2 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const cachedBlob = contextBlobService.getBlob(task, agent);
  }
  const cachedTime = performance.now() - start2;

  // Results
  console.log('Results:');
  console.log(`Original: ${originalTime.toFixed(2)}ms for ${iterations} iterations`);
  console.log(`Cached: ${cachedTime.toFixed(2)}ms for ${iterations} iterations`);
  console.log(`Per-task savings: ${((originalTime - cachedTime) / iterations).toFixed(2)}ms`);
  console.log(`Improvement: ${(((originalTime - cachedTime) / originalTime) * 100).toFixed(1)}%`);
}

benchmarkContextLoading();
```

---

## Deployment Checklist

### Pre-deployment

- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Performance benchmarks meet targets (70%+ improvement)
- [ ] Code review completed
- [ ] Documentation updated

### Database Migration

- [ ] Backup production database
- [ ] Run migration script in staging
- [ ] Verify migration success
- [ ] Run migration in production
- [ ] Verify no data loss

### Monitoring Setup

- [ ] Add Prometheus metrics for cache hit rate
- [ ] Add metrics for blob generation time
- [ ] Add metrics for volume clone time
- [ ] Create Grafana dashboard
- [ ] Set up alerts for cache failures

### Rollout Plan

1. **Week 1:** Deploy to staging, monitor for issues
2. **Week 2:** Enable for 10% of production tasks
3. **Week 3:** Enable for 50% of production tasks
4. **Week 4:** Enable for 100% of production tasks

### Rollback Procedure

If issues detected:
1. Set `ENABLE_CONTEXT_BLOB_PRELOADING=false`
2. Restart backend services
3. Monitor task execution
4. Investigate root cause
5. Fix and redeploy

---

## Success Metrics

Monitor these metrics for 30 days post-deployment:

- [ ] Task overhead reduced by 70%+
- [ ] Cache hit rate >95%
- [ ] No cache corruption incidents
- [ ] Throughput increased by 150%+
- [ ] No memory leaks detected
- [ ] 99.9%+ uptime for cache service

---

## Next Steps

1. **Create feature branch:** `git checkout -b feature/context-blob-preloading`
2. **Implement Phase 1:** Prompt compiler service
3. **Add tests:** Unit + integration tests
4. **Benchmark:** Measure performance improvements
5. **Code review:** Get team approval
6. **Deploy to staging:** Test in real environment
7. **Monitor:** Track metrics for 1 week
8. **Production rollout:** Gradual deployment

---

**Quick Links:**
- [Full Analysis](./CONTEXT_BLOB_PRELOADING_ANALYSIS.md)
- [Implementation Roadmap](./CONTEXT_BLOB_PRELOADING_ANALYSIS.md#7-implementation-roadmap)
- [Performance Impact](./CONTEXT_BLOB_PRELOADING_ANALYSIS.md#6-performance-impact-analysis)
