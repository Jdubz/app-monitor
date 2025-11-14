# Context Integration Architecture Analysis

**Created:** 2025-11-14  
**Purpose:** Comprehensive codebase review before context management integration  
**Total Services Reviewed:** 107 files (~40K lines)

---

## Executive Summary

After comprehensive review of the codebase, I've identified:
- **NO duplication concerns** - Context system is new infrastructure
- **Clear integration points** - 3 services need modification
- **Existing patterns to follow** - Dependency injection, singleton patterns, testability
- **Schema already exists** - Task context storage tables present

---

## Existing Service Architecture

### Task Lifecycle Services (~190K lines reviewed)

#### 1. Task Creation Layer
```
TaskCreationService (8.9K)
├── Handles: Normalization, validation, deduplication
├── Dependencies: TaskQueueService, TaskCreationGuidelinesManager
├── Pattern: Constructor DI, async/await
└── Returns: TaskCreationResult { task, validation }

TaskTemplateValidator (21K) 
├── Handles: V3 template validation (to be deprecated)
├── Pattern: Pure validation functions
└── Note: Will be replaced by context-aware prompts

TaskCreationGuidelinesManager (25K)
├── Handles: Task type-specific guidelines
├── Pattern: Guideline loading and formatting
└── Integration: Used by TaskCreationService
```

#### 2. Task Storage Layer
```
TaskQueueService (69K)
├── Handles: SQLite task queue, CRUD, status management
├── Pattern: Singleton via factory
├── Schema: Full task model with metadata
└── Note: Already has context storage tables from migration 009

TaskContextService (8.1K) ⚠️ NAME COLLISION
├── Handles: Automation runs, creation/execution context
├── Pattern: Singleton via getTaskContextService()
├── Storage: task_automation_runs, task_creation_context, task_execution_context
└── Note: Different from context bundles - stores execution metadata
```

**⚠️ NAMING CONCERN:** 
- `TaskContextService` = Execution context storage (existing)
- `ContextBundleGenerator` = Context bundle generation (new)
- **No conflict** - Different responsibilities

#### 3. Task Execution Layer
```
TaskExecutionService (49K)
├── Handles: Container provisioning, execution coordination
├── Dependencies: EphemeralWorkerService, AgentSelector, TaskPromptTemplateManager
├── Pattern: Constructor DI with config
└── Integration Point: Needs context bundle mounting

EphemeralWorkerService (34K)
├── Handles: Docker container lifecycle
├── createWorker(): Creates container with volumes
├── Current Volumes: Logs, credentials, SSH keys, gh config
└── Integration Point: Add context volume here

TaskPromptTemplateManager (59K)
├── Handles: Prompt generation from task data
├── Pattern: Template-based with variables
├── Dependencies: TaskTypeGuidelines, WorkTargetDocumentation
└── Integration Point: Add context-aware prompt generation

TaskCompletionService (21K)
├── Handles: Task completion, verification, cleanup
├── Pattern: Event-driven with callbacks
└── Integration: May need context metadata capture
```

### Container Architecture (Ephemeral Worker Pattern)

**Current Volume Mounting Strategy:**
```typescript
// From ephemeralWorker.service.ts:240-328
const binds: string[] = [
  `${hostLogsDir}:/app/logs:rw`,                    // Log output
  `${logPath.hostPath}:${logPath.containerPath}:ro`, // Work-target logs
  `${claudeCredentials}:/tmp/host-creds.json:ro`,   // Claude auth
  `${gitCredentials}:/home/worker/.git-credentials:ro`, // Git auth
  `${sshDir}:/home/worker/.ssh:ro`,                 // SSH keys
  `${ghConfigDir}:/home/node/.config/gh:rw`         // GitHub CLI
];

// Container config
{
  Image: dockerImage,
  Cmd: ["/bin/sh", "-c", command],
  Env: [...],
  HostConfig: {
    Binds: binds,
    AutoRemove: true,
    NetworkMode: 'bridge'
  }
}
```

**Pattern:** Read-only mounts for credentials, read-write for logs/gh config

---

## Integration Points (No Duplication Detected)

### 1. TaskCreationService Extension ✅ SAFE

**Current:**
```typescript
class TaskCreationService {
  constructor(
    private taskQueue: TaskQueueService,
    private guidelinesManager: TaskCreationGuidelinesManager
  ) {}
  
  async createTask(taskData: EnhancedTaskData): Promise<TaskCreationResult> {
    const normalizedData = this.normalizeTaskData(taskData);
    await this.checkDuplicates(normalizedData);
    const validation = this.validateTask(normalizedData);
    const task = this.createTaskInQueue(taskData, normalizedData, validation);
    return { task, validation };
  }
}
```

**Integration Strategy:**
```typescript
import { ContextBundleGenerator } from './context/index.js';

class TaskCreationService {
  private contextGenerator: ContextBundleGenerator;
  
  constructor(
    private taskQueue: TaskQueueService,
    private guidelinesManager: TaskCreationGuidelinesManager,
    contextGenerator?: ContextBundleGenerator  // DI for testing
  ) {
    // Default initialization if not injected
    this.contextGenerator = contextGenerator || new ContextBundleGenerator({
      recipesDir: path.join(process.cwd(), 'config/context-recipes'),
      cacheOptions: { maxSize: 100, ttl: 3600000 }
    });
  }
  
  async createTask(taskData: EnhancedTaskData): Promise<TaskCreationResult> {
    const normalizedData = this.normalizeTaskData(taskData);
    await this.checkDuplicates(normalizedData);
    const validation = this.validateTask(normalizedData);
    
    // NEW: Generate context bundle
    let contextBundle = undefined;
    if (normalizedData.files?.length > 0) {
      const contextResult = await this.contextGenerator.generateBundle({
        taskType: normalizedData.type as any,
        targetFiles: normalizedData.files,
        force: false
      });
      
      if (contextResult.success && contextResult.bundle) {
        contextBundle = contextResult.bundle;
        logger.info({
          category: 'context',
          action: 'bundle_generated',
          message: `Generated context bundle for task`,
          details: {
            bundleId: contextBundle.id,
            profiles: contextBundle.metadata.profiles,
            sizeBytes: contextBundle.metadata.totalBytes
          }
        });
      }
    }
    
    // Pass context metadata to queue
    const task = this.createTaskInQueue({
      ...taskData,
      contextBundleId: contextBundle?.id,
      contextCacheKey: contextBundle?.cacheKey,
      contextProfiles: contextBundle?.metadata.profiles
    }, normalizedData, validation);
    
    return { task, validation, contextBundle };
  }
}
```

**No Conflicts:** 
- Uses existing DI pattern
- Preserves backward compatibility
- Adds optional context bundle field to result

### 2. EphemeralWorkerService Volume Mounting ✅ SAFE

**Current Pattern:**
```typescript
async createWorker(task: Task, agent: AgentPersonality): Promise<EphemeralWorker> {
  // ... existing setup ...
  
  const binds: string[] = [
    `${hostLogsDir}:/app/logs:rw`,
    // ... existing credential mounts ...
  ];
  
  // Create container with binds
  const container = await this.docker.createContainer({
    HostConfig: { Binds: binds }
  });
}
```

**Integration Strategy:**
```typescript
import { ContextBundleGenerator } from './context/index.js';

class EphemeralWorkerService {
  private contextGenerator: ContextBundleGenerator;
  
  constructor(
    docker: Docker,
    dockerManager: DockerManager,
    config: Partial<EphemeralWorkerServiceConfig> = {},
    contextGenerator?: ContextBundleGenerator  // DI
  ) {
    // ... existing setup ...
    this.contextGenerator = contextGenerator || new ContextBundleGenerator({
      recipesDir: path.join(process.cwd(), 'config/context-recipes'),
      cacheOptions: { maxSize: 100, ttl: 3600000 }
    });
  }
  
  async createWorker(task: Task, agent: AgentPersonality): Promise<EphemeralWorker> {
    // ... existing setup ...
    
    const binds: string[] = [
      `${hostLogsDir}:/app/logs:rw`,
      // ... existing credential mounts ...
    ];
    
    // NEW: Add context volume if available
    if (task.contextCacheKey) {
      const contextResult = await this.contextGenerator.getBundle(task.contextCacheKey);
      
      if (contextResult.success && contextResult.bundle?.mountPath) {
        binds.push(`${contextResult.bundle.mountPath}:/workspace/context:ro`);
        logger.info({
          category: 'context',
          action: 'context_mounted',
          message: `Mounted context bundle in container`,
          details: {
            taskId: task.id,
            bundleId: contextResult.bundle.id,
            profiles: task.contextProfiles,
            mountPath: '/workspace/context'
          }
        });
      }
    }
    
    // Create container with context mount
    const container = await this.docker.createContainer({
      HostConfig: { Binds: binds }
    });
    
    // ... rest of execution ...
  }
}
```

**No Conflicts:**
- Adds to existing binds array
- Uses same read-only pattern as credentials
- Gracefully skips if no context available

### 3. TaskPromptTemplateManager Enhancement ✅ SAFE

**Current Pattern:**
```typescript
class TaskPromptTemplateManager {
  generatePrompt(context: TaskContext): string {
    // Template-based generation
    const template = this.getTemplateForTaskType(context.task.type);
    const variables = this.getVariables(context);
    return this.interpolate(template, variables);
  }
}
```

**Integration Strategy:**
```typescript
import type { ContextBundle } from '../types/contextBundle.js';

class TaskPromptTemplateManager {
  // NEW: Context-aware prompt generation
  async generateContextAwarePrompt(
    context: TaskContext,
    contextBundle?: ContextBundle
  ): Promise<string> {
    const sections: string[] = [];
    
    // Existing template generation
    const basePrompt = this.generatePrompt(context);
    sections.push(basePrompt);
    
    // NEW: Add context-specific sections if bundle available
    if (contextBundle) {
      sections.push(this.generateContextSection(contextBundle));
      sections.push(this.generateInvestigationSection(contextBundle));
      sections.push(this.generateConstraintsSection(contextBundle));
    }
    
    return sections.join('\n\n');
  }
  
  private generateContextSection(bundle: ContextBundle): string {
    const lines = [
      '## Available Context Files',
      '',
      'You have access to these context files in /workspace/context/:',
      ''
    ];
    
    for (const profile of bundle.metadata.profiles) {
      lines.push(`- /workspace/context/${profile}.md`);
    }
    
    lines.push('', 'Read these files before making changes.');
    return lines.join('\n');
  }
  
  private generateInvestigationSection(bundle: ContextBundle): string {
    const steps: string[] = [];
    
    // Extract investigation steps from bundle metadata
    for (const [profile, content] of Object.entries(bundle.profileContents)) {
      if (content.investigationSteps) {
        steps.push(...content.investigationSteps);
      }
    }
    
    if (steps.length === 0) return '';
    
    const lines = ['## Investigation Steps', ''];
    steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
    
    return lines.join('\n');
  }
  
  private generateConstraintsSection(bundle: ContextBundle): string {
    const constraints: string[] = [];
    
    for (const [profile, content] of Object.entries(bundle.profileContents)) {
      if (content.constraints) {
        constraints.push(...content.constraints);
      }
    }
    
    if (constraints.length === 0) return '';
    
    const lines = ['## Context-Derived Constraints', ''];
    constraints.forEach(c => {
      lines.push(`- ${c}`);
    });
    
    return lines.join('\n');
  }
}
```

**No Conflicts:**
- Adds new method alongside existing ones
- Backward compatible (existing code unchanged)
- Composes with existing prompt generation

---

## Database Schema Analysis

### Existing Context Storage (Migration 009)

```sql
-- task_creation_context: Stores creation-time metadata
CREATE TABLE task_creation_context (
  task_id TEXT PRIMARY KEY,
  context_json TEXT NOT NULL,  -- TaskCreationContext
  created_at TEXT NOT NULL
);

-- task_execution_context: Stores execution-time metadata
CREATE TABLE task_execution_context (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  context_json TEXT NOT NULL,  -- TaskExecutionContext
  created_at TEXT NOT NULL
);
```

**Usage:** TaskContextService stores diagnostic context (environment, logs, etc.)

### Required Context Bundle Fields (Migration 015)

```sql
-- Add to tasks table
ALTER TABLE tasks ADD COLUMN context_bundle_id TEXT;
ALTER TABLE tasks ADD COLUMN context_cache_key TEXT;
ALTER TABLE tasks ADD COLUMN context_profiles TEXT; -- JSON array
ALTER TABLE tasks ADD COLUMN risk_level TEXT 
  CHECK(risk_level IN ('minimal', 'low', 'medium', 'high'));

-- Index for bundle lookups
CREATE INDEX idx_tasks_context_cache_key ON tasks(context_cache_key);
```

**No Overlap:** Context bundles are separate from execution context

---

## Dependency Injection Pattern Analysis

### Current Pattern (Consistent Across Services)

```typescript
// Pattern 1: Constructor DI with optional config
class ServiceName {
  constructor(
    private dependency1: Dependency1,
    private dependency2: Dependency2,
    config?: Partial<ServiceConfig>
  ) {
    this.config = { ...defaults, ...config };
  }
}

// Pattern 2: Factory with singleton
let instance: Service | null = null;

export function getService(): Service {
  if (!instance) {
    instance = new Service(/* deps */);
  }
  return instance;
}

export function resetService(): void {
  instance = null;  // For testing
}
```

### Recommended Pattern for Context Integration

```typescript
// ContextBundleGenerator uses Pattern 1 (already implemented)
class ContextBundleGenerator {
  constructor(config: ContextGeneratorConfig) {
    // ...
  }
}

// Services that use it follow Pattern 1 with optional DI
class TaskCreationService {
  private contextGenerator: ContextBundleGenerator;
  
  constructor(
    private taskQueue: TaskQueueService,
    private guidelinesManager: TaskCreationGuidelinesManager,
    contextGenerator?: ContextBundleGenerator  // Optional for DI
  ) {
    this.contextGenerator = contextGenerator || new ContextBundleGenerator({
      recipesDir: path.join(process.cwd(), 'config/context-recipes'),
      cacheOptions: { maxSize: 100, ttl: 3600000 }
    });
  }
}
```

**Advantages:**
- Testable (inject mocks)
- Sensible defaults (works without injection)
- Consistent with codebase patterns

---

## Test Coverage Patterns

### Existing Test Structure

```
backend/src/services/
├── taskCreation.service.ts
├── taskCreation.service.test.ts  ❌ MISSING
├── taskExecution.service.ts
├── taskExecution.service.test.ts  ❌ MISSING
├── taskPromptTemplates.ts
└── taskPromptTemplates.test.ts    ✅ EXISTS (51K)
```

**Note:** Some services lack dedicated tests (rely on integration tests)

### Required Test Coverage for Integration

```
backend/src/services/
├── taskCreation.service.test.ts  (NEW)
│   ├── Test: Context bundle generation on task creation
│   ├── Test: Graceful fallback if context generation fails
│   └── Test: Context metadata stored in task
│
├── ephemeralWorker.service.test.ts  (NEW)
│   ├── Test: Context volume mounted when available
│   ├── Test: Container created without context if missing
│   └── Test: Read-only mount enforced
│
└── taskPromptTemplates.test.ts  (EXTEND)
    ├── Test: Context-aware prompt generation
    ├── Test: Investigation steps extracted from bundle
    └── Test: Constraints injected from bundle
```

### Integration Test Structure

```
backend/src/services/__tests__/
└── context-integration.test.ts  (NEW)
    ├── Test: End-to-end task creation with context
    ├── Test: Context bundle persisted and retrievable
    ├── Test: Context mounted in container
    ├── Test: Prompt generated with context references
    └── Test: Task executes successfully with context
```

---

## Configuration Management

### Existing Config Pattern

```typescript
// config.ts
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir: process.env.DATA_DIR || './data',
  // ...
};
```

### Required Context Config

```typescript
// config.ts additions
export const config = {
  // ... existing ...
  
  context: {
    recipesDir: process.env.CONTEXT_RECIPES_DIR || 
                path.join(process.cwd(), 'config/context-recipes'),
    cacheMaxSize: parseInt(process.env.CONTEXT_CACHE_SIZE || '100', 10),
    cacheTTL: parseInt(process.env.CONTEXT_CACHE_TTL || '3600000', 10),
    bundleGenTimeout: parseInt(process.env.CONTEXT_BUNDLE_TIMEOUT || '10000', 10),
    enableContextBundles: process.env.ENABLE_CONTEXT_BUNDLES === 'true'
  }
};
```

### Feature Flag Strategy

```typescript
// Gradual rollout via feature flag
if (config.context.enableContextBundles) {
  // Generate and use context bundles
} else {
  // Skip context generation (backward compatible)
}
```

---

## Error Handling Patterns

### Existing Pattern (Consistent)

```typescript
try {
  const result = await someOperation();
  logger.info({
    category: 'operation_category',
    action: 'operation_succeeded',
    message: 'Success message',
    details: { ... }
  });
  return result;
} catch (error) {
  logger.error({
    category: 'operation_category',
    action: 'operation_failed',
    message: 'Failure message',
    error
  });
  throw error;  // Or handle gracefully
}
```

### Recommended for Context Integration

```typescript
// Context generation failures should NOT block task creation
try {
  const contextResult = await this.contextGenerator.generateBundle({
    taskType: task.type,
    targetFiles: task.files
  });
  
  if (contextResult.success && contextResult.bundle) {
    task.contextBundleId = contextResult.bundle.id;
    logger.info({
      category: 'context',
      action: 'bundle_generated',
      message: `Context bundle generated for task ${task.id}`
    });
  }
} catch (error) {
  // Log but don't fail - context is enhancement, not requirement
  logger.warn({
    category: 'context',
    action: 'bundle_generation_failed',
    message: `Failed to generate context bundle for task ${task.id}`,
    error
  });
  // Task proceeds without context
}
```

---

## Summary: Safe Integration Strategy

### ✅ No Duplication Risks Identified

1. **Context system is new infrastructure** - No overlap with existing services
2. **Clear separation of concerns:**
   - `TaskContextService` = Execution metadata storage
   - `ContextBundleGenerator` = Context bundle generation
   - No naming conflicts

### ✅ Integration Points Confirmed

1. **TaskCreationService** - Add optional context bundle generation
2. **EphemeralWorkerService** - Add context volume to binds array
3. **TaskPromptTemplateManager** - Add context-aware prompt method

### ✅ Patterns to Follow

1. **Dependency Injection** - Optional constructor parameter with default
2. **Error Handling** - Log and continue (context is enhancement)
3. **Testing** - Unit tests per service + integration tests
4. **Feature Flags** - Gradual rollout via `ENABLE_CONTEXT_BUNDLES`

### ✅ Next Steps (Day 1 Implementation)

1. Create context recipes (5 YAML files)
2. Add schema migration (context fields to tasks table)
3. Extend TaskCreationService (generate bundles)
4. Write unit tests for integration points

**Confidence Level: HIGH** - No architectural conflicts detected. Ready to proceed with systematic implementation.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|---------|---------|
| 1.0 | 2025-11-14 | Claude Code | Initial architecture analysis |
