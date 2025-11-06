# Task Decomposition Strategy

## Problem

Large tasks have diminishing execution quality. Dev-bots perform best with small, focused, atomic tasks.

## Principles

### 1. Single Responsibility
Each task should do **one thing well**:
- ✅ "Add saveTaskContext method to database service"
- ❌ "Implement complete context persistence system"

### 2. Vertical Slice
When possible, deliver end-to-end thin slices:
- ✅ "Implement POST /api/tasks/:id/context endpoint with basic save"
- ❌ "Implement all context API endpoints"

### 3. Bounded Scope
Clear, measurable scope with explicit boundaries:
- File count: 1-3 files modified
- LoC delta: < 200 lines
- Time estimate: 1-2 hours max
- Test count: 5-10 tests

### 4. Dependency Chain
Tasks should form a dependency chain where:
- Each task depends on previous completion
- Each task adds incremental value
- System is testable at each step

## Task Size Classification

### Atomic (Ideal for Dev-Bots)
- **Time**: 30min - 1hr
- **Files**: 1-2
- **LoC**: 50-150
- **Examples**:
  - "Add single database method with tests"
  - "Create single API endpoint"
  - "Add validation for one schema field"

### Small (Good for Dev-Bots)
- **Time**: 1-2 hours
- **Files**: 2-4
- **LoC**: 150-300
- **Examples**:
  - "Implement service class with 3 core methods"
  - "Add 2-3 related API endpoints"
  - "Create React component with basic functionality"

### Medium (Risky for Dev-Bots)
- **Time**: 3-4 hours
- **Files**: 4-6
- **LoC**: 300-500
- **Examples**:
  - "Implement full CRUD service"
  - "Add complete API router with 5+ endpoints"
  - "Build complex form with validation"
- **Action**: Break into 2-3 smaller tasks

### Large (Don't Give to Dev-Bots)
- **Time**: 5+ hours
- **Files**: 6+
- **LoC**: 500+
- **Examples**:
  - "Implement complete feature end-to-end"
  - "Refactor entire subsystem"
  - "Migrate major architecture"
- **Action**: Decompose into 5+ atomic/small tasks

## Decomposition Techniques

### Technique 1: Layer by Layer
Break by architectural layer:

**Original**: "Implement user authentication"
**Decomposed**:
1. Add User schema and DB migration
2. Create UserService with auth methods
3. Add auth middleware
4. Implement auth API endpoints
5. Add frontend login form

### Technique 2: Feature Slice
Deliver minimal vertical slice first, then enhance:

**Original**: "Build advanced search"
**Decomposed**:
1. Basic search by title (backend + frontend)
2. Add filter by date range
3. Add filter by category
4. Add sort options
5. Add autocomplete suggestions

### Technique 3: CRUD Operations
Break CRUD into separate tasks:

**Original**: "Implement task context CRUD"
**Decomposed**:
1. Implement saveTaskContext (Create)
2. Implement getTaskContext (Read)
3. Implement updateTaskContext (Update)
4. Implement deleteTaskContext (Delete)
5. Add list/query methods

### Technique 4: Test-Driven Decomposition
Let tests define task boundaries:

**Original**: "Add validation to form"
**Decomposed**:
1. Add required field validation
2. Add email format validation
3. Add password strength validation
4. Add cross-field validation
5. Add async uniqueness validation

## Task Complexity Estimation

### Complexity Factors

**File Coordination** (×1.5 multiplier per dependency):
- How many files need simultaneous changes?
- How many import chains affected?

**Test Coverage** (×1.3 multiplier):
- Unit tests needed?
- Integration tests needed?
- E2E tests needed?

**External Integration** (×2.0 multiplier):
- Database schema changes?
- API contract changes?
- Third-party API calls?

**Domain Understanding** (×1.5 multiplier):
- New domain concepts?
- Complex business logic?
- Unfamiliar libraries?

### Complexity Formula

```
Complexity Score = Base_LoC × File_Multiplier × Test_Multiplier × Integration_Multiplier × Domain_Multiplier
```

**Thresholds**:
- **Simple**: Score < 200
- **Medium**: Score 200-500
- **Complex**: Score 500-1000
- **Expert**: Score > 1000

### Example Calculation

**Task**: "Add saveTaskContext method to database service"
- Base LoC: 50
- Files: 2 (database.ts + test) → ×1.5
- Tests: Unit only → ×1.3
- Integration: DB write → ×2.0
- Domain: Familiar pattern → ×1.0

**Score**: 50 × 1.5 × 1.3 × 2.0 × 1.0 = **195 (Simple)**

## Task Type Classification

### Bug Fix
- **Characteristics**: Known failure, isolated scope
- **Typical Size**: Atomic to Small
- **Confidence**: High (reproducible)

### Enhancement
- **Characteristics**: Extending existing feature
- **Typical Size**: Small to Medium
- **Confidence**: Medium (integration risk)

### New Feature
- **Characteristics**: Greenfield implementation
- **Typical Size**: Medium to Large (needs decomposition)
- **Confidence**: Low (unknown unknowns)

### Refactoring
- **Characteristics**: No behavior change, structural improvement
- **Typical Size**: Small to Medium
- **Confidence**: Medium (test-dependent)

### Infrastructure
- **Characteristics**: Build, deploy, tooling
- **Typical Size**: Atomic to Medium
- **Confidence**: Medium (environment-specific)

## Practical Example: TC-2 & TC-3 Decomposition

### Original (Too Large)
"Implement TC-2 & TC-3: Task Context Persistence Service and API Endpoints"
- **Estimated**: 6 hours
- **Files**: 5-7
- **Type**: New Feature
- **Complexity**: Expert (>1000)

### Decomposed (Right-Sized)

**Chain 1: Database Layer**
1. ✅ **TC-2.1**: Add saveTaskCreationContext to database service (Atomic, 1hr)
2. ✅ **TC-2.2**: Add getTaskCreationContext to database service (Atomic, 30min)
3. ✅ **TC-2.3**: Add saveAutomationRun to database service (Atomic, 1hr)
4. ✅ **TC-2.4**: Add getAutomationRun and listTaskRuns to database service (Small, 1.5hr)

**Chain 2: Service Layer**
5. ✅ **TC-2.5**: Create TaskContextService with context save/retrieve (Small, 2hr)
6. ✅ **TC-2.6**: Add automation run tracking to TaskContextService (Small, 1.5hr)

**Chain 3: API Layer**
7. ✅ **TC-3.1**: Extend POST /api/tasks to accept optional context (Atomic, 1hr)
8. ✅ **TC-3.2**: Add GET /api/tasks/:id/context endpoint (Atomic, 45min)
9. ✅ **TC-3.3**: Add GET /api/tasks/:id/runs endpoint (Atomic, 45min)
10. ✅ **TC-3.4**: Add GET /api/tasks/:id/runs/:runId endpoint (Atomic, 1hr)

**Total**: 10 atomic/small tasks vs 1 large task
**Benefit**: Each task delivers value, testable at each step, easy to retry on failure

## Recommendations

### For Task Creators
1. Start with user story, then decompose
2. Aim for 1-2 hour tasks
3. Ensure each task is independently testable
4. Define clear acceptance criteria (≤ 3 criteria)
5. Limit to 1-3 files per task

### For Dev-Bots
1. Reject tasks estimated > 3 hours
2. Request decomposition for Medium+ complexity
3. Provide decomposition suggestions in failure reports
4. Track success rate by task size for tuning

### For System
1. Build task decomposition into UI/API
2. Provide complexity estimation tool
3. Warn users about large tasks
4. Suggest decomposition based on patterns
5. Track completion rate by task size
