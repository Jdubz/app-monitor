# Dev-Bot Test Tasks - November 6, 2025

## Purpose
Small, granular tasks to validate prompt engineering v3 improvements and bot effectiveness.

## Test Strategy
- Start with simple, well-scoped tasks
- Each task tests specific failure modes
- Monitor for: scope compliance, investigation completion, git workflow success
- Build useful features while testing

---

## Test Task 1: Add Health Check Endpoint

**Priority**: HIGH
**Estimated Time**: 0.5 hours
**Tests**: Investigation phase, simple implementation, git workflow

### Task Details
```json
{
  "id": "test-task-1-health-check",
  "type": "feature",
  "title": "Add /health endpoint to backend API",
  "description": "Add a simple health check endpoint that returns server status and uptime. This will be useful for monitoring and deployment verification.",

  "investigation": {
    "required": true,
    "steps": [
      "READ backend/src/server.ts to see existing API structure",
      "GREP for 'app.get' to find existing endpoint patterns",
      "CHECK if a health endpoint already exists",
      "FIND where routes are defined"
    ],
    "mustFind": [
      "Express app configuration",
      "Existing route definitions",
      "Server startup code"
    ],
    "mustNotDuplicate": [
      "Existing health check code (if any)",
      "Server initialization logic"
    ]
  },

  "documentation": "READ backend/src/server.ts lines 1-100 to understand server setup. EXTEND existing route definitions by adding ONE new endpoint. DO NOT modify existing routes.",

  "acceptanceCriteria": [
    "EXACTLY ONE new endpoint added: GET /api/health",
    "Endpoint returns JSON with: { status: 'ok', uptime: <seconds>, timestamp: <iso8601> }",
    "Endpoint responds with HTTP 200 status code",
    "NO other endpoints modified or created",
    "NO changes to server configuration or middleware",
    "Code follows existing Express route patterns in the file"
  ],

  "files": ["backend/src/server.ts"],
  "modifyOnly": ["backend/src/server.ts"],
  "doNotModify": [
    "backend/src/services/**",
    "backend/src/routes/**",
    "backend/package.json"
  ],
  "doNotCreate": [
    "backend/src/routes/health.ts (add directly to server.ts)",
    "backend/src/middleware/health.ts (not needed for simple endpoint)",
    "backend/src/services/healthService.ts (too complex for this task)"
  ],

  "constraints": {
    "must": [
      "MUST use existing Express app instance",
      "MUST follow existing route pattern in server.ts",
      "MUST return JSON response",
      "MUST use process.uptime() for uptime calculation",
      "MUST commit and push changes to staging"
    ],
    "mustNot": [
      "MUST NOT create new files",
      "MUST NOT modify package.json",
      "MUST NOT add new dependencies",
      "MUST NOT modify existing routes",
      "MUST NOT change server configuration"
    ]
  },

  "preImplementationChecklist": [
    "[ ] Read backend/src/server.ts to understand structure",
    "[ ] Confirmed no existing health endpoint",
    "[ ] Identified where to add new route (after existing routes)",
    "[ ] Understand Express route syntax used in file"
  ],

  "successMetrics": [
    "Endpoint responds to GET /api/health with 200 status",
    "Response contains all 3 required fields (status, uptime, timestamp)",
    "Response time < 50ms",
    "Zero linting errors",
    "Git commit exists with changes",
    "Git push to staging succeeded"
  ],

  "estimatedEffort": {
    "hours": 0.5,
    "complexity": "simple",
    "confidence": "high"
  },

  "gitWorkflow": {
    "required": true,
    "branch": "staging",
    "commitMessage": "feat: add /api/health endpoint for server monitoring",
    "mustCommit": ["backend/src/server.ts"],
    "mustNotCommit": ["package.json", "node_modules", ".env"]
  }
}
```

### Expected Outcome
- Simple endpoint added (5-10 lines of code)
- No scope creep (no logging, no database checks, no complex health logic)
- Git commit and push successful
- Investigation documented in code comments

---

## Test Task 2: Add TypeScript Type for Task Status

**Priority**: HIGH
**Estimated Time**: 0.25 hours
**Tests**: Code reuse, minimal changes, type safety

### Task Details
```json
{
  "id": "test-task-2-task-status-type",
  "type": "refactor",
  "title": "Extract Task status values into TypeScript union type",
  "description": "Currently task status values are repeated as string literals throughout the code. Extract them into a reusable union type for type safety.",

  "investigation": {
    "required": true,
    "steps": [
      "GREP for \"status.*=.*'pending'\" to find all status assignments",
      "GREP for \"status.*'completed'\" to find status checks",
      "READ backend/src/services/devBotsManager.ts to see Task interface",
      "CHECK if TaskStatus type already exists in types directory"
    ],
    "mustFind": [
      "Current Task interface definition",
      "All status values used in code",
      "Location of type definitions"
    ],
    "mustNotDuplicate": [
      "Existing type definitions",
      "Existing status constants"
    ]
  },

  "documentation": "READ backend/src/services/devBotsManager.ts to find Task interface. ADD a union type for status values. DO NOT change the interface structure, only make status field more type-safe.",

  "acceptanceCriteria": [
    "EXACTLY ONE new type created: TaskStatus = 'pending' | 'assigned' | 'active' | 'completed' | 'failed'",
    "Task interface updated to use TaskStatus instead of string",
    "NO other types created",
    "NO changes to any function logic",
    "NO changes to any status values",
    "Type appears BEFORE the Task interface definition"
  ],

  "files": ["backend/src/services/devBotsManager.ts"],
  "modifyOnly": ["backend/src/services/devBotsManager.ts"],
  "doNotModify": [
    "backend/src/services/taskPersistence.ts",
    "backend/src/services/taskQueue.ts",
    "Any test files"
  ],
  "doNotCreate": [
    "backend/src/types/taskStatus.ts (add to existing file)",
    "backend/src/types/task.ts (use existing location)"
  ],

  "constraints": {
    "must": [
      "MUST define TaskStatus type with EXACTLY 5 values",
      "MUST update Task interface status field to use TaskStatus",
      "MUST keep all existing status values unchanged",
      "MUST maintain backward compatibility"
    ],
    "mustNot": [
      "MUST NOT add new status values",
      "MUST NOT remove existing status values",
      "MUST NOT change function signatures",
      "MUST NOT modify any logic"
    ]
  },

  "preImplementationChecklist": [
    "[ ] Read Task interface in devBotsManager.ts",
    "[ ] Found all 5 status values: pending, assigned, active, completed, failed",
    "[ ] Confirmed no existing TaskStatus type",
    "[ ] Identified exact line to add type (before Task interface)"
  ],

  "successMetrics": [
    "TypeScript compilation succeeds with no errors",
    "Exactly 1 new type definition added",
    "Exactly 1 interface field changed (status: string -> status: TaskStatus)",
    "Zero new linting errors",
    "Git commit and push succeeded"
  ],

  "estimatedEffort": {
    "hours": 0.25,
    "complexity": "simple",
    "confidence": "high"
  },

  "gitWorkflow": {
    "required": true,
    "branch": "staging",
    "commitMessage": "refactor: add TaskStatus union type for type safety",
    "mustCommit": ["backend/src/services/devBotsManager.ts"],
    "mustNotCommit": ["package.json", "node_modules"]
  }
}
```

### Expected Outcome
- 2 line addition (type definition)
- 1 line modification (interface field)
- No scope creep (no status validation, no migration, no refactoring of all usages)

---

## Test Task 3: Add JSDoc Comments to Task Interface

**Priority**: MEDIUM
**Estimated Time**: 0.5 hours
**Tests**: Documentation, minimal scope, reading existing code

### Task Details
```json
{
  "id": "test-task-3-task-interface-jsdoc",
  "type": "documentation",
  "title": "Add JSDoc comments to Task interface fields",
  "description": "The Task interface lacks documentation. Add JSDoc comments to each field explaining its purpose.",

  "investigation": {
    "required": true,
    "steps": [
      "READ backend/src/services/devBotsManager.ts to see Task interface",
      "COUNT the number of fields in Task interface",
      "CHECK if any fields already have JSDoc comments",
      "REVIEW how each field is used in the code"
    ],
    "mustFind": [
      "Task interface definition",
      "All field names and types",
      "How fields are used in DevBotsManager class"
    ],
    "mustNotDuplicate": [
      "Existing documentation patterns",
      "Existing JSDoc comments (if any)"
    ]
  },

  "documentation": "READ backend/src/services/devBotsManager.ts lines 10-100 to find Task interface. ADD JSDoc comments to ONLY the interface fields. DO NOT modify the interface structure or field types.",

  "acceptanceCriteria": [
    "JSDoc comment added for EACH field in Task interface",
    "Each comment includes @type and description",
    "Comments are concise (1-2 lines per field)",
    "NO interface fields added, removed, or renamed",
    "NO changes to field types",
    "NO changes to any functions or classes"
  ],

  "files": ["backend/src/services/devBotsManager.ts"],
  "modifyOnly": ["backend/src/services/devBotsManager.ts"],
  "doNotModify": [
    "Any other files",
    "Any function implementations",
    "Any class definitions"
  ],
  "doNotCreate": [
    "No new files needed"
  ],

  "constraints": {
    "must": [
      "MUST add JSDoc comment for EVERY field in Task interface",
      "MUST use /** */ style comments",
      "MUST keep comments concise and clear",
      "MUST not change any code, only add comments"
    ],
    "mustNot": [
      "MUST NOT modify interface structure",
      "MUST NOT change field types",
      "MUST NOT add new fields",
      "MUST NOT modify functions"
    ]
  },

  "preImplementationChecklist": [
    "[ ] Read Task interface completely",
    "[ ] Counted exact number of fields to document",
    "[ ] Understand purpose of each field from usage",
    "[ ] Know JSDoc syntax for interfaces"
  ],

  "successMetrics": [
    "Every Task interface field has JSDoc comment",
    "Comments follow standard JSDoc format",
    "TypeScript compilation succeeds",
    "Zero linting errors",
    "Git commit and push succeeded"
  ],

  "estimatedEffort": {
    "hours": 0.5,
    "complexity": "simple",
    "confidence": "high"
  },

  "gitWorkflow": {
    "required": true,
    "branch": "staging",
    "commitMessage": "docs: add JSDoc comments to Task interface fields",
    "mustCommit": ["backend/src/services/devBotsManager.ts"],
    "mustNotCommit": ["package.json", "node_modules"]
  }
}
```

### Expected Outcome
- JSDoc comments added (one per field, ~15-20 fields)
- No scope creep (no refactoring, no restructuring, no adding new fields)
- Pure documentation task

---

## Success Metrics for Test Suite

### Scope Compliance
- **Target**: 100% (zero extra features)
- **Measure**: Compare acceptance criteria to actual deliverables

### Investigation Completion
- **Target**: 100% (all investigation steps documented)
- **Measure**: Check for evidence of grep/find/read commands in logs

### Git Workflow Success
- **Target**: 100% (all commits and pushes succeed)
- **Measure**: Verify commits exist in git log and are pushed to origin

### Code Quality
- **Target**: Zero linting errors, zero test failures
- **Measure**: Run linters and tests after each task

### Time Accuracy
- **Target**: Within 50% of estimate
- **Measure**: Track actual time vs estimated time

---

## Monitoring Checklist

For each task execution, verify:

- [ ] Bot ran investigation commands before coding
- [ ] Bot created EXACTLY what was requested (no more, no less)
- [ ] Bot committed changes with proper message
- [ ] Bot pushed to staging successfully
- [ ] Bot completed in reasonable time
- [ ] No new linting errors introduced
- [ ] No test failures introduced
- [ ] Bot documented investigation findings

---

## Next Steps After Testing

1. Analyze results and identify remaining gaps
2. Iterate on prompt improvements based on findings
3. Create more complex test tasks if simple ones succeed
4. Document patterns of success and failure
5. Update prompt engineering guidelines based on learnings
