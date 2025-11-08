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

> **Implementation detail:** The PE-1 validator treats missing `EXACTLY/NO MORE` phrases or `DO NOT/MUST NOT` guardrails as blocking errors. Acceptance criteria must read like an audit checklist that explicitly forbids extra work.

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

> **Validator note:** Constraints must start with an imperative (`MUST`, `MUST NOT`, or `DO NOT`). Soft phrases like "Consider avoiding" are rejected so bots receive hard boundaries.

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

> **Validation rule (PE-1):** Every `doNotCreate` entry now requires a plain-language explanation that points the agent back to an existing file or pattern (e.g. `"foo.ts (reuse existing service)"`). The backend validator rejects templates that omit these reasons or use generic phrases, preventing bots from recreating files that already exist.
```

### 6. Validation Guardrails (PE-1)

`validateTaskTemplate()` now enforces the following before a task is accepted:

- **Investigation** – every step must start with an action verb (READ/GREP/CHECK/VERIFY) and `mustFind`/`mustNotDuplicate` entries must reference concrete artifacts.
- **Acceptance criteria** – at least one criterion must include `EXACTLY`/`NO MORE` language *and* another must include a `DO NOT` / `MUST NOT` guardrail to block feature creep.
- **Constraints** – each constraint must begin with `MUST`/`MUST NOT`, and the list must include at least one `MUST NOT` directive.
- **doNotCreate** – required list where every entry follows `<path> (reason)` with instructions about which existing code to reuse.
- **Files & git workflow** – missing `files`, `doNotCreate`, or `gitWorkflow.branch` entries produce actionable errors.

Use `shouldValidateAsV3Template()` anywhere templates are submitted; it triggers the validator even when request bodies omit required sections so we return actionable errors instead of silently accepting incomplete prompts.

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

## Usage Examples

This section provides real-world examples of how to write v3 prompts for common development tasks.

### Example 1: Adding API Endpoint with Validation

**Task Context**: Need to add a new POST endpoint to retrieve task metrics

**❌ BAD v2 Prompt:**
```json
{
  "title": "Add metrics endpoint",
  "description": "Create an endpoint to get task metrics",
  "acceptanceCriteria": [
    "Endpoint returns task statistics",
    "Proper error handling included",
    "Tests added"
  ]
}
```

**Problem**: Bot might create duplicate validation logic, invent extra statistics, or create unnecessary middleware.

**✅ GOOD v3 Prompt:**
```json
{
  "type": "implementation",
  "title": "Add POST /api/tasks/metrics endpoint with existing validation",

  "investigation": {
    "required": true,
    "steps": [
      "READ backend/src/routes/taskRoutes.ts to understand routing pattern",
      "READ backend/src/middleware/validation.ts to find existing validators",
      "GREP for 'validateRequest' in backend/src to see usage pattern",
      "READ backend/src/services/taskExecution.service.ts to find task status query logic",
      "CHECK backend/src/types/taskSchema.ts for TaskMetrics interface"
    ],
    "mustFind": [
      "Existing request validation middleware",
      "Current task status query functions",
      "Metrics response format if any exists"
    ],
    "mustNotDuplicate": [
      "Request validation logic",
      "Database query helpers",
      "Error response formatting"
    ]
  },

  "description": "Add POST /api/tasks/metrics endpoint that returns task statistics using EXISTING validation middleware and query functions. Reuse patterns from GET /api/tasks endpoint.",

  "acceptanceCriteria": [
    "EXACTLY ONE endpoint added: POST /api/tasks/metrics",
    "MUST use existing validateRequest middleware from validation.ts",
    "MUST use existing getTasksByStatus() from taskExecution.service.ts",
    "Response returns EXACTLY these 3 fields: total, completed, failed",
    "DO NOT add extra fields like 'pending', 'averageTime', or 'successRate'",
    "DO NOT create new validation middleware",
    "DO NOT create new database query functions",
    "Follow exact error handling pattern from GET /api/tasks endpoint at line 45"
  ],

  "files": [
    "backend/src/routes/taskRoutes.ts",
    "backend/src/middleware/validation.ts",
    "backend/src/services/taskExecution.service.ts",
    "backend/src/types/taskSchema.ts"
  ],

  "modifyOnly": [
    "backend/src/routes/taskRoutes.ts"
  ],

  "doNotModify": [
    "backend/src/middleware/validation.ts",
    "backend/src/services/taskExecution.service.ts"
  ],

  "doNotCreate": [
    "backend/src/middleware/metricsValidation.ts (use existing validation.ts)",
    "backend/src/services/metricsService.ts (use existing taskExecution.service.ts)",
    "backend/src/utils/metricsHelpers.ts (use existing query functions)"
  ],

  "constraints": [
    "MUST follow routing pattern from line 40-60 in taskRoutes.ts",
    "MUST NOT add middleware beyond existing validateRequest",
    "MUST NOT query database directly (use service functions)",
    "MUST return exactly 3 metrics, no more",
    "MUST use existing error handling pattern"
  ]
}
```

**Key Learning**: Specify exact count of fields, prohibit common extras, require use of existing validation.

---

### Example 2: Refactoring Code for Reusability

**Task Context**: Multiple services have duplicate database connection code that needs to be centralized

**❌ BAD v2 Prompt:**
```json
{
  "title": "Refactor database connections",
  "description": "Consolidate database connection logic",
  "acceptanceCriteria": [
    "Connection logic centralized",
    "All services updated",
    "Better error handling"
  ]
}
```

**Problem**: Bot might refactor unrelated code, add connection pooling features not requested, or change error handling patterns across the codebase.

**✅ GOOD v3 Prompt:**
```json
{
  "type": "refactoring",
  "title": "Extract duplicate DB connection code from 3 services to database.ts",

  "investigation": {
    "required": true,
    "steps": [
      "READ backend/src/services/database.ts to understand existing connection pattern",
      "READ backend/src/services/taskPersistence.ts lines 15-30 for connection code",
      "READ backend/src/services/ephemeralWorker.service.ts lines 25-40 for connection code",
      "READ backend/src/services/devBotsManager.factory.ts lines 35-50 for connection code",
      "GREP for 'new Database(' across backend/src to find all instances",
      "CHECK backend/src/services/database.ts for existing connection functions"
    ],
    "mustFind": [
      "Existing getDatabaseConnection() function if any",
      "Current connection initialization pattern",
      "Error handling approach for connection failures"
    ],
    "mustNotDuplicate": [
      "Connection retry logic (if exists)",
      "Connection pool management (if exists)",
      "Database initialization code"
    ]
  },

  "description": "EXTRACT duplicate 'new Database(taskQueueDbPath)' code from EXACTLY 3 services into a single reusable function in database.ts. DO NOT refactor other database code. DO NOT add connection pooling or retry logic.",

  "acceptanceCriteria": [
    "CREATE EXACTLY ONE new function: getTaskQueueConnection()",
    "MOVE duplicate connection code from EXACTLY these 3 files:",
    "  - taskPersistence.ts (lines 15-30)",
    "  - ephemeralWorker.service.ts (lines 25-40)",
    "  - devBotsManager.factory.ts (lines 35-50)",
    "REPLACE 15 lines of duplicate code with 3 function calls",
    "DO NOT refactor other services beyond these 3",
    "DO NOT add connection pooling",
    "DO NOT add retry logic",
    "DO NOT change error handling behavior",
    "MUST preserve exact same functionality (zero behavior changes)"
  ],

  "files": [
    "backend/src/services/database.ts",
    "backend/src/services/taskPersistence.ts",
    "backend/src/services/ephemeralWorker.service.ts",
    "backend/src/services/devBotsManager.factory.ts"
  ],

  "modifyOnly": [
    "backend/src/services/database.ts",
    "backend/src/services/taskPersistence.ts",
    "backend/src/services/ephemeralWorker.service.ts",
    "backend/src/services/devBotsManager.factory.ts"
  ],

  "doNotModify": [
    "backend/src/services/database.test.ts",
    "backend/src/config/database.config.ts"
  ],

  "doNotCreate": [
    "backend/src/utils/connectionPool.ts (not requested)",
    "backend/src/utils/databaseHelpers.ts (add to existing database.ts)",
    "backend/src/services/connectionManager.ts (use database.ts)"
  ],

  "constraints": [
    "MUST extract to database.ts only (existing file)",
    "MUST refactor EXACTLY 3 services listed above",
    "MUST NOT refactor any other services",
    "MUST NOT add features (pooling, retry, caching)",
    "MUST preserve exact error handling behavior",
    "MUST NOT change function signatures of calling code",
    "MUST keep same number of database connections"
  ],

  "preImplementationChecklist": [
    "[ ] Read all 4 files completely",
    "[ ] Identify exact duplicate code (lines specified above)",
    "[ ] Verify no existing connection function in database.ts",
    "[ ] Confirm only 3 services need refactoring",
    "[ ] Check if any tests depend on current implementation",
    "[ ] Document current behavior to preserve it exactly"
  ]
}
```

**Key Learning**: For refactoring, specify exact files/lines, prohibit scope expansion, require zero behavior changes.

---

### Example 3: Bug Fix with Investigation

**Task Context**: Users report tasks getting stuck in "in_progress" state indefinitely

**❌ BAD v2 Prompt:**
```json
{
  "title": "Fix stuck tasks bug",
  "description": "Tasks stuck in progress need timeout",
  "acceptanceCriteria": [
    "Tasks timeout after reasonable period",
    "Status updated properly",
    "Tests added"
  ]
}
```

**Problem**: Bot might add timeout logic in wrong place, create new monitoring system, or add unrequested features like task retry.

**✅ GOOD v3 Prompt:**
```json
{
  "type": "bug-fix",
  "title": "Add 30-minute timeout check to existing task status updater",

  "investigation": {
    "required": true,
    "steps": [
      "READ backend/src/services/taskExecution.service.ts to understand task lifecycle",
      "READ backend/src/services/taskExecution.service.ts updateTaskStatus() function",
      "GREP for 'in_progress' in backend/src to find all status update locations",
      "READ backend/src/services/taskExecution.service.ts checkStuckTasks() to see if timeout logic exists",
      "CHECK task schema in backend/src/types/taskSchema.ts for timestamp fields",
      "READ logs/backend.log to understand current behavior when tasks get stuck"
    ],
    "mustFind": [
      "Where tasks are marked as 'in_progress'",
      "Existing task status update logic",
      "Task timestamp fields (started_at, updated_at)"
    ],
    "mustNotDuplicate": [
      "Task status update logic",
      "Database query functions",
      "Logging infrastructure"
    ]
  },

  "description": "ADD timeout check to EXISTING updateTaskStatus() function in taskExecution.service.ts. Mark tasks as 'failed' with timeout error if in_progress for >30 minutes. DO NOT create new monitoring service. DO NOT add retry logic.",

  "acceptanceCriteria": [
    "MODIFY EXACTLY ONE function: updateTaskStatus() in taskExecution.service.ts",
    "ADD timeout check using existing started_at timestamp field",
    "Timeout threshold is EXACTLY 30 minutes (1800000ms)",
    "Mark as 'failed' with error message 'Task timeout: exceeded 30 minute limit'",
    "DO NOT create new timeout monitoring service",
    "DO NOT add retry logic (future feature)",
    "DO NOT modify task scheduler",
    "DO NOT add new database fields",
    "MUST use existing logging pattern from line 145",
    "Test file must verify EXACTLY 30 minute timeout (not 29, not 31)"
  ],

  "files": [
    "backend/src/services/taskExecution.service.ts",
    "backend/src/types/taskSchema.ts"
  ],

  "modifyOnly": [
    "backend/src/services/taskExecution.service.ts"
  ],

  "doNotModify": [
    "backend/src/services/taskScheduler.ts",
    "backend/src/services/database.ts",
    "backend/src/types/taskSchema.ts"
  ],

  "doNotCreate": [
    "backend/src/services/taskTimeout.service.ts (add to existing taskExecution.service.ts)",
    "backend/src/utils/timeoutHelpers.ts (use inline logic)",
    "backend/src/middleware/timeoutMonitor.ts (not needed)"
  ],

  "constraints": [
    "MUST add code to updateTaskStatus() function only",
    "MUST use existing started_at timestamp (no new fields)",
    "MUST set timeout to exactly 30 minutes",
    "MUST mark as 'failed' not 'timeout' status",
    "MUST NOT create separate timeout monitoring",
    "MUST NOT add retry mechanism (separate feature)",
    "MUST follow existing error logging pattern at line 145"
  ],

  "testingRequirements": {
    "unitTests": [
      "Test task fails after exactly 30 minutes",
      "Test task does not fail at 29 minutes",
      "Test error message matches specification",
      "Test status changes from in_progress to failed"
    ],
    "doNotTest": [
      "Retry behavior (not implemented)",
      "Task recovery (future feature)",
      "Notification system (separate concern)"
    ]
  }
}
```

**Key Learning**: For bug fixes, specify exact location to modify, exact timeout value, prohibit related features that seem logical but aren't requested.

---

### Common Patterns Across Examples

1. **Investigation is mandatory** - Always specify exact files and functions to read
2. **Use exact values** - "30 minutes" not "reasonable timeout", "3 fields" not "basic metrics"
3. **Prohibit common scope creep** - Every example has explicit "DO NOT" list
4. **Specify exact modification scope** - One function, three services, exact line numbers
5. **Require reuse over creation** - Force use of existing validation, logging, queries
6. **Name files that should NOT be created** - Prevent predictable overengineering

---

**Version**: 3.0
**Created**: 2025-11-06
**Status**: Active - All new tasks must use v3
