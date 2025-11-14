# Context Management Integration Plan - PRIORITY P0

**Created:** 2025-11-14  
**Status:** 🔴 CRITICAL - Infrastructure complete but NOT integrated  
**Priority:** P0 (Blocking all autonomy features)  
**Owner:** Platform Team  
**Timeline:** 2-3 weeks for full integration

---

## Current Situation Analysis

### ✅ What's Built (Phase 1 - COMPLETE)
- **Infrastructure:** ~2400 lines, fully tested
- **Services:**
  - `ContextCache` - LRU cache with git hash keys
  - `ContextRecipeLoader` - YAML recipe loading
  - `ContextRecipeValidator` - Schema validation  
  - `ContextBundleGenerator` - Bundle creation
  - `ContextTransforms` - Content extraction
- **Types:** Complete type system (contextRecipe.ts, contextBundle.ts)
- **Tests:** 90%+ coverage (unit + integration)
- **Git Commit:** 4d79a33 (Nov 2025)

### ❌ What's NOT Integrated

**ZERO integration with task creation:**
```bash
# Current reality check:
$ grep -r "from.*context/index" backend/src/services/*.ts
# Result: NOTHING (only internal context/ imports)

$ ls config/context-recipes/
# Result: directory does not exist

$ grep "ContextBundle\|generateBundle" backend/src/services/taskExecution.service.ts
# Result: NOTHING
```

**Task flow is completely unchanged:**
1. API receives task via `POST /api/dev-bots/tasks`
2. Calls `devBotsManager.addTask(EnhancedTaskData)` 
3. `TaskCreationService.createTask()` validates and queues
4. `TaskExecutionService.executeTask()` runs Docker container
5. **Context system is never called**

---

## Integration Blockers (In Priority Order)

### 🚫 Blocker 1: No Context Recipes
**Problem:** Context infrastructure requires YAML recipes to function  
**Location:** `config/context-recipes/*.yaml`  
**Impact:** Cannot generate bundles without recipe definitions  
**Time to Fix:** 2-3 days

**Required Files:**
```
config/
└── context-recipes/
    ├── deployment.yaml         # Deployment guides, scripts, env vars
    ├── pr-workflow.yaml        # PR tracking, gates, Copilot delegation
    ├── failure-recovery.yaml   # Recovery patterns, cleanup rules
    ├── dev-monitor.yaml        # UI behavior, Socket.IO events
    └── scope-control.yaml      # Boundaries, forbidden operations
```

### 🚫 Blocker 2: No Task Type Integration
**Problem:** Task creation doesn't know about context system  
**Location:** `backend/src/services/taskCreation.service.ts`  
**Impact:** Tasks created without context metadata  
**Time to Fix:** 1 week

**Current Code:**
```typescript
// taskCreation.service.ts - NO CONTEXT REFERENCES
async createTask(taskData: EnhancedTaskData | SimpleTaskData) {
  const normalizedData = this.normalizeTaskData(taskData);
  await this.checkDuplicates(normalizedData);
  const validation = this.validateTask(normalizedData);
  const task = this.createTaskInQueue(taskData, normalizedData, validation);
  // ❌ NO CONTEXT BUNDLE GENERATION
  return { task, validation };
}
```

**Needed:**
```typescript
import { ContextBundleGenerator } from './context/index.js';

async createTask(taskData: MinimalTaskPayload) {
  // Auto-detect missing fields
  const normalized = await this.normalizePayload(taskData);
  
  // ✅ GENERATE CONTEXT BUNDLE
  const contextBundle = await this.contextGenerator.generateBundle({
    taskType: normalized.taskType,
    profiles: normalized.contextProfiles,
    targetFiles: normalized.targetFiles
  });
  
  // Store bundle metadata with task
  const task = await this.taskQueue.createTask({
    ...normalized,
    contextBundleId: contextBundle.id,
    contextCacheKey: contextBundle.cacheKey
  });
  
  return { task, contextBundle };
}
```

### 🚫 Blocker 3: No Container Context Mounting
**Problem:** Execution service doesn't mount context bundles  
**Location:** `backend/src/services/taskExecution.service.ts`  
**Impact:** Bots never see context files  
**Time to Fix:** 3-4 days

**Current Code:**
```typescript
// taskExecution.service.ts - NO CONTEXT MOUNTING
async executeTask(task: Task) {
  const worker = await this.ephemeralWorkerService.createWorker({
    taskId: task.id,
    workspaceDir: `/var/tmp/app-monitor-worktargets/${task.id}`,
    // ❌ NO CONTEXT VOLUME
  });
  // ...
}
```

**Needed:**
```typescript
async executeTask(task: Task) {
  // ✅ LOAD CONTEXT BUNDLE
  const contextBundle = await this.contextBundleGenerator.getBundle(
    task.contextCacheKey
  );
  
  // ✅ MOUNT AS READ-ONLY VOLUME
  const worker = await this.ephemeralWorkerService.createWorker({
    taskId: task.id,
    workspaceDir: `/var/tmp/app-monitor-worktargets/${task.id}`,
    contextDir: contextBundle.mountPath,
    volumes: {
      '/workspace': { bind: taskWorkspace, mode: 'rw' },
      '/workspace/context': { bind: contextBundle.mountPath, mode: 'ro' }
    },
    env: {
      CONTEXT_PROFILES: JSON.stringify(task.contextProfiles),
      CONTEXT_BUNDLE_ID: contextBundle.id
    }
  });
}
```

### 🚫 Blocker 4: No Prompt Auto-Generation
**Problem:** Prompts still manually created  
**Location:** `backend/src/services/taskPromptTemplates.ts`  
**Impact:** Bots don't get context-aware prompts  
**Time to Fix:** 4-5 days

**Current:** Manual template with 15+ fields  
**Needed:** Auto-generate from context bundles

---

## Integration Plan (2-3 Weeks)

### Week 1: Recipe Creation + Task Schema Updates

#### Day 1-2: Create Context Recipes
**Deliverable:** 5 YAML recipe files

**Example Recipe (pr-workflow.yaml):**
```yaml
profile: pr-workflow
version: "1.0"
description: "PR tracking, quality gates, Copilot delegation"
taskTypes: [implementation, review, pr-follow-up]
required: false

sizeLimit:
  maxBytes: 40000
  maxInlineBytes: 6000

investigationSteps:
  - "READ backend/src/services/prConditionState.service.ts for gate definitions"
  - "CHECK docs/guides/GITHUB_WEBHOOKS.md for webhook setup"
  - "VERIFY no duplicate PR tracking in other services"

constraints:
  - "MUST use existing PRConditionStateService (do not create new PR services)"
  - "MUST NOT modify webhook handler core logic without approval"
  - "MUST follow existing PR condition evaluation patterns"

sources:
  - type: markdown
    path: "docs/architecture/pr-workflow-overview.md"
    extract:
      headings: ["Quality Gates", "Condition Evaluation", "Auto-Merge"]
    transform: summarize
    
  - type: code
    path: "backend/src/services/prConditionState.service.ts"
    extract:
      sections: ["evaluateCondition", "PRCondition"]
    transform: strip-comments
    
  - type: markdown
    path: "docs/guides/GITHUB_WEBHOOKS.md"
    extract:
      headings: ["Setup", "Event Types"]
    transform: bullet-list

outputs:
  format: markdown
  filename: "pr-workflow.md"
  includeMetadata: true
```

**Files to Create:**
1. `config/context-recipes/deployment.yaml`
2. `config/context-recipes/pr-workflow.yaml`
3. `config/context-recipes/failure-recovery.yaml`
4. `config/context-recipes/dev-monitor.yaml`
5. `config/context-recipes/scope-control.yaml`

**Validation:**
```bash
npm run context:validate  # Validate all recipes
npm run context:build     # Test bundle generation
```

#### Day 3-4: Extend Task Schema

**File:** `backend/src/services/taskQueue.sqlite.ts`

**Add to Task interface:**
```typescript
export interface Task {
  // ... existing fields
  
  // Context management fields
  contextBundleId?: string;
  contextCacheKey?: string;
  contextProfiles?: string[];
  riskLevel?: 'minimal' | 'low' | 'medium' | 'high';
}
```

**Migration:**
```sql
-- Migration 015_task_context_fields.sql
ALTER TABLE tasks ADD COLUMN context_bundle_id TEXT;
ALTER TABLE tasks ADD COLUMN context_cache_key TEXT;
ALTER TABLE tasks ADD COLUMN context_profiles TEXT; -- JSON array
ALTER TABLE tasks ADD COLUMN risk_level TEXT CHECK(risk_level IN ('minimal', 'low', 'medium', 'high'));
CREATE INDEX idx_tasks_context_cache_key ON tasks(context_cache_key);
```

#### Day 5: Wire Context Generator into Task Creation

**File:** `backend/src/services/taskCreation.service.ts`

**Changes:**
```typescript
import { ContextBundleGenerator } from './context/index.js';
import type { ContextBundle } from '../types/contextBundle.js';

export class TaskCreationService {
  private contextGenerator: ContextBundleGenerator;
  
  constructor(
    private taskQueue: TaskQueueService,
    private guidelinesManager: TaskCreationGuidelinesManager,
    contextGenerator?: ContextBundleGenerator  // DI for testing
  ) {
    this.contextGenerator = contextGenerator || new ContextBundleGenerator({
      recipesDir: path.join(process.cwd(), 'config/context-recipes'),
      cacheOptions: { maxSize: 100, ttl: 3600000 }
    });
  }
  
  async createTask(taskData: EnhancedTaskData): Promise<TaskCreationResult> {
    const normalizedData = this.normalizeTaskData(taskData);
    
    // Generate context bundle
    const contextResult = await this.contextGenerator.generateBundle({
      taskType: normalizedData.type as any,
      targetFiles: normalizedData.files,
      force: false
    });
    
    if (!contextResult.success) {
      logger.warn({
        category: 'context',
        action: 'bundle_generation_failed',
        message: 'Failed to generate context bundle',
        details: { errors: contextResult.errors }
      });
    }
    
    // Store context metadata
    const task = this.createTaskInQueue({
      ...taskData,
      contextBundleId: contextResult.bundle?.id,
      contextCacheKey: contextResult.bundle?.cacheKey,
      contextProfiles: contextResult.bundle?.metadata.profiles
    }, normalizedData, validation);
    
    return {
      task,
      validation,
      contextBundle: contextResult.bundle
    };
  }
}
```

**Tests:**
```typescript
// taskCreation.service.test.ts
describe('Context Integration', () => {
  it('should generate context bundle for new task', async () => {
    const result = await service.createTask({
      type: 'implementation',
      title: 'Add feature X',
      files: ['backend/src/services/feature.ts']
    });
    
    expect(result.task.contextBundleId).toBeDefined();
    expect(result.task.contextProfiles).toContain('scope-control');
    expect(result.contextBundle).toBeDefined();
  });
});
```

### Week 2: Container Integration + Prompt Generation

#### Day 6-7: Mount Context in Containers

**File:** `backend/src/services/taskExecution.service.ts`

**Changes:**
```typescript
import { ContextBundleGenerator } from './context/index.js';

export class TaskExecutionService {
  private contextGenerator: ContextBundleGenerator;
  
  constructor(/* ... */) {
    this.contextGenerator = new ContextBundleGenerator({
      recipesDir: path.join(process.cwd(), 'config/context-recipes'),
      cacheOptions: { maxSize: 100, ttl: 3600000 }
    });
  }
  
  async executeTask(task: Task): Promise<void> {
    let contextBundle;
    
    // Load context bundle if available
    if (task.contextCacheKey) {
      const result = await this.contextGenerator.getBundle(task.contextCacheKey);
      contextBundle = result.bundle;
    }
    
    // Prepare container volumes
    const volumes: Record<string, { bind: string; mode: 'rw' | 'ro' }> = {
      '/workspace': { bind: taskWorkspace, mode: 'rw' }
    };
    
    // Add context volume if available
    if (contextBundle?.mountPath) {
      volumes['/workspace/context'] = {
        bind: contextBundle.mountPath,
        mode: 'ro'  // Read-only!
      };
    }
    
    // Create worker with context
    const worker = await this.ephemeralWorkerService.createWorker({
      taskId: task.id,
      workspaceDir: taskWorkspace,
      volumes,
      env: {
        TASK_ID: task.id,
        TASK_TYPE: task.type,
        CONTEXT_BUNDLE_ID: contextBundle?.id || '',
        CONTEXT_PROFILES: JSON.stringify(task.contextProfiles || [])
      }
    });
  }
}
```

#### Day 8-10: Auto-Generate Prompts from Context

**File:** `backend/src/services/taskPromptTemplates.ts`

**Add:**
```typescript
import type { ContextBundle } from '../types/contextBundle.js';

export class TaskPromptTemplateManager {
  async generateContextAwarePrompt(
    task: Task,
    contextBundle?: ContextBundle
  ): Promise<string> {
    const sections: string[] = [];
    
    // Add task description
    sections.push(`# Task: ${task.title}`);
    sections.push(task.description || '');
    
    // Auto-generate investigation steps from context
    if (contextBundle) {
      sections.push('\n## Investigation Steps');
      const steps = this.extractInvestigationSteps(contextBundle);
      steps.forEach((step, i) => {
        sections.push(`${i + 1}. ${step}`);
      });
    }
    
    // Auto-inject constraints from context
    if (contextBundle) {
      sections.push('\n## Constraints');
      sections.push('You have access to context files in /workspace/context/:');
      contextBundle.metadata.profiles.forEach(profile => {
        sections.push(`- /workspace/context/${profile}.md`);
      });
      sections.push('');
      sections.push('MUST read relevant context files before making changes.');
      
      const constraints = this.extractConstraints(contextBundle);
      constraints.forEach(c => sections.push(`- ${c}`));
    }
    
    // Add acceptance criteria
    if (task.acceptanceCriteria) {
      sections.push('\n## Acceptance Criteria');
      task.acceptanceCriteria.forEach(c => sections.push(`- ${c}`));
    }
    
    return sections.join('\n');
  }
  
  private extractInvestigationSteps(bundle: ContextBundle): string[] {
    const steps: string[] = [];
    
    // Extract from recipe metadata
    for (const [profile, content] of Object.entries(bundle.profileContents)) {
      if (content.metadata?.investigationSteps) {
        steps.push(...content.metadata.investigationSteps);
      }
    }
    
    return steps;
  }
  
  private extractConstraints(bundle: ContextBundle): string[] {
    const constraints: string[] = [];
    
    for (const [profile, content] of Object.entries(bundle.profileContents)) {
      if (content.metadata?.constraints) {
        constraints.push(...content.metadata.constraints);
      }
    }
    
    return constraints;
  }
}
```

### Week 3: Testing + Documentation

#### Day 11-12: Integration Testing

**File:** `backend/src/services/__tests__/context-integration.test.ts`

**Tests:**
```typescript
describe('Context Management Integration', () => {
  describe('End-to-End Flow', () => {
    it('should create task with context bundle', async () => {
      const task = await createTask({
        type: 'implementation',
        title: 'Add retry limit',
        files: ['backend/src/services/database.ts']
      });
      
      expect(task.contextBundleId).toBeDefined();
      expect(task.contextProfiles).toContain('scope-control');
    });
    
    it('should mount context in container', async () => {
      const task = await executeTask(taskWithContext);
      
      // Verify context volume mounted
      expect(containerConfig.volumes['/workspace/context']).toBeDefined();
      expect(containerConfig.volumes['/workspace/context'].mode).toBe('ro');
    });
    
    it('should generate prompt with context references', async () => {
      const prompt = await generatePrompt(task, contextBundle);
      
      expect(prompt).toContain('/workspace/context/scope-control.md');
      expect(prompt).toContain('MUST read relevant context files');
    });
  });
});
```

#### Day 13-14: Documentation Updates

**Files to Update:**
1. `docs/CONTEXT_MANAGEMENT_STATUS.md` - Mark Phases 2-4 complete
2. `docs/guides/TASK_CREATION.md` - Document new flow
3. `docs/architecture/context-system.md` - Architecture overview
4. `README.md` - Update quick start

#### Day 15: Production Validation

**Checklist:**
- [ ] All 5 context recipes created and validated
- [ ] Task schema migration applied
- [ ] Context generator wired into task creation
- [ ] Container mounting working in dev environment
- [ ] Prompt generation tested with real tasks
- [ ] Integration tests passing
- [ ] Documentation updated
- [ ] Staged and ready for PR

---

## Success Criteria

### Technical Validation
```bash
# 1. Recipes exist and validate
$ ls config/context-recipes/
deployment.yaml  pr-workflow.yaml  failure-recovery.yaml  dev-monitor.yaml  scope-control.yaml

$ npm run context:validate
✅ All 5 recipes valid

# 2. Context used in task creation
$ grep "ContextBundle" backend/src/services/taskCreation.service.ts
import type { ContextBundle } from '../types/contextBundle.js';
const contextResult = await this.contextGenerator.generateBundle({

# 3. Context mounted in containers  
$ grep "/workspace/context" backend/src/services/taskExecution.service.ts
'/workspace/context': { bind: contextBundle.mountPath, mode: 'ro' }

# 4. Tests passing
$ npm run test -- context-integration
✅ 15/15 tests passing
```

### Functional Validation
```bash
# Create a task and verify context bundle generated
$ curl -X POST http://localhost:5000/api/dev-bots/tasks -d '{
  "type": "implementation",
  "title": "Test context integration",
  "files": ["backend/src/services/test.ts"]
}'

# Response should include:
{
  "task": {
    "id": "...",
    "contextBundleId": "bundle-abc123",
    "contextProfiles": ["scope-control", "dev-monitor"]
  }
}
```

---

## Risk Mitigation

### Risk 1: Recipe Creation Takes Longer
**Mitigation:** Start with 2 minimal recipes (scope-control, dev-monitor), add others incrementally

### Risk 2: Container Mounting Issues
**Mitigation:** Test mounting in dev environment first, use fallback to inline context if mount fails

### Risk 3: Performance Degradation
**Mitigation:** Cache aggressively, measure bundle generation time (<5s target)

---

## Rollout Strategy

### Phase A: Infrastructure (Week 1)
- Create recipes
- Update schema
- Wire into task creation (NO behavior change yet)

### Phase B: Integration (Week 2)
- Mount in containers
- Generate prompts
- Feature flag: `ENABLE_CONTEXT_BUNDLES=false` (off by default)

### Phase C: Testing (Week 3)
- Enable for specific task types only
- Monitor bundle generation performance
- Validate prompt quality

### Phase D: Rollout
- Enable for all tasks in staging
- Monitor for 1 week
- Deploy to production

---

## Immediate Next Steps

**RIGHT NOW:**
1. Create `config/context-recipes/` directory
2. Create first recipe (scope-control.yaml) 
3. Wire ContextBundleGenerator into TaskCreationService
4. Add schema migration for context fields

**By End of Week:**
- All 5 recipes created
- Task creation generating bundles
- Basic integration tests passing

**By End of 3 Weeks:**
- Full integration complete
- Production ready
- Task submission still using current schema (breaking changes come later in Phase 5)

---

## Version History

| Version | Date | Author | Changes |
|---------|------|---------|---------|
| 1.0 | 2025-11-14 | Claude Code | Initial integration plan based on context review |
