# Bot Execution Quality Improvements

**Status**: In Progress
**Priority**: Critical
**Created**: 2025-11-06
**Owner**: Backend Team

## Executive Summary

Analysis of task execution revealed the ephemeral container system works perfectly, but **task prompt quality** is the bottleneck. Bots don't have sufficient information to execute tasks correctly, leading to incomplete or incorrect implementations.

## Problem Statement

### What Went Wrong: Schema Design Task

**Task**: "Design SQLite schema for dev-bot tasks"

**What the bot received**:
- Title: "Design SQLite schema for dev-bot tasks"
- Documentation: "Review backend/src/services/taskPersistence.ts and backend/src/services/database.ts"
- Acceptance Criteria: "SQL CREATE TABLE statement with proper types and indexes"
- Description: `null`
- Files: `[]` (empty!)

**What the bot did**:
- ✅ Found existing migrations 002 and 004
- ✅ Created excellent documentation (537 lines)
- ❌ Did NOT check the actual Task interface in `src/services/devBotsManager.ts:40`
- ❌ Did NOT realize the schema was missing ~30 fields

**Root cause**: The bot didn't know WHERE to find the Task interface definition or that it needed to match ALL fields.

## Current State Analysis

### ✅ What's Working
1. **Ephemeral container execution** - docker run pattern working perfectly
2. **Basic validation** - type, title, documentation, acceptanceCriteria required
3. **Task persistence** - JSON file storage functional (needs SQLite migration)

### ❌ What's Broken
1. **No agent validation** - Invalid agents (database-administrator, frontend-developer) accepted
2. **Vague task specifications** - Missing files array, step-by-step instructions
3. **Incomplete acceptance criteria** - Too generic, not measurable
4. **Schema mismatch** - SQLite schema missing ~30 fields from TypeScript interface

## Proposed Solution

### Phase 1: Validation & Quality Checks (Quick Wins)

#### 1.1 Agent Validation ✓ IMPLEMENTED
**File**: `src/routes/dev-bots.routes.ts:164-172`

```typescript
// Validate assignedAgent if provided
if (assignedAgent) {
  const validAgents = devBotsManager.getValidAgents();
  if (!validAgents.includes(assignedAgent)) {
    return res.status(400).json({
      error: `Invalid agent: ${assignedAgent}. Valid agents: ${validAgents.join(', ')}`
    });
  }
}
```

**Status**: Code added, needs backend restart to test

#### 1.2 Task Quality Validation
**File**: `src/routes/dev-bots.routes.ts:154-184`

Add validation for technical tasks:

```typescript
// Validate task quality for technical task types
const technicalTypes = ['refactor', 'implementation', 'bug', 'feature'];
if (technicalTypes.includes(type)) {
  // Require files array for technical tasks
  if (!files || files.length === 0) {
    logger.warn({
      category: 'api',
      action: 'task_missing_files_array',
      message: `Technical task type '${type}' created without files array`,
      taskId: title
    });
  }

  // Require detailed description
  if (!req.body.description || req.body.description.length < 50) {
    logger.warn({
      category: 'api',
      action: 'task_missing_description',
      message: `Technical task type '${type}' created without detailed description`,
      taskId: title
    });
  }

  // Check acceptance criteria specificity
  if (acceptanceCriteria.length === 1 && acceptanceCriteria[0].length < 30) {
    logger.warn({
      category: 'api',
      action: 'vague_acceptance_criteria',
      message: `Task has vague acceptance criteria: "${acceptanceCriteria[0]}"`,
      taskId: title
    });
  }
}
```

**Benefit**: Warns about low-quality task specifications before execution

### Phase 2: Prompt Template Improvements

#### 2.1 Enhanced Documentation Field
Instead of: "Review backend/src/services/taskPersistence.ts"

Use:
```
Step-by-step instructions:
1. Read the Task interface definition at src/services/devBotsManager.ts lines 40-99
2. List ALL ~40 fields in the interface (id, type, title, description, ... scope, etc.)
3. Open migrations/002_tasks_table.sql and compare
4. Identify which fields are missing from the SQL schema
5. Create migration 005 to add the missing fields with proper SQLite types
```

#### 2.2 Files Array Requirement
For schema/refactor tasks, ALWAYS include:
```json
{
  "files": [
    "src/services/devBotsManager.ts",
    "migrations/002_tasks_table.sql",
    "migrations/004_task_context.sql"
  ]
}
```

#### 2.3 Specific Acceptance Criteria
Instead of: "SQL CREATE TABLE statement with proper types and indexes"

Use:
```json
{
  "acceptanceCriteria": [
    "SQL migration file that adds ALL fields from Task interface (src/services/devBotsManager.ts:40-99) to the tasks table",
    "Include proper SQLite type mapping for each field (TEXT for strings, INTEGER for numbers, JSON for objects)",
    "Add indexes for frequently queried fields (status, assignedAgent, createdAt)",
    "Do NOT duplicate existing migrations 002 or 004 - create new migration 005",
    "Test that migration applies cleanly to existing dev-bots.db"
  ]
}
```

### Phase 3: Prompt Generation Service

Create `src/services/promptEnhancer.ts`:

```typescript
export class PromptEnhancer {
  /**
   * Validates and enhances task data before bot execution
   */
  static enhanceTaskPrompt(task: Partial<Task>): EnhancedTask {
    const enhanced = { ...task };

    // Add file context if missing
    if (this.needsFileContext(task.type)) {
      enhanced.files = this.inferRelevantFiles(task.title, task.documentation);
    }

    // Enhance documentation with step-by-step instructions
    if (this.lacksSteps(task.documentation)) {
      enhanced.documentation = this.addStepByStepInstructions(task);
    }

    // Make acceptance criteria more specific
    if (this.isTooVague(task.acceptanceCriteria)) {
      enhanced.acceptanceCriteria = this.expandCriteria(task);
    }

    return enhanced;
  }

  private static needsFileContext(type: string): boolean {
    return ['refactor', 'implementation', 'bug', 'feature'].includes(type);
  }

  private static inferRelevantFiles(title: string, docs: string): string[] {
    // Use keyword matching to suggest relevant files
    const files: string[] = [];

    if (title.includes('schema') || docs.includes('SQLite')) {
      files.push('migrations/*.sql', 'src/services/database.ts');
    }

    if (title.includes('task') || docs.includes('Task interface')) {
      files.push('src/services/devBotsManager.ts', 'src/types/taskSchema.ts');
    }

    // ... more keyword matching

    return files;
  }
}
```

## Implementation Plan

### Week 1: Validation & Quick Fixes
- [ ] Deploy agent validation (already coded)
- [ ] Add task quality warnings
- [ ] Test with invalid agents - confirm rejection
- [ ] Document valid agents in API docs

### Week 2: Prompt Template Improvements
- [ ] Create prompt template examples for common task types
- [ ] Add step-by-step instruction templates
- [ ] Require files array for technical tasks
- [ ] Create acceptance criteria templates

### Week 3: Prompt Enhancement Service
- [ ] Build PromptEnhancer service
- [ ] Integrate with task creation endpoint
- [ ] Add file inference logic
- [ ] Test with real tasks

### Week 4: Testing & Refinement
- [ ] Re-run schema design task with enhanced prompt
- [ ] Test with 5-10 different task types
- [ ] Measure success rate improvement
- [ ] Document best practices

## Success Metrics

### Before Improvements
- Invalid agents: 2/5 tasks failed (40% failure rate)
- Schema coverage: 20/40 fields (50%)
- Documentation quality: Good but not actionable
- Task completion accuracy: ~60%

### After Improvements (Target)
- Invalid agents: 0% (blocked at API)
- Schema coverage: 40/40 fields (100%)
- Documentation quality: Step-by-step actionable
- Task completion accuracy: >90%

## Risks & Mitigation

### Risk 1: Over-constraining Tasks
**Risk**: Too many requirements make task creation tedious
**Mitigation**: Use warnings (not errors) for non-critical issues. Make enhancement service optional.

### Risk 2: False Positives in File Inference
**Risk**: Suggesting wrong files wastes bot time
**Mitigation**: Conservative inference. Only suggest files with high confidence. Allow manual override.

### Risk 3: Breaking Existing Workflows
**Risk**: Changes break existing task creation patterns
**Mitigation**: Backwards compatible. Only enhance, never break. Add feature flags.

## Related Work

- ✅ **TC-4**: Container credentials - COMPLETED
- ✅ **Ephemeral container migration** - COMPLETED
- ⏳ **WT-1**: Design SQLite schema - ATTEMPTED (needs retry with better prompt)
- ⏳ **WT-2**: Write migration utility - PENDING
- ⏳ **WT-3**: Update services to use SQLite - PENDING

## Next Steps

1. **Immediate**: Test agent validation with backend restart
2. **Today**: Add task quality warnings
3. **This week**: Create prompt template library
4. **Next week**: Build PromptEnhancer service

## Appendix: Example Enhanced Task

### Before
```json
{
  "type": "refactor",
  "title": "Design SQLite schema for dev-bot tasks",
  "documentation": "Review backend/src/services/taskPersistence.ts and backend/src/services/database.ts",
  "description": null,
  "acceptanceCriteria": ["SQL CREATE TABLE statement with proper types and indexes"],
  "files": []
}
```

### After
```json
{
  "type": "refactor",
  "title": "Design SQLite schema for dev-bot tasks",
  "documentation": "Step-by-step:\n1. Read Task interface at src/services/devBotsManager.ts:40-99\n2. List ALL ~40 fields\n3. Compare to migrations/002_tasks_table.sql\n4. Create migration 005 for missing fields\n5. Test migration applies cleanly",
  "description": "Extend the existing tasks table schema to include ALL fields from the TypeScript Task interface. Current schema only has ~20 fields but the interface has ~40 including acceptanceCriteria, estimatedEffort, prerequisites, etc.",
  "acceptanceCriteria": [
    "SQL migration 005 adds ALL missing fields from Task interface (src/services/devBotsManager.ts:40-99)",
    "Proper SQLite type mapping (TEXT for strings, INTEGER for numbers, JSON for objects)",
    "Indexes for status, assignedAgent, createdAt",
    "No duplication of migrations 002/004",
    "Migration tested on dev-bots.db"
  ],
  "files": [
    "src/services/devBotsManager.ts",
    "migrations/002_tasks_table.sql",
    "migrations/004_task_context.sql",
    "src/services/database.ts"
  ]
}
```
