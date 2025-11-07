# Context Blob Pre-loading Enhancement

**Status**: Proposed Enhancement
**Priority**: HIGH (Major efficiency gains)
**Complexity**: Medium
**Impact**: 🚀 **Massive** - Could reduce task execution time by 50-80% for sequential tasks

## Executive Summary

Pre-loading Docker containers with context blobs can dramatically improve dev-bot efficiency by:
1. **Eliminating repeated documentation reads** - Bots currently re-read the same docs for every task
2. **Enabling context continuity** - Sequential tasks can build on previous task knowledge
3. **Reducing token consumption** - Less redundant context in every prompt
4. **Faster task execution** - Skip the "read the docs" phase entirely for specialized tasks

**Answer**: YES, this is not only possible but highly beneficial!

## Problem Statement

### Current Inefficiencies

1. **Repeated Documentation Reads**
   - Every task starts fresh with zero context
   - Bots read the same architecture docs, API specs, and codebase structure repeatedly
   - 30-50% of task time spent on "onboarding" (reading docs, understanding codebase structure)

2. **Lost Context Between Tasks**
   - Task A: "Implement user authentication API"
   - Task B: "Add password reset to authentication"
   - Bot B has NO knowledge of what Bot A learned or implemented
   - Duplicated investigation and research

3. **Token Waste**
   - Large prompts include repetitive context: architecture docs, coding standards, file structure
   - Same context embedded in every single prompt
   - Unnecessarily high API costs

4. **Cold Start Problem**
   - Every container starts with only:
     - CLI tools (claude, codex)
     - Basic dev tools (git, npm, typescript)
     - Mounted workspace (code files)
   - NO pre-loaded knowledge of project structure, patterns, or conventions

## Solution Architecture

### 1. Context Blob System Design

#### Context Blob Structure
```typescript
interface ContextBlob {
  id: string;                      // Unique identifier (hash of contents)
  type: ContextBlobType;           // Type of context
  version: string;                 // Semantic version
  created_at: number;              // Timestamp
  expires_at?: number;             // Optional expiration
  metadata: ContextBlobMetadata;   // Searchable metadata
  content: ContextBlobContent;     // The actual context data
  dependencies?: string[];         // IDs of required context blobs
  tags: string[];                  // Searchable tags
}

enum ContextBlobType {
  ARCHITECTURE = 'architecture',           // System architecture knowledge
  CODEBASE_MAP = 'codebase_map',          // File structure, key modules
  API_SPEC = 'api_spec',                  // API documentation
  CODING_STANDARDS = 'coding_standards',   // Style guides, patterns
  DOMAIN_KNOWLEDGE = 'domain_knowledge',   // Business logic, domain model
  TASK_CONTEXT = 'task_context',          // Context from previous task
  AGENT_MEMORY = 'agent_memory',          // Agent's learned patterns
  TROUBLESHOOTING = 'troubleshooting',    // Known issues and solutions
  DEPENDENCY_MAP = 'dependency_map',       // Package dependencies, versions
}

interface ContextBlobMetadata {
  project: string;                 // Project identifier
  scope: string[];                 // What areas this context covers
  relevance_score?: number;        // AI-computed relevance (0-1)
  usage_count: number;             // How many times used
  last_used: number;               // Last usage timestamp
  created_by?: string;             // Task/agent that created it
  quality_score?: number;          // Validation score (0-1)
}

interface ContextBlobContent {
  format: 'markdown' | 'json' | 'structured';
  data: string | object;           // The actual context
  checksum: string;                // Content integrity check
  size_bytes: number;              // For storage optimization
  compression?: 'gzip' | 'none';   // Compression method
}
```

#### Context Blob Categories

**1. Static Context (Rarely Changes)**
- Architecture documentation
- Coding standards
- API specifications
- Project structure overview
- Technology stack documentation

**2. Semi-Dynamic Context (Changes Weekly/Monthly)**
- Codebase map (file locations, key modules)
- Common patterns and utilities
- Dependency map
- Known issues and workarounds

**3. Dynamic Context (Changes Per Task)**
- Previous task outputs
- Recent code changes
- Task-specific learnings
- Agent discoveries

**4. Agent Memory (Evolves Over Time)**
- Patterns the agent has learned
- Successful approaches
- Common mistakes to avoid
- Project-specific quirks

### 2. Context Storage & Management

#### Storage Backend

```typescript
interface ContextBlobStore {
  // CRUD operations
  save(blob: ContextBlob): Promise<string>;
  get(id: string): Promise<ContextBlob | null>;
  update(id: string, blob: Partial<ContextBlob>): Promise<void>;
  delete(id: string): Promise<void>;

  // Query operations
  search(query: ContextQuery): Promise<ContextBlob[]>;
  getByTags(tags: string[]): Promise<ContextBlob[]>;
  getByType(type: ContextBlobType): Promise<ContextBlob[]>;

  // Context building
  buildContextForTask(task: Task): Promise<ContextBlob[]>;

  // Maintenance
  prune(olderThan: number): Promise<number>;
  vacuum(): Promise<void>;
}

interface ContextQuery {
  types?: ContextBlobType[];
  tags?: string[];
  project?: string;
  scope?: string[];
  minRelevance?: number;
  limit?: number;
}
```

#### Storage Implementation Options

**Option A: SQLite (Recommended for MVP)**
```sql
CREATE TABLE context_blobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  metadata TEXT NOT NULL,  -- JSON
  content BLOB NOT NULL,   -- Compressed content
  checksum TEXT NOT NULL,
  tags TEXT NOT NULL,      -- JSON array
  FOREIGN KEY (project) REFERENCES projects(id)
);

CREATE INDEX idx_context_type ON context_blobs(type);
CREATE INDEX idx_context_created ON context_blobs(created_at);
CREATE INDEX idx_context_project ON context_blobs(project);
CREATE VIRTUAL TABLE context_fts USING fts5(content, tags);
```

**Option B: Redis (For High-Performance Caching)**
- Fast in-memory lookups
- TTL support for automatic expiration
- Pub/sub for context invalidation
- Scales horizontally

**Option C: Hybrid Approach (Best)**
- SQLite for persistent storage and complex queries
- Redis for hot context cache (frequently used blobs)
- Write-through cache pattern

### 3. Context Injection into Docker Containers

#### Method 1: Volume Mount (Fastest)

```typescript
// Pre-create context bundle as files
const contextDir = `/tmp/context-blobs/${taskId}`;
await fs.mkdir(contextDir, { recursive: true });

// Write selected context blobs to files
for (const blob of selectedBlobs) {
  const filename = `${blob.type}_${blob.id}.md`;
  await fs.writeFile(
    path.join(contextDir, filename),
    blob.content.data,
    'utf-8'
  );
}

// Mount context directory into container
dockerArgs.push(
  '-v', `${contextDir}:/home/node/.context:ro`,
  '-e', `CONTEXT_DIR=/home/node/.context`
);

// Modify prompt to reference context files
const enhancedPrompt = `
# Available Context Files

The following context has been pre-loaded for you:
${selectedBlobs.map(b => `- ${b.type}: /home/node/.context/${b.type}_${b.id}.md`).join('\n')}

Read these files FIRST before starting the task. They contain essential knowledge.

# Your Task

${originalPrompt}
`;
```

#### Method 2: Environment Variables (For Small Context)

```typescript
// For small context blobs (< 4KB)
const contextEnvVars = selectedBlobs
  .filter(b => b.content.size_bytes < 4096)
  .map((blob, idx) => [
    '-e', `CONTEXT_${idx}_TYPE=${blob.type}`,
    '-e', `CONTEXT_${idx}_DATA=${Buffer.from(blob.content.data).toString('base64')}`
  ])
  .flat();

dockerArgs.push(...contextEnvVars);
```

#### Method 3: Prompt Injection (Current + Enhanced)

```typescript
const enhancedPrompt = `
# Pre-loaded Context

${selectedBlobs.map(blob => `
## ${blob.type.toUpperCase()} Context

${blob.content.data}

`).join('\n---\n')}

# Your Task

${originalPrompt}
`;
```

#### Method 4: Custom Docker Image Layers (For Static Context)

```dockerfile
# Build context-aware image
FROM dev-bot:latest AS context-base

# Add static project context
COPY docs/architecture/ /home/node/.context/architecture/
COPY docs/api/ /home/node/.context/api/
COPY docs/standards/ /home/node/.context/standards/

# Create context index
RUN cat > /home/node/.context/INDEX.md << 'EOF'
# Available Context

- Architecture: /home/node/.context/architecture/
- API Docs: /home/node/.context/api/
- Coding Standards: /home/node/.context/standards/

All documentation is pre-loaded. Read relevant files before starting.
EOF

# Tag specialized images
# docker build -t dev-bot:context-backend
# docker build -t dev-bot:context-frontend
```

### 4. Context Capture & Generation

#### Automated Context Capture

```typescript
class ContextCaptureService {
  /**
   * Capture context from completed task
   */
  async captureFromTask(task: Task, output: string): Promise<ContextBlob[]> {
    const blobs: ContextBlob[] = [];

    // 1. Extract learned patterns
    const patterns = await this.extractPatterns(task, output);
    if (patterns) {
      blobs.push(this.createBlob('agent_memory', patterns));
    }

    // 2. Capture task-specific knowledge
    const taskKnowledge = {
      taskId: task.id,
      whatWasLearned: await this.summarizeLearnings(output),
      filesModified: await this.extractModifiedFiles(output),
      patternsUsed: await this.extractUsedPatterns(output),
      challengesEncountered: await this.extractChallenges(output),
    };
    blobs.push(this.createBlob('task_context', taskKnowledge));

    // 3. Update codebase map if files were added/moved
    if (this.hasStructuralChanges(output)) {
      const updatedMap = await this.updateCodebaseMap();
      blobs.push(this.createBlob('codebase_map', updatedMap));
    }

    return blobs;
  }

  /**
   * Extract patterns from agent output
   */
  private async extractPatterns(task: Task, output: string): Promise<any> {
    // Look for:
    // - New utility functions created
    // - Patterns used (e.g., "I reused the validateInput utility")
    // - Architecture decisions
    // - Common solutions

    const patterns = {
      utilitiesDiscovered: [],
      patternsFollowed: [],
      architectureDecisions: [],
    };

    // Parse output for pattern indicators
    const utilityMentions = output.match(/reused? .*?utility/gi);
    const patternMentions = output.match(/followed? .*?pattern/gi);

    return patterns;
  }

  /**
   * Generate static context blobs from docs
   */
  async generateStaticBlobs(): Promise<ContextBlob[]> {
    const blobs: ContextBlob[] = [];

    // Architecture documentation
    const archDocs = await this.compileArchitectureDocs();
    blobs.push(this.createBlob('architecture', archDocs));

    // Coding standards
    const standards = await this.compileCodingStandards();
    blobs.push(this.createBlob('coding_standards', standards));

    // Codebase map
    const codebaseMap = await this.generateCodebaseMap();
    blobs.push(this.createBlob('codebase_map', codebaseMap));

    return blobs;
  }

  /**
   * Generate codebase map
   */
  private async generateCodebaseMap(): Promise<any> {
    return {
      structure: await this.scanDirectoryStructure(),
      keyFiles: {
        entryPoints: ['src/server.ts', 'src/index.ts'],
        config: ['src/config/', 'tsconfig.json'],
        types: ['src/types/', 'src/interfaces/'],
        utils: ['src/utils/', 'src/helpers/'],
        services: ['src/services/'],
        routes: ['src/routes/', 'src/api/'],
      },
      conventions: {
        testFiles: '*.test.ts',
        typeFiles: '*.types.ts',
        configFiles: '*.config.ts',
      },
      commonPatterns: [
        'Service classes in src/services/',
        'Routes in src/routes/',
        'Types in src/types/',
        'Tests co-located with source',
      ],
    };
  }
}
```

#### Context Selection Algorithm

```typescript
class ContextSelector {
  /**
   * Select relevant context blobs for a task
   */
  async selectContextForTask(task: Task): Promise<ContextBlob[]> {
    const selected: ContextBlob[] = [];

    // 1. Always include base context
    selected.push(...await this.getBaseContext());

    // 2. Add task-type-specific context
    selected.push(...await this.getContextForTaskType(task.type));

    // 3. Add agent-specific context
    if (task.assigned_agent) {
      selected.push(...await this.getAgentContext(task.assigned_agent));
    }

    // 4. Add related task context (if part of a sequence)
    if (task.metadata?.relatedTasks) {
      selected.push(...await this.getRelatedTaskContext(task.metadata.relatedTasks));
    }

    // 5. Add scope-specific context
    const scope = this.inferScope(task);
    selected.push(...await this.getScopeContext(scope));

    // 6. Score and rank by relevance
    const scored = await this.scoreRelevance(task, selected);

    // 7. Limit to top N most relevant (to avoid context overload)
    return scored
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10)
      .map(s => s.blob);
  }

  /**
   * Score context blob relevance to task
   */
  private async scoreRelevance(
    task: Task,
    blobs: ContextBlob[]
  ): Promise<Array<{ blob: ContextBlob, relevance: number }>> {
    return blobs.map(blob => ({
      blob,
      relevance: this.calculateRelevance(task, blob)
    }));
  }

  private calculateRelevance(task: Task, blob: ContextBlob): number {
    let score = 0;

    // Base score by type
    const typeScores: Record<ContextBlobType, number> = {
      architecture: 0.8,
      codebase_map: 0.9,
      coding_standards: 0.7,
      api_spec: 0.6,
      domain_knowledge: 0.5,
      task_context: 1.0,  // Previous task context is most relevant
      agent_memory: 0.8,
      troubleshooting: 0.4,
      dependency_map: 0.3,
    };
    score += typeScores[blob.type] || 0.5;

    // Boost for matching scope
    const taskScope = this.inferScope(task);
    const scopeMatch = blob.metadata.scope.some(s => taskScope.includes(s));
    if (scopeMatch) score += 0.3;

    // Boost for recent usage
    const ageHours = (Date.now() - blob.metadata.last_used) / (1000 * 60 * 60);
    if (ageHours < 24) score += 0.2;

    // Boost for high usage count
    if (blob.metadata.usage_count > 10) score += 0.1;

    // Boost for same agent
    if (blob.metadata.created_by === task.assigned_agent) score += 0.2;

    return Math.min(score, 1.0);
  }

  private inferScope(task: Task): string[] {
    const scope: string[] = [];

    // Parse title and description for scope hints
    const text = `${task.title} ${task.description}`.toLowerCase();

    if (text.match(/api|endpoint|route/)) scope.push('backend', 'api');
    if (text.match(/database|sql|postgres/)) scope.push('backend', 'database');
    if (text.match(/auth|login|security/)) scope.push('auth', 'security');
    if (text.match(/ui|component|frontend/)) scope.push('frontend', 'ui');
    if (text.match(/test|spec/)) scope.push('testing');
    if (text.match(/docker|deploy|ci/)) scope.push('devops', 'infrastructure');

    return scope;
  }
}
```

### 5. Context Versioning & Invalidation

#### Version Control

```typescript
interface ContextVersion {
  blobId: string;
  version: string;
  previousVersion?: string;
  changes: string[];
  created_at: number;
}

class ContextVersionManager {
  /**
   * Create new version when context changes
   */
  async updateContext(
    blobId: string,
    newContent: any,
    changes: string[]
  ): Promise<string> {
    const current = await this.store.get(blobId);
    if (!current) throw new Error('Context blob not found');

    // Check if content actually changed
    const newChecksum = this.calculateChecksum(newContent);
    if (newChecksum === current.content.checksum) {
      return current.version; // No change
    }

    // Create new version
    const newVersion = this.incrementVersion(current.version);
    const updated: ContextBlob = {
      ...current,
      version: newVersion,
      content: {
        ...current.content,
        data: newContent,
        checksum: newChecksum,
      },
      metadata: {
        ...current.metadata,
        last_used: Date.now(),
      }
    };

    // Archive old version
    await this.archiveVersion(current);

    // Save new version
    await this.store.save(updated);

    // Log version change
    await this.logVersionChange({
      blobId,
      version: newVersion,
      previousVersion: current.version,
      changes,
      created_at: Date.now(),
    });

    return newVersion;
  }

  /**
   * Invalidate context when source changes
   */
  async invalidateContext(trigger: InvalidationTrigger): Promise<void> {
    const affected = await this.findAffectedBlobs(trigger);

    for (const blob of affected) {
      await this.markForRegeneration(blob.id);
    }

    logger.info({
      category: 'context',
      action: 'context_invalidated',
      message: `Invalidated ${affected.length} context blobs`,
      details: {
        trigger: trigger.type,
        affectedCount: affected.length,
        blobIds: affected.map(b => b.id),
      }
    });
  }
}

interface InvalidationTrigger {
  type: 'file_change' | 'architecture_update' | 'dependency_update' | 'manual';
  paths?: string[];
  reason: string;
}
```

### 6. Context Blob API

```typescript
// REST API endpoints
app.post('/api/context/blobs', createContextBlob);
app.get('/api/context/blobs/:id', getContextBlob);
app.put('/api/context/blobs/:id', updateContextBlob);
app.delete('/api/context/blobs/:id', deleteContextBlob);
app.get('/api/context/blobs', searchContextBlobs);

// Context operations
app.post('/api/context/generate', generateStaticContext);
app.post('/api/context/capture/:taskId', captureTaskContext);
app.post('/api/context/invalidate', invalidateContext);
app.get('/api/context/select/:taskId', selectContextForTask);

// Maintenance
app.post('/api/context/prune', pruneExpiredContext);
app.post('/api/context/vacuum', vacuumContextStore);
app.get('/api/context/stats', getContextStats);
```

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Basic context storage and retrieval

- [ ] Design and implement ContextBlob schema
- [ ] Create SQLite storage backend
- [ ] Implement basic CRUD operations
- [ ] Add context blob versioning
- [ ] Create context capture service (basic)

**Deliverables**:
- `src/services/contextBlobStore.ts`
- `src/services/contextCapture.service.ts`
- Database migrations for context tables
- Unit tests

### Phase 2: Static Context Generation (Week 3)
**Goal**: Generate and store static project context

- [ ] Implement codebase map generator
- [ ] Create architecture doc compiler
- [ ] Build coding standards aggregator
- [ ] Generate initial static context blobs
- [ ] Add context blob tagging and search

**Deliverables**:
- `src/services/staticContextGenerator.ts`
- Automated context generation scripts
- Initial context blob library

### Phase 3: Docker Integration (Week 4)
**Goal**: Inject context into containers

- [ ] Implement volume mount context injection
- [ ] Modify task execution to select relevant context
- [ ] Update prompt generation to reference context files
- [ ] Add context verification in containers
- [ ] Create context-aware Docker images

**Deliverables**:
- Updated `taskExecution.service.ts` with context injection
- Context selection algorithm
- Modified Docker run commands
- Context-aware base images

### Phase 4: Dynamic Context Capture (Week 5-6)
**Goal**: Capture and reuse task context

- [ ] Implement task completion context capture
- [ ] Build pattern extraction from agent output
- [ ] Create context linking for related tasks
- [ ] Add context relevance scoring
- [ ] Implement context aging and expiration

**Deliverables**:
- Enhanced `contextCapture.service.ts`
- Pattern extraction algorithms
- Context linking logic
- Relevance scoring system

### Phase 5: Agent Memory (Week 7-8)
**Goal**: Build persistent agent memory

- [ ] Implement agent-specific context accumulation
- [ ] Create learning pattern recognition
- [ ] Build agent performance tracking by context type
- [ ] Add context-based task routing
- [ ] Implement agent specialization based on accumulated context

**Deliverables**:
- `src/services/agentMemory.service.ts`
- Agent memory persistence
- Specialization detection
- Context-aware task assignment

### Phase 6: Optimization & Monitoring (Week 9-10)
**Goal**: Optimize performance and measure impact

- [ ] Implement Redis caching layer
- [ ] Add context compression
- [ ] Build context usage analytics
- [ ] Create context effectiveness metrics
- [ ] Optimize context selection algorithms
- [ ] Add context management UI

**Deliverables**:
- Redis integration
- Performance monitoring dashboard
- Effectiveness reports
- Context management tools

## Expected Benefits

### Quantitative Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Task execution time | 5-10 min | 2-4 min | **50-60% faster** |
| Documentation reads per task | 5-10 files | 0-1 files | **90% reduction** |
| Token usage per task | 50-100k tokens | 10-30k tokens | **70% reduction** |
| Context gathering time | 2-4 min | 0-15 sec | **90% faster** |
| Sequential task efficiency | Low (no context) | High (full context) | **3-5x faster** |
| Agent learning curve | Reset every task | Cumulative | **Continuous improvement** |

### Qualitative Improvements

1. **Smarter Agents**
   - Agents learn and improve over time
   - Build domain expertise specific to the project
   - Remember project quirks and patterns

2. **Better Code Quality**
   - Consistent patterns across tasks
   - Fewer violations of coding standards
   - Better architectural alignment

3. **Reduced Errors**
   - Agents remember previous mistakes
   - Context includes known issues and solutions
   - Less duplicate work and debugging

4. **Enhanced Collaboration**
   - Agents can build on each other's work
   - Knowledge transfer between tasks
   - Clearer handoffs in task sequences

## Use Cases

### Use Case 1: Feature Development Sequence

**Scenario**: Build a complete authentication system (5 tasks)

**Without Context**:
```
Task 1: Design auth API → Bot reads all docs (5 min) → implements (10 min) → Total: 15 min
Task 2: Add password reset → Bot reads all docs (5 min) → implements (8 min) → Total: 13 min
Task 3: Add 2FA → Bot reads all docs (5 min) → implements (12 min) → Total: 17 min
Task 4: Add session mgmt → Bot reads all docs (5 min) → implements (10 min) → Total: 15 min
Task 5: Add tests → Bot reads all docs (5 min) → implements (15 min) → Total: 20 min

Total Time: 80 minutes
```

**With Context**:
```
Task 1: Design auth API → Bot reads docs (5 min) → implements (10 min) → Captures context → Total: 15 min
Task 2: Add password reset → Pre-loaded context (0 min) → implements (7 min) → Total: 7 min
Task 3: Add 2FA → Pre-loaded context (0 min) → implements (10 min) → Total: 10 min
Task 4: Add session mgmt → Pre-loaded context (0 min) → implements (8 min) → Total: 8 min
Task 5: Add tests → Pre-loaded context (0 min) → implements (12 min) → Total: 12 min

Total Time: 52 minutes (35% faster)
```

### Use Case 2: Specialized Agent Domains

**Scenario**: Backend specialist has worked on 50 tasks

**Without Context**:
- Every task starts fresh
- Re-learns project structure each time
- Repeats same research for similar tasks

**With Context**:
- Agent has accumulated 50 context blobs
- Knows all patterns, utilities, and conventions
- Specialized knowledge of database schema, API patterns, etc.
- Can jump straight to implementation
- **Becomes 2-3x more efficient over time**

### Use Case 3: Onboarding New Agents

**Scenario**: New agent type added to the system

**Without Context**:
- No knowledge of project
- Must discover everything from scratch
- High initial failure rate

**With Context**:
- Pre-load with static context (architecture, standards, codebase map)
- Instant project familiarity
- Faster time to productivity
- **Onboarding time reduced from days to hours**

## Risks & Mitigations

### Risk 1: Stale Context
**Problem**: Context becomes outdated as code changes
**Mitigation**:
- Implement version detection and invalidation
- Timestamp all context and expire old blobs
- Auto-regenerate static context on major changes
- Add context freshness validation before use

### Risk 2: Context Overload
**Problem**: Too much context confuses the agent
**Mitigation**:
- Limit to top 10 most relevant blobs
- Implement smart context selection
- Prioritize recent and high-usage context
- Add context summarization for large blobs

### Risk 3: Storage Bloat
**Problem**: Context blobs accumulate and consume storage
**Mitigation**:
- Implement automatic pruning of old context
- Compress large context blobs
- Set expiration times on task-specific context
- Monitor storage usage and alert

### Risk 4: Context Quality
**Problem**: Poor quality context degrades performance
**Mitigation**:
- Add context validation before storage
- Track context effectiveness metrics
- Allow manual review and curation
- Implement feedback loop for quality improvement

### Risk 5: Privacy/Security
**Problem**: Context may contain sensitive information
**Mitigation**:
- Scan for secrets before storage
- Encrypt sensitive context blobs
- Implement access controls
- Add context auditing

## Metrics & Success Criteria

### Performance Metrics

```typescript
interface ContextMetrics {
  // Usage metrics
  totalBlobs: number;
  totalSizeBytes: number;
  avgBlobSize: number;
  hitRate: number;           // Context cache hit rate
  usagePerTask: number;       // Avg blobs used per task

  // Effectiveness metrics
  taskTimeReduction: number;  // % faster with context
  tokenReduction: number;     // % fewer tokens with context
  successRate: number;        // Task success rate with context

  // Quality metrics
  contextFreshness: number;   // Avg age of used context
  invalidationRate: number;   // % of context invalidated
  qualityScore: number;       // Avg quality rating (0-1)

  // Agent metrics
  agentLearningCurve: Map<string, number[]>;  // Agent improvement over time
  specializationScore: Map<string, number>;   // Agent domain expertise
}
```

### Success Criteria (MVP)

- [ ] **50% reduction** in documentation read time per task
- [ ] **30% reduction** in overall task execution time
- [ ] **60% reduction** in token usage per task
- [ ] **90% context hit rate** for sequential tasks
- [ ] **< 2s context selection time** per task
- [ ] **< 100MB** context storage for typical project

### Success Criteria (Full Implementation)

- [ ] **80% reduction** in documentation read time
- [ ] **50% reduction** in overall task execution time
- [ ] **70% reduction** in token usage
- [ ] Agent specialization scores > 0.8 after 100 tasks
- [ ] Measurable improvement in code quality metrics
- [ ] Zero task failures due to missing context

## Future Enhancements

### Enhancement 1: AI-Powered Context Generation
- Use LLM to automatically summarize and distill context
- Generate context embeddings for semantic search
- Auto-generate architecture documentation from code

### Enhancement 2: Collaborative Context
- Share context across team members
- Context marketplace (reusable context for common patterns)
- Community-curated context libraries

### Enhancement 3: Context Visualization
- Visual codebase maps
- Context dependency graphs
- Agent knowledge visualization

### Enhancement 4: Predictive Context Loading
- ML model predicts which context will be needed
- Pre-load context before task assignment
- Adaptive context selection based on agent feedback

### Enhancement 5: Multi-Project Context Sharing
- Reuse patterns across similar projects
- Framework-specific context libraries
- Cross-project learning

## References

- [Docker Volume Mounts](https://docs.docker.com/storage/volumes/)
- [Claude Code API](https://docs.anthropic.com/claude/docs)
- [Codex CLI Documentation](https://openai.com/codex)
- [Context Window Management](https://arxiv.org/abs/2304.03442)
- [RAG (Retrieval Augmented Generation)](https://arxiv.org/abs/2005.11401)

## Appendix A: Context Blob Examples

### Example 1: Architecture Context

```markdown
# Architecture Context: app-monitor

## System Overview
- Monorepo with backend (Node.js/TypeScript) and frontend (React)
- Backend uses Express + SQLite for dev-bots task queue
- Structured logging with JSON format
- Docker-based ephemeral worker pattern

## Key Components
- DevBotsManager: Orchestrates task execution
- TaskQueue: SQLite-based priority queue
- TaskExecution: Handles Docker container lifecycle
- FailureRecovery: Two-stage recovery (cleanup → followup)

## Architectural Patterns
- Service-oriented architecture
- Dependency injection via factory pattern
- Ephemeral workers for isolation
- Event-driven logging

## Common Conventions
- Services in `src/services/`
- Tests co-located with source (`.test.ts`)
- Interfaces in `src/types/` or inline
- Configuration via environment variables
```

### Example 2: Task Context from Previous Task

```json
{
  "taskId": "task-123",
  "completedAt": 1699123456789,
  "whatWasLearned": {
    "filesModified": [
      "src/services/taskExecution.service.ts",
      "src/services/cliFlags.ts"
    ],
    "patternsUsed": [
      "CLI flag compatibility layer",
      "Docker volume mounting for credentials"
    ],
    "challengesEncountered": [
      "Codex exec subcommand has different flags than main command",
      "Required --dangerously-bypass-approvals-and-sandbox instead of --ask-for-approval"
    ],
    "solutions": [
      "Created cliFlags.ts documentation for future reference",
      "Added inline comments about exec vs interactive mode differences"
    ],
    "utilitiesCreated": [
      "buildCLIArgs() in cliFlags.ts",
      "getDevBotFlags() for common flag patterns"
    ]
  },
  "relevantForFutureTasks": [
    "Any task involving Codex CLI",
    "CLI invocation changes",
    "Docker container configuration"
  ]
}
```

### Example 3: Agent Memory Context

```json
{
  "agentId": "backend-specialist",
  "accumulatedKnowledge": {
    "discoveredUtilities": [
      "src/utils/logger.ts for structured logging",
      "src/services/dockerManager.ts for container operations",
      "src/services/taskQueue.sqlite.ts for queue operations"
    ],
    "commonPatterns": {
      "errorHandling": "Use structured logger with category/action",
      "serviceStructure": "Export class with constructor injection",
      "testing": "Co-locate tests, use vitest, mock dependencies"
    },
    "projectQuirks": [
      "Always use staging branch, not main",
      "Commit messages must include Co-Authored-By",
      "Git credentials use credential store, not SSH"
    ],
    "successfulApproaches": [
      "For CLI issues: Always check --help output first",
      "For type errors: Check if interface is properly exported",
      "For Docker issues: Verify volume mount permissions"
    ],
    "commonMistakes": [
      "Don't use --sandbox-policy, use --sandbox for Codex",
      "Don't forget to rebuild TypeScript before testing",
      "Check if dev-bots are started before expecting tasks to run"
    ]
  },
  "specialization": {
    "domainExpertise": ["backend", "docker", "cli-tools"],
    "taskSuccessRate": 0.85,
    "avgTaskTime": 240,  // seconds
    "preferredTaskTypes": ["implementation", "debugging", "infrastructure"]
  }
}
```

## Appendix B: Migration Path

### Step 1: Enable Context Storage (Week 1)
```bash
# Add context storage tables
npm run migrate:context-storage

# Generate initial static context
npm run context:generate-static

# Verify context is stored
curl http://localhost:5000/api/context/stats
```

### Step 2: Enable Context Injection (Week 4)
```bash
# Update task execution to use context
# Set environment variable
export ENABLE_CONTEXT_INJECTION=true

# Restart backend
npm run dev

# Monitor context usage
tail -f logs/dev-monitor-backend.log | grep context
```

### Step 3: Enable Context Capture (Week 6)
```bash
# Enable automatic context capture
export ENABLE_CONTEXT_CAPTURE=true

# Monitor captured context
curl http://localhost:5000/api/context/blobs?type=task_context
```

### Step 4: Full Rollout (Week 10)
```bash
# Enable all context features
export CONTEXT_ENABLED=true
export CONTEXT_CACHE_ENABLED=true
export CONTEXT_AGENT_MEMORY=true

# Monitor effectiveness
npm run context:report
```

---

**Status**: Ready for implementation
**Next Steps**:
1. Review and approve plan
2. Create Phase 1 implementation tasks
3. Set up context storage infrastructure
4. Begin static context generation

**Questions?** Contact: dev-bots team
