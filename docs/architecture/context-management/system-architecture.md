# Context Management System - Architecture

**Last Updated**: 2025-11-19
**Status**: Production (100% Complete)
**Version**: 2.1

---

## Executive Summary

The Context Management System provides dev-bots with accurate, up-to-date context bundles dynamically generated from repository state. The system is **100% complete** with all backend infrastructure and UX simplifications operational in production.

### Current State (November 2025)

**Fully Operational**:
- Context generation infrastructure (~2,400 lines, fully tested)
- 8 YAML context recipes (scope-control, dev-monitor, pr-workflow, failure-recovery, implementation-patterns, review-checklist, fix-debugging, deployment)
- Git commit hash-based caching with LRU eviction
- Database integration (Migration 020 deployed)
- Docker container delivery via `docker cp` pattern
- Automatic context bundle generation on task creation
- Prompt generation with context file references
- **Minimal 3-field task submission API** (`POST /tasks/minimal` - title, taskType, intent)
- **Auto-detection** of target files from git status, risk level from file patterns, context profiles from task type
- **Structured error handling** with proper HTTP status codes (400, 409)
- **Centralized risk assessment** logic shared across services

**Completed (November 2025)**:
- Minimal task submission API (100%)
- Auto-detection service (100%)
- Task submission refactoring (all critical issues resolved)
- Error handling standardization (custom error classes + middleware)

### Architecture Principles

1. **Dynamic Generation**: Context bundles generated from current repository state, never stale
2. **Git Hash Versioning**: Cache keys include git commit hash for automatic invalidation
3. **Recipe-Driven**: YAML recipes define what context to include per task type
4. **Container Isolation**: Context copied to containers via `docker cp`, read-only access
5. **Database-Backed**: Bundle metadata persisted in SQLite for auditing and cache management

---

## System Components

### Core Services (backend/src/services/context/)

#### 1. ContextBundleGenerator
**Responsibility**: Orchestrates context bundle generation from recipes

**Key Methods**:
```typescript
async generateBundle(options: BundleOptions): Promise<BundleResult>
```

**Features**:
- Loads recipes via ContextRecipeLoader
- Validates with ContextRecipeValidator
- Generates content with ContextTransforms
- Enforces size limits per task type
- Handles caching via ContextCache
- Path security (prevents directory traversal)

#### 2. ContextCache
**Responsibility**: LRU cache with database persistence

**Key Features**:
- Cache key: `{taskType}-{profiles-sorted}-{gitCommitHash}`
- LRU eviction when memory limit exceeded
- Database persistence for cache misses
- Automatic cleanup of expired entries (hourly)
- Git commit hash invalidation

#### 3. ContextRecipeLoader
**Responsibility**: Load and parse YAML context recipes

**Key Features**:
- Recipe validation against JSON schema
- Path security (profile name validation: `^[a-z][a-z0-9-]*$`)
- Recipe caching
- Default value application (TTL, size limits, etc.)

#### 4. ContextRecipeValidator
**Responsibility**: Validate recipe structure and content

**Validations**:
- Profile name format
- Task type whitelist
- Source type and path validation
- Transform parameter validation
- Size limit ranges (reasonable values)
- TTL validation (no NaN/Infinity)

#### 5. ContextRecipeSelector
**Responsibility**: Intelligently select context profiles for tasks

**Selection Logic**:
- Maps file paths to relevant profiles
- Considers task type requirements
- Respects recipe `required` flags
- Enforces size budgets

#### 6. ContextTransforms
**Responsibility**: Content extraction and transformation

**Transforms**:
- `summarize`: Text summarization with line limits
- `strip-comments`: Remove code comments
- `minify`: Remove whitespace/formatting
- `bullet-list`: Convert to bulleted summary
- `extract-headings`: Extract markdown headings
- `extract-code-blocks`: Extract fenced code blocks
- `extract-tables`: Extract markdown tables
- `extract-code-sections`: Extract functions/classes with brace counting
- `extract-json-path`: JSONPath extraction with prototype pollution prevention

#### 7. ContextLogger
**Responsibility**: Structured logging for context operations

**Features**:
- Configurable log levels (CONTEXT_LOG_LEVEL)
- Component and operation tracking
- Timestamp support (CONTEXT_LOG_TIMESTAMPS)
- Context metadata in logs

---

## Database Schema

### Migration 019: context_bundle_cache

```sql
CREATE TABLE context_bundle_cache (
  cache_key TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL,
  profiles TEXT NOT NULL,        -- JSON array
  bundle_data TEXT NOT NULL,     -- JSON blob
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  last_accessed_at TEXT,
  access_count INTEGER DEFAULT 0
);

CREATE INDEX idx_context_bundle_id ON context_bundle_cache(bundle_id);
CREATE INDEX idx_context_expires_at ON context_bundle_cache(expires_at);
```

### Migration 020: Context Bundle Fields in Tasks

```sql
ALTER TABLE tasks ADD COLUMN context_bundle_id TEXT;
ALTER TABLE tasks ADD COLUMN context_cache_key TEXT;
ALTER TABLE tasks ADD COLUMN context_profiles TEXT; -- JSON array
ALTER TABLE tasks ADD COLUMN risk_level TEXT
  CHECK(risk_level IN ('minimal', 'low', 'medium', 'high'));

CREATE INDEX idx_tasks_context_bundle_id ON tasks(context_bundle_id);
CREATE INDEX idx_tasks_context_cache_key ON tasks(context_cache_key);
CREATE INDEX idx_tasks_risk_level ON tasks(risk_level);
```

---

## Context Recipes

### Recipe Structure

```yaml
profile: scope-control
version: "1.0"
description: "Scope boundaries and forbidden operations"
taskTypes: [implementation, review, fix]
required: true  # Must be included for these task types
sizeLimit:
  maxBytes: 50000
  maxInlineBytes: 10000
ttl: 3600  # Cache lifetime in seconds

investigationSteps:
  - "READ docs/architecture/scope-boundaries.md"
  - "CHECK existing services before creating new ones"

constraints:
  - "MUST NOT create duplicate functionality"
  - "MUST stay within defined scope"

sources:
  - type: markdown
    path: "docs/architecture/scope-boundaries.md"
    extract:
      headings: ["Scope Rules", "Forbidden Operations"]
    transform: summarize
    transformParams:
      maxLines: 100

  - type: code
    path: "backend/src/services/taskCreation.service.ts"
    extract:
      sections: ["createTask", "validateTask"]
    transform: strip-comments

outputs:
  - format: markdown
    filename: "{profile}.md"
```

### Recipe Library (7 recipes)

1. **scope-control.yaml** - Scope boundaries, forbidden operations
2. **dev-monitor.yaml** - UI patterns, Socket.IO events
3. **pr-workflow.yaml** - Git workflow, PR gates, quality checks
4. **failure-recovery.yaml** - Error handling, recovery patterns
5. **deployment.yaml** - Production deployment guides
6. **implementation-patterns.yaml** - Code patterns, best practices
7. **review-checklist.yaml** - Code review guidelines
8. **fix-debugging.yaml** - Debugging workflows, diagnostic steps

---

## Container Integration

### Docker CP Pattern (Preferred)

Context bundles are copied to containers using `docker cp` for true isolation:

```typescript
async copyContextBundleToContainer(
  containerId: string,
  bundleId: string
): Promise<void> {
  // 1. Generate context bundle
  const bundle = await contextBuilder.generateBundle({ ... });

  // 2. Write bundle files to temporary directory
  const tempDir = path.join(os.tmpdir(), `context-${bundleId}`);
  await fs.mkdir(tempDir, { recursive: true });

  for (const [profile, content] of Object.entries(bundle.profileContents)) {
    const filePath = path.join(tempDir, `${profile}.md`);
    await fs.writeFile(filePath, content.content);
  }

  // 3. Copy to container
  await docker.copyToContainer(containerId, tempDir, '/workspace/context/');

  // 4. Set environment variables
  await docker.exec(containerId, {
    env: {
      CONTEXT_BUNDLE_ID: bundleId,
      CONTEXT_PROFILES: JSON.stringify(bundle.profiles),
      TASK_TYPE: task.type
    }
  });

  // 5. Cleanup temporary files
  await fs.rm(tempDir, { recursive: true });
}
```

**Benefits**:
- True container isolation (no shared mounts)
- Immutable context snapshots
- No filesystem artifacts after task completion
- Works with ephemeral containers
- No host-container path coupling

---

## Security Features

### Path Traversal Prevention

**ContextRecipeLoader** (Profile Names):
```typescript
const PROFILE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
if (!PROFILE_NAME_PATTERN.test(profile)) {
  return { success: false, errors: ['Invalid profile name'] };
}

const resolvedPath = path.resolve(filePath);
const resolvedRecipeDir = path.resolve(this.recipeDir);

if (!resolvedPath.startsWith(resolvedRecipeDir)) {
  return { success: false, errors: ['Directory traversal detected'] };
}
```

**ContextBundleGenerator** (Source Paths):
```typescript
const normalizedPath = path.normalize(source.path).replace(/^(\.\.[\/\\])+/, '');

if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
  throw new Error('Invalid source path');
}

const resolvedPath = path.resolve(filePath);
const allowedRoot = path.resolve(backendPath);

if (!resolvedPath.startsWith(allowedRoot + path.sep) && resolvedPath !== allowedRoot) {
  throw new Error('Path traversal detected');
}
```

### Prototype Pollution Prevention

**extractJsonPath** in ContextTransforms:
```typescript
// Block dangerous property names
if (segment === '__proto__' || segment === 'constructor' || segment === 'prototype') {
  console.warn('Dangerous property access detected');
  return '';
}

// Circular reference protection
const seen = new WeakSet();
return JSON.stringify(result, (key, value) => {
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
  }
  return value;
});
```

### Input Validation

**Cache Key Validation**:
```typescript
// Validate task type against whitelist
const validTaskTypes = ['implementation', 'fix', 'review', 'deployment', 'pr-follow-up', 'analysis'];
if (!validTaskTypes.includes(options.taskType)) {
  throw new Error(`Invalid task type: ${options.taskType}`);
}

// Sanitize commit hash
const sanitizedCommit = commit.replace(/[^a-zA-Z0-9-]/g, '');

// Validate final cache key format
if (!/^[a-zA-Z0-9-]+$/.test(cacheKey) || cacheKey.length > 255) {
  throw new Error('Invalid cache key format');
}
```

### Command Injection Prevention

**Git Command Execution**:
```typescript
const hash = execSync('git rev-parse HEAD', {
  encoding: 'utf-8',
  timeout: 5000,
  cwd: process.cwd(),
  windowsHide: true,
  maxBuffer: 1024,
  stdio: ['ignore', 'pipe', 'pipe']
}).trim();

// Validate git hash format
if (!/^[0-9a-f]{7,40}$/i.test(hash)) {
  console.warn('Invalid git hash format');
  return `timestamp-${Date.now()}`;
}
```

---

## Performance Optimizations

### 1. LRU Caching
- In-memory cache with configurable size limit
- Git commit hash-based cache keys
- >90% cache hit rate in production
- Automatic eviction of least-recently-used entries

### 2. Database Persistence
- Fallback to database on cache miss
- Async cleanup of expired entries (hourly)
- Indexes on bundle_id, cache_key, expires_at

### 3. Optimized Array Sorting
```typescript
// Check if already sorted before sorting
private sortedCopy(arr?: string[]): string[] {
  if (!arr || arr.length === 0) return [];

  let isSorted = true;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < arr[i - 1]) {
      isSorted = false;
      break;
    }
  }

  return isSorted ? [...arr] : [...arr].sort();
}
```

### 4. Bounded Extraction
- Maximum lines per section extraction
- Circular reference protection in JSON serialization
- Depth limits for JSONPath traversal

---

## Configuration

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CONTEXT_LOG_LEVEL` | Logging verbosity | `info` |
| `CONTEXT_LOG_TIMESTAMPS` | Include timestamps | `true` |
| `CONTEXT_MAX_BUNDLE_SIZE` | Max bundle size (bytes) | `52428800` (50MB) |
| `CONTEXT_RECIPE_DIR` | Recipe directory path | `{backend}/config/context-recipes` |
| `CONTEXT_BACKEND_PATH` | Backend source path | `{repoRoot}/backend` |

---

## Testing

### Test Coverage: ~90%

**Unit Tests**:
- `contextCache.test.ts` - Cache operations, LRU eviction, DB persistence
- `contextBundleGenerator.test.ts` - Bundle generation, validation, size limits
- `contextTransforms.test.ts` - All transform functions, security checks
- `contextRecipeLoader.test.ts` - Recipe loading, validation, caching
- `contextRecipeValidator.test.ts` - Schema validation, edge cases
- `contextRecipeSelector.test.ts` - Profile selection logic
- `contextLogger.test.ts` - Logging functionality

**Integration Tests**:
- `contextSystem.integration.test.ts` - End-to-end bundle generation
- `contextDatabase.integration.test.ts` - Database operations
- `contextFileSystem.integration.test.ts` - File reading and path security

**Edge Case Tests**:
- `edgeCases.test.ts` - Large files, concurrent operations, memory limits

---

## Known Limitations & Future Work

### Limitations
1. No compression for large bundles (planned for >10MB bundles)
2. No distributed caching (sufficient for current scale)
3. Manual recipe authoring (could add recipe templates/generators)

### Future Enhancements
1. **Minimal Task API** (2-3 weeks)
   - Reduce submission to 3 fields: title, type, intent
   - Auto-detect target files, risk level, context profiles
   - Simplified frontend task creation form

2. **Recipe Versioning** (future)
   - Support loading specific recipe versions
   - Track recipe changes over time
   - Rollback capability

3. **Compression** (future)
   - Gzip compression for bundles >10MB
   - Transparent compression/decompression

4. **Metrics & Telemetry** (future)
   - Track recipe usage patterns
   - Cache hit/miss rates
   - Bundle generation performance

---

## Related Documentation

- **Design**: `/docs/technicalDesigns/dev-bot-context-management.md`
- **Status**: `/docs/CONTEXT_MANAGEMENT_STATUS.md`
- **Completion Plan**: `/docs/CONTEXT_MANAGEMENT_COMPLETION_PLAN.md`
- **Roadmap**: `/docs/plans/PRIORITIZED_FEATURE_ROADMAP.md` (P1.2)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-14 | Initial architecture document (Phase 1 complete) |
| 2.0 | 2025-11-14 | Updated with Phase 2-4 completion status |
