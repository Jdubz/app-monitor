# Bot Prompt Engineering v3: Strict Scope & Codebase Investigation

## Overview
Version 3 prompt engineering principles to prevent bots from:
1. **Inventing features** not explicitly requested
2. **Duplicating existing functionality** instead of building on it
3. **Skipping codebase investigation** before implementation

## Core Principles

### 1. Strict Scope Enforcement

**Problem**: Bots add "nice to have" features beyond requirements
**Solution**: Explicit constraints with exact names/counts

#### Before (v2):
```json
{
  "acceptanceCriteria": [
    "All 8 tables created with proper relationships"
  ]
}
```

#### After (v3):
```json
{
  "acceptanceCriteria": [
    "EXACTLY these 6 tables created (no more, no less):",
    "- tasks",
    "- task_files",
    "- task_dependencies",
    "- task_acceptance_criteria",
    "- task_metadata",
    "- task_estimated_effort",
    "DO NOT add task_tags, task_quality_metrics, or any other tables"
  ]
}
```

### 2. Mandatory Codebase Investigation

**Problem**: Bots implement new features that duplicate existing code
**Solution**: Require explicit investigation steps BEFORE implementation

#### Investigation Requirements:

All tasks MUST include an `investigation` field:

```json
{
  "investigation": {
    "required": true,
    "steps": [
      "READ backend/src/services/taskPersistence.ts to understand current task storage",
      "GREP for existing 'task.*create' functions across backend/src",
      "CHECK if task queue functions exist in database.ts",
      "VERIFY no duplicate implementations in related services"
    ],
    "mustFind": [
      "Current task creation logic",
      "Existing database schema",
      "Related utility functions"
    ],
    "mustNotDuplicate": [
      "Task creation functions",
      "Database connection logic",
      "Validation helpers"
    ]
  }
}
```

### 3. Explicit Action Constraints

**Problem**: Vague instructions lead to overengineering
**Solution**: Use action verbs with explicit boundaries

#### Action Verb Dictionary:

- **CREATE** - Write new file that doesn't exist (requires verification)
- **MODIFY** - Edit existing file (must read first)
- **EXTEND** - Add to existing functionality (requires investigation)
- **REFACTOR** - Restructure without changing behavior (extensive testing required)
- **INTEGRATE** - Connect existing components (identify both first)
- **IMPLEMENT** - Code to specification (check for existing implementation first)

### 4. Pre-Implementation Checklist

Every task prompt should include a mandatory checklist:

```json
{
  "preImplementationChecklist": [
    "[ ] Read all files in the 'files' array",
    "[ ] Search codebase for similar functionality using grep/glob",
    "[ ] Identify existing utility functions that can be reused",
    "[ ] Verify no duplicate implementations exist",
    "[ ] Check if requested feature already exists in different form",
    "[ ] Review related tests to understand current behavior",
    "[ ] Document existing code that will be extended/modified"
  ]
}
```

### 5. Strict File Scope

Use three fields to control file access:

```json
{
  "files": [
    "backend/src/services/database.ts",
    "backend/src/services/taskPersistence.ts"
  ],
  "modifyOnly": [
    "backend/src/services/database.ts"
  ],
  "doNotModify": [
    "backend/src/services/database.test.ts",
    "backend/src/types/taskSchema.ts"
  ],
  "doNotCreate": [
    "backend/src/services/taskRepository.ts (use existing taskPersistence.ts instead)",
    "backend/src/utils/taskHelpers.ts (extend existing helpers.ts)"
  ]
}
```

## Task Template v3

### Complete Example:

```json
{
  "type": "implementation",
  "title": "Add task retry limit to SQLite schema",

  "description": "Extend existing tasks table with retry_limit column to support max retry configuration per task.",

  "investigation": {
    "required": true,
    "steps": [
      "READ backend/src/services/database.ts to understand migration pattern",
      "READ backend/migrations/001_initial_schema.sql to see current tasks table",
      "GREP for 'retry' in backend/src to find related retry logic",
      "CHECK backend/src/types/taskSchema.ts for Task interface definition"
    ],
    "mustFind": [
      "Current tasks table schema",
      "Existing retry-related fields",
      "Task type definitions"
    ],
    "mustNotDuplicate": [
      "Migration runner logic",
      "Task creation logic",
      "Validation functions"
    ]
  },

  "documentation": "READ backend/src/services/database.ts lines 150-200 for migration pattern. EXTEND existing tasks table, do NOT create new table.",

  "acceptanceCriteria": [
    "EXACTLY ONE new column added to tasks table: retry_limit INTEGER DEFAULT 3",
    "Column added via ALTER TABLE statement in new migration file",
    "NO new tables created",
    "NO duplicate retry columns created",
    "Migration follows exact pattern from migration 001",
    "Task interface updated in backend/src/types/taskSchema.ts",
    "All existing tests pass"
  ],

  "files": [
    "backend/src/services/database.ts",
    "backend/migrations/001_initial_schema.sql",
    "backend/src/types/taskSchema.ts"
  ],

  "modifyOnly": [
    "backend/src/services/database.ts",
    "backend/src/types/taskSchema.ts"
  ],

  "doNotModify": [
    "backend/src/services/taskPersistence.ts",
    "backend/src/services/database.test.ts"
  ],

  "doNotCreate": [
    "backend/migrations/new_tasks_table.sql (extend existing, don't recreate)",
    "backend/src/types/retryConfig.ts (add to existing taskSchema.ts)",
    "backend/src/utils/retryHelpers.ts (use existing error handling)"
  ],

  "constraints": [
    "MUST use existing migration pattern from database.ts",
    "MUST NOT create any new files",
    "MUST NOT modify any test files",
    "MUST NOT add features beyond retry_limit column",
    "MUST NOT refactor existing code unless explicitly required",
    "MUST use existing TypeScript types and interfaces"
  ],

  "preImplementationChecklist": [
    "[ ] Read database.ts to understand migration system",
    "[ ] Read 001_initial_schema.sql to see current schema",
    "[ ] Check taskSchema.ts for existing Task interface",
    "[ ] Grep for 'retry' to find related code",
    "[ ] Verify no duplicate retry_limit field exists",
    "[ ] Confirm migration pattern to follow"
  ],

  "gitWorkflow": {
    "required": true,
    "branch": "staging",
    "commitMessage": "feat: add retry_limit column to tasks table\n\nExtends existing tasks table with configurable retry limit.\n\n🤖 Generated with Claude Code\n\nCo-Authored-By: Claude <noreply@anthropic.com>"
  },

  "assignedAgent": "backend-specialist",
  "priority": 7,

  "estimatedEffort": {
    "hours": 0.5,
    "complexity": "simple",
    "confidence": "high"
  },

  "metadata": {
    "promptEngineeringVersion": "v3",
    "strictScopeEnforcement": true,
    "mandatoryInvestigation": true,
    "duplicateProtection": true
  }
}
```

## Specification Document Guidelines

### Problem: Planning Docs Include Invented Features

When creating specification documents (like migration plans), follow these rules:

#### ❌ BAD - Includes extras:
```markdown
## Schema Design

We'll create these tables:
- tasks (required)
- task_files (required)
- task_dependencies (required)
- task_acceptance_criteria (required)
- task_metadata (required)
- task_estimated_effort (required)
- task_tags (nice to have - for categorization)
- task_quality_metrics (nice to have - for tracking)
```

#### ✅ GOOD - Strict scope:
```markdown
## Schema Design - STRICT SCOPE

**REQUIRED TABLES (6 total - DO NOT ADD MORE):**
1. tasks - primary task queue table
2. task_files - files associated with tasks
3. task_dependencies - task dependency relationships
4. task_acceptance_criteria - success criteria per task
5. task_metadata - flexible key-value metadata
6. task_estimated_effort - time/complexity estimates

**EXPLICITLY EXCLUDED (for future phases):**
- task_tags - Phase 2 feature
- task_quality_metrics - Phase 3 feature
- task_history - Phase 4 feature

**IMPLEMENTATION RULES:**
- Create EXACTLY 6 tables listed above
- DO NOT add any additional tables
- DO NOT add "nice to have" features
- If you think another table is needed, STOP and ask first
```

## Investigation-First Pattern

### Implementation Workflow:

```
1. INVESTIGATE (30% of time)
   ├─ Read all relevant existing code
   ├─ Search for similar functionality
   ├─ Identify reusable components
   └─ Document findings

2. PLAN (20% of time)
   ├─ Determine what to extend vs create
   ├─ List exact changes needed
   ├─ Verify no duplication
   └─ Get approval if uncertain

3. IMPLEMENT (40% of time)
   ├─ Follow existing patterns
   ├─ Reuse existing code
   ├─ Stay within strict scope
   └─ Test incrementally

4. VERIFY (10% of time)
   ├─ Confirm no duplication created
   ├─ Check no extra features added
   ├─ Validate tests pass
   └─ Commit with proper message
```

## Validation Checklist for Task Creators

Before assigning a task to a bot, verify:

- [ ] Investigation steps explicitly listed
- [ ] Exact feature names/counts specified (not just numbers)
- [ ] Existing code to extend identified
- [ ] Files to modify clearly separated from files to read
- [ ] "Do not create" list includes common pitfalls
- [ ] Constraints section lists prohibited actions
- [ ] Acceptance criteria use "EXACTLY" for countable items
- [ ] No vague terms like "improve", "enhance", "optimize"
- [ ] Git workflow specifies exactly what to commit

## Common Anti-Patterns to Prevent

### 1. Feature Creep
❌ "Create task queue with proper relationships"
✅ "Add EXACTLY these 6 tables: tasks, task_files, task_dependencies, task_acceptance_criteria, task_metadata, task_estimated_effort. DO NOT add task_tags or any other tables."

### 2. Duplicate Implementations
❌ "Implement user authentication"
✅ "EXTEND existing authentication in backend/src/auth/authService.ts by adding OAuth support. DO NOT create new auth system. MUST use existing User model and session management."

### 3. Unnecessary Refactoring
❌ "Improve error handling in API routes"
✅ "ADD error handling to POST /tasks endpoint at line 150. MUST use existing errorMiddleware.ts. DO NOT refactor other routes. DO NOT change error response format."

### 4. Scope Expansion
❌ "Add SQLite migrations for task queue"
✅ "Create migration 002 that adds ONLY task queue tables. DO NOT migrate existing user tables. DO NOT add indexes to other tables. DO NOT optimize existing migrations."

## Bot Prompt Template Generator

Use this template for all bot tasks:

```typescript
interface BotTaskV3 {
  type: TaskType;
  title: string; // Clear, specific, no vague terms

  // MANDATORY INVESTIGATION
  investigation: {
    required: true;
    steps: string[]; // Explicit READ/GREP/CHECK commands
    mustFind: string[]; // What existing code must be located
    mustNotDuplicate: string[]; // What must not be reimplemented
  };

  // CLEAR DESCRIPTION
  description: string; // What to do and why
  documentation: string; // Exactly where to look and what to extend

  // STRICT ACCEPTANCE CRITERIA
  acceptanceCriteria: string[]; // Use "EXACTLY", list specific names

  // FILE SCOPE CONTROL
  files: string[]; // All files to read/investigate
  modifyOnly: string[]; // Only files that can be changed
  doNotModify: string[]; // Explicitly protected files
  doNotCreate: string[]; // Common mistakes to avoid

  // EXPLICIT CONSTRAINTS
  constraints: string[]; // "MUST", "MUST NOT" rules

  // PRE-IMPLEMENTATION VERIFICATION
  preImplementationChecklist: string[];

  // GIT WORKFLOW
  gitWorkflow: {
    required: boolean;
    branch: string;
    commitMessage: string;
  };

  // METADATA
  metadata: {
    promptEngineeringVersion: "v3";
    strictScopeEnforcement: true;
    mandatoryInvestigation: true;
    duplicateProtection: true;
  };
}
```

## Success Metrics

Track these metrics to validate v3 effectiveness:

1. **Scope Compliance**: % of tasks that deliver exactly what was specified
2. **Duplication Rate**: % of tasks that reimplement existing functionality
3. **Investigation Quality**: % of tasks that reference existing code
4. **Feature Creep**: % of tasks that add unrequested features
5. **Git Workflow Compliance**: % of tasks that commit properly

**Target Goals:**
- Scope Compliance: 100% (zero tolerance for extras)
- Duplication Rate: 0% (must extend, not duplicate)
- Investigation Quality: 100% (required for all tasks)
- Feature Creep: 0% (strictly forbidden)
- Git Workflow: 100% (mandatory)

## Migration from v2 to v3

### v2 → v3 Changes:

1. **Add investigation field** to all tasks (mandatory)
2. **Replace counts with names** in acceptance criteria
3. **Add doNotCreate field** with common pitfalls
4. **Add constraints section** with MUST/MUST NOT rules
5. **Add preImplementationChecklist** for bot verification
6. **Update spec docs** to explicitly exclude future features

### Backward Compatibility:

- v3 is compatible with v2 tasks
- v3 adds requirements, doesn't remove features
- Bots can handle both v2 and v3 prompts
- v3 improves success rate without breaking existing tasks

## Examples from Production

### Case Study 1: SQLite Migration Task

**v2 Prompt (BAD):**
```json
{
  "title": "Add SQLite migration for task queue",
  "acceptanceCriteria": ["8 tables created with indexes"]
}
```

**Result:** Bot created 8 tables including 2 unrequested ones (task_tags, task_quality_metrics)

**v3 Prompt (GOOD):**
```json
{
  "title": "Add SQLite migration 002 for task queue",
  "investigation": {
    "required": true,
    "steps": [
      "READ backend/migrations/001_initial_schema.sql",
      "READ docs/plans/TASK_QUEUE_SQLITE_MIGRATION.md lines 78-131",
      "CHECK for existing task-related tables in database"
    ],
    "mustFind": ["Existing migration pattern", "Task interface definition"],
    "mustNotDuplicate": ["Migration runner", "Database connection logic"]
  },
  "acceptanceCriteria": [
    "EXACTLY these 6 tables created:",
    "- tasks",
    "- task_files",
    "- task_dependencies",
    "- task_acceptance_criteria",
    "- task_metadata",
    "- task_estimated_effort",
    "DO NOT create task_tags table",
    "DO NOT create task_quality_metrics table"
  ]
}
```

**Expected Result:** Exactly 6 tables, no extras

---

## Summary: v3 Core Requirements

Every bot task MUST have:

1. ✅ **Investigation section** with explicit steps
2. ✅ **Exact feature names** not just counts
3. ✅ **"mustNotDuplicate" list** of existing code
4. ✅ **"doNotCreate" list** of common mistakes
5. ✅ **"constraints" section** with MUST/MUST NOT rules
6. ✅ **Pre-implementation checklist** for bot to verify
7. ✅ **Strict scope** in acceptance criteria (use "EXACTLY")

**Golden Rule**: If a bot needs to ask "should I add X?", the prompt wasn't specific enough.

---

**Version**: 3.0
**Created**: 2025-11-06
**Status**: Active - All new tasks must use v3
