# Claude Workers Task Prompt System - Quick Reference

## File Locations (All in `/dev-monitor/backend/src/services/`)

| File | Lines | Purpose |
|------|-------|---------|
| `taskPromptTemplates.ts` | 557 | Generates task prompts from universal template |
| `taskCreationGuidelines.ts` | 684 | Validates tasks before assignment |
| `agentPersonalities.ts` | 554 | Defines 6 agent types and specializations |
| `taskTypeGuidelines.ts` | 438 | Provides type-specific guidelines (8+ types) |
| `claudeWorkersManager.ts` | 1000+ | Orchestration, scope control, task management |

## Task Required Fields

```javascript
{
  id: string,                    // Unique identifier
  type: string,                  // Task classification
  title: string,                 // Task title (min 10 chars)
  documentation: string,         // Required reading before starting
  acceptanceCriteria: string,    // What qualifies as complete
  status: 'pending'|'assigned'|'active'|'completed'|'failed',
  createdAt: string,             // ISO timestamp
  assignedAgent: string          // Auto-populated; defaults to 'auto-select' until runtime assignment
}
```

## Task Recommended Fields

```javascript
// Specification
description: string,
files: string[],
dependencies: string[],
project: string,

// Scope Control (CRITICAL)
contextBoundaries: {
  mustNotChange: string[],
  mustNotAffect: string[],
  integrationPoints: string[]
},

// Quality Assurance
acceptanceCriteria: string[],
validationSteps: string[],
testingRequirements: string[],
documentationRequirements: string[],
rollbackPlan: string[],

// Effort Estimation
estimatedEffort: {
  hours: 1-40,
  complexity: 'simple'|'medium'|'complex'|'expert',
  confidence: 'low'|'medium'|'high'
},

// Risk Management
blockers: string[],
risks: string[],
prerequisites: string[]
```

## Agent Types

| Agent | Role | Specialties | Preferred Tasks |
|-------|------|-----------|-----------------|
| **backend-specialist** (Alex) | API & Backend Dev | APIs, Databases, Architecture | implementation, api-dev |
| **frontend-specialist** (Sam) | Frontend & UI | Components, Design, UX | ui-dev, styling |
| **review-specialist** (Casey) | Code Quality | Reviews, Security, QA | review, security |
| **testing-specialist** (Taylor) | Test Automation | Unit, Integration, E2E | testing, test-automation |
| **devops-specialist** (Jordan) | Infrastructure | Deployment, Monitoring, IaC | deployment, ci-cd |
| **documentation-specialist** (Morgan) | Technical Writing | Docs, API Guides, Content | documentation |

## Task Types with Custom Guidelines

- `implementation` - Feature development
- `backend-implementation` - Server-side APIs
- `frontend-implementation` - UI components
- `review` - Code quality and security
- `testing` - Test development
- `refactoring` - Code improvement
- `bugfix` - Defect fixes
- `documentation` - Technical writing
- `devops` - Infrastructure

## Valid Projects

```
claude-workers
dev-monitor
job-finder-FE
job-finder-BE
job-finder-shared-types
job-finder-worker
docs
scripts
infrastructure
```

## Generated Prompt Sections

1. **Task Assignment Header** - Agent, ID, Type, Repo, Environment
2. **Task Description** - Full task details
3. **Required Reading** - Project-specific architecture docs
4. **Acceptance Criteria** - Checkboxes for completion
5. **Context Boundaries** - DO NOT VIOLATE section
6. **Technical Context** - Files, dependencies, notes
7. **Blockers & Risks** - Known issues
8. **Prerequisites** - Setup requirements
9. **Type-Specific Guidelines** - Custom for task type
10. **5-Step Development Workflow** - Step-by-step instructions
11. **Testing Requirements** - 80% coverage minimum
12. **Documentation Requirements** - Docs to update
13. **Validation Steps** - How to verify completion
14. **Rollback Plan** - Recovery procedure
15. **Final Success Checklist** - 20+ verification items

## Critical Rules (In Template)

```
NEVER:
❌ Use --no-verify flag
❌ Skip linting or tests
❌ Commit without unit tests
❌ Skip test coverage requirements

ALWAYS:
✅ Fix all linter errors
✅ Ensure all tests pass
✅ Write unit tests for new functions
✅ Meet minimum 80% test coverage
✅ Resolve merge conflicts
```

## Pre-Task Validation Rules

| Field | Min | Max | Error/Warning |
|-------|-----|-----|---------------|
| Title | 10 | 100 | Error / Warning |
| Description | 50 | 1000 | Error / Warning |
| Acceptance Criteria | 3 | 10 | Error / Warning |
| Effort Hours | 1 | 40 | Error / Warning |
| Criteria (type-specific) | 3-5 | - | Error |

## Scope Control Systems

### ScopeCreepDetector
Detects patterns in task output:
- `fileCreation` - NEW files created (HIGH severity)
- `scopeExpansion` - "Also, Additionally, etc" language (HIGH)
- `overEngineering` - Complex/sophisticated patterns (MEDIUM)
- `unnecessaryComplexity` - Design patterns, frameworks (MEDIUM)
- `featureCreep` - Features beyond scope (LOW)

### ContextIsolation
When scope violations detected:
1. Mark context as contaminated
2. Force minimal scope on next work
3. Restrict to existing files only

### SnowballPrevention
Monitors violation chains:
- Tracks violations per task
- Triggers emergency recovery if 3+ violations in sequence

### Forbidden Actions (Cleanup Tasks)
```
LINTING (5 changes max, 20 lines max)
- forbidden: ['create-new-files']
- allowed: ['fix', 'format', 'style']

DEEP CLEANUP (15 changes max, 100 lines max)
- forbidden: ['create-new-files']
- allowed: ['remove', 'optimize', 'clean']

EMERGENCY RECOVERY (1 change max)
- forbidden: ['create-new-files', 'add-dependencies', 'modify-existing-code']
```

## Critical Gaps (Not Automated)

1. **Acceptance Criteria Verification** - No automated check that criteria were met
2. **Test Coverage Verification** - No parsing of coverage reports
3. **Scope Boundary Enforcement** - Pattern-based detection only (not foolproof)
4. **Code Quality Verification** - No parsing of lint/test results
5. **Documentation Verification** - No check that docs were updated
6. **Security Verification** - No automated security scanning
7. **Error Handling Verification** - No static analysis for errors
8. **Rollback Plan Testing** - No pre-verification of rollback viability

## API Endpoints for Task Management

```
POST /claude-workers/tasks
  - Create basic task
  - Required: type, title, documentation, acceptanceCriteria

POST /claude-workers/tasks/enhanced
  - Create enhanced task with full validation
  - Runs TaskCreationGuidelinesManager validation

POST /claude-workers/validate
  - Validate task data before submission
  - Returns: errors, warnings, suggestions

GET /claude-workers/guidelines
  - Get all guidelines by task type

GET /claude-workers/guidelines/:taskType
  - Get specific type guidelines

GET /claude-workers/agents
  - List all agent personalities

GET /claude-workers/agents/valid
  - List valid agent IDs

GET /claude-workers/projects
  - List valid projects

GET /claude-workers/tasks
  - Get all tasks

GET /claude-workers/tasks/completed
  - Get completed tasks
```

## Validation Example

```javascript
const validation = guidelinesManager.validateTaskData({
  type: 'implementation',
  title: 'Add user authentication',  // 24 chars - OK
  description: 'Implement OAuth2 with JWT tokens for secure API access',  // OK
  acceptanceCriteria: [
    'OAuth2 endpoint implemented',
    'JWT token generation working',
    'Security tests passing'
  ],  // 3 items - OK
  project: 'job-finder-BE'  // Valid project - OK
}, 'implementation');

// Returns:
{
  isValid: true,
  errors: [],
  warnings: [],
  suggestions: [
    'Consider adding prerequisites to help with task setup',
    'Consider adding a rollback plan for complex changes'
  ]
}
```

## Testing Requirements (From Template)

### Mandatory Test Coverage
- **Minimum:** 80% code coverage
- **Critical Paths:** 100% coverage for business logic/APIs
- **Edge Cases:** All error conditions and boundary values

### Test Types Required
1. **Unit Tests** - All new functions/methods
2. **Integration Tests** - All APIs and workflows
3. **Regression Tests** - All bug fixes
4. **E2E Tests** - Complete processes

### Test Quality
- Descriptive test names
- Single responsibility per test
- Independent (no dependencies between tests)
- Fast (< 100ms per unit test)
- Reliable (deterministic, not flaky)

## Task Type Checklist Items

Each task type includes 4-8 custom checklist items:

**Implementation**: Architecture patterns, error handling, validation, security
**Backend API**: REST conventions, auth, validation, HTTP codes, queries, error format
**Frontend UI**: Responsive design, accessibility (WCAG), design system, loading/error states
**Review**: All issues documented, security flagged, coverage evaluated, constructive feedback
**Testing**: Coverage >= 90%, deterministic, maintainable, fast execution
**Refactoring**: Tests pass, no behavior change, maintainable, complexity reduced, docs updated
**Bug Fix**: Root cause identified, regression test added, no new bugs, documented
**Documentation**: Accurate, examples tested, clear writing, navigable
**DevOps**: IaC versioned, staging tested, monitoring configured, security followed

## Summary

The Claude Workers task prompt generation system is a sophisticated, multi-layered architecture with:

**Strengths:**
- Universal template ensures consistency
- 6 specialized agent personalities
- Comprehensive pre-task validation
- Scope creep detection and prevention
- Type-specific custom guidelines
- Extensive testing requirements (80% minimum)
- Clear workflow instructions

**Weaknesses:**
- No post-completion verification (critical gap)
- No test coverage report parsing
- Pattern-based scope detection (imperfect)
- No security scanning integration
- Limited enforcement of forbidden actions

**Files to Review:**
1. `/dev-monitor/backend/src/services/taskPromptTemplates.ts` - Core template
2. `/dev-monitor/backend/src/services/taskCreationGuidelines.ts` - Validation rules
3. `/dev-monitor/backend/src/services/agentPersonalities.ts` - Agent definitions
4. `/dev-monitor/backend/src/services/taskTypeGuidelines.ts` - Type guidelines
5. `/dev-monitor/backend/src/services/claudeWorkersManager.ts` - Orchestration

See `CLAUDE_WORKERS_ANALYSIS.md` for comprehensive 1500+ line analysis.
