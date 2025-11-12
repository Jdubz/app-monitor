# PR Condition State Refactoring Plan

**Date**: 2025-11-12  
**Status**: In Progress  
**Priority**: P1 - High Value

---

## Overview

Refactor `prConditionState.service.ts` (1,922 lines) into modular evaluator pattern.

**Current**: Monolithic file with all evaluation logic  
**Target**: Modular architecture with 8 specialized evaluators + orchestrator

---

## Architecture

```
backend/src/services/prConditions/
├── types.ts                            # Shared types (✅ Created)
├── utils.ts                            # Shared utilities (✅ Created)
├── evaluators/
│   ├── baseEvaluator.ts                # Abstract base class (✅ Created)
│   ├── ciChecksEvaluator.ts            # CI checks (✅ Created - 97 lines)
│   ├── commentsEvaluator.ts            # Comment resolution (🔄 Next)
│   ├── conflictsEvaluator.ts           # Merge conflicts
│   ├── branchUpdateEvaluator.ts        # Branch freshness
│   ├── changeRequestsEvaluator.ts      # Review change requests
│   ├── taskVerificationEvaluator.ts    # Task verification
│   ├── copilotReviewEvaluator.ts       # Copilot review
│   └── finalValidationEvaluator.ts     # Final validation
├── validators/
│   └── prStateValidator.ts             # State validation logic
└── index.ts                             # Main orchestrator service

```

---

## Evaluator Extraction Status

### ✅ Completed
1. **Base Infrastructure**
   - types.ts (104 lines) - All shared types
   - utils.ts (24 lines) - Fingerprint generation
   - baseEvaluator.ts (67 lines) - Abstract base class

2. **CIChecksEvaluator** (97 lines)
   - Lines: 473-546 from original
   - Status: Fully extracted ✅

### 🔄 In Progress
3. **CommentsEvaluator** 
   - Lines: 552-625 (74 lines)
   - Logic: hasUnresolvedComments, filter nitpicks
   
4. **ConflictsEvaluator**
   - Lines: 630-684 (52 lines)
   - Logic: Check mergeable state

5. **BranchUpdateEvaluator**
   - Lines: 686-742 (56 lines)
   - Logic: Behind by X commits

6. **ChangeRequestsEvaluator**
   - Lines: 746-811 (65 lines)
   - Logic: Active change requests from reviews

7. **TaskVerificationEvaluator**
   - Lines: 816-879 (63 lines)
   - Logic: Task verification_passed status

8. **CopilotReviewEvaluator**
   - Lines: 883-976 (92 lines)
   - Logic: Copilot review completion

9. **FinalValidationEvaluator**
   - Lines: 980-1055 (76 lines)
   - Logic: Final validation score >= 80

---

## Implementation Phases

### Phase 1: Core Evaluators (2-3 hours) ✅ 20% Done
- ✅ Create base infrastructure
- ✅ Extract CIChecksEvaluator
- 🔄 Extract CommentsEvaluator
- 🔄 Extract ConflictsEvaluator
- 🔄 Extract BranchUpdateEvaluator

### Phase 2: Advanced Evaluators (2-3 hours)
- Extract ChangeRequestsEvaluator
- Extract TaskVerificationEvaluator
- Extract CopilotReviewEvaluator
- Extract FinalValidationEvaluator

### Phase 3: Orchestrator (2-3 hours)
- Create main PRConditionStateService as orchestrator
- Wire up all evaluators
- Implement delegation pattern
- Maintain backward compatibility

### Phase 4: Testing & Migration (1-2 hours)
- Update imports across codebase
- Run all tests
- Verify no regressions
- Update documentation

---

## Evaluator Patterns

### Standard Evaluator Structure
```typescript
export class XyzEvaluator extends BaseEvaluator {
  getConditionId(): string {
    return 'condition_id';
  }

  async evaluate(
    prNumber: number,
    prStatus?: PRStatus,
    state?: PRConditionState
  ): Promise<ConditionEvaluation> {
    try {
      // 1. Fetch data (reuse prStatus if provided)
      // 2. Check condition
      // 3. Return met/unmet with fingerprint
      // 4. Include blocking issues (references only)
    } catch (error) {
      // Return not_ready on error
    }
  }
}
```

### Orchestrator Pattern
```typescript
export class PRConditionStateService {
  private evaluators: Map<string, BaseEvaluator>;
  
  constructor(taskQueue: TaskQueueService) {
    // Initialize evaluators
    this.evaluators = new Map([
      ['ci_checks_passing', new CIChecksEvaluator(github, taskQueue)],
      ['comments_resolved', new CommentsEvaluator(github, taskQueue)],
      // ... etc
    ]);
  }
  
  async evaluateConditions(prNumber: number): Promise<PRConditionState> {
    // Delegate to evaluators
    const prStatus = await this.github.getPRStatus(prNumber);
    
    for (const [id, evaluator] of this.evaluators) {
      const result = await evaluator.evaluate(prNumber, prStatus, state);
      // Update state
    }
  }
}
```

---

## Benefits

### Achieved So Far ✅
- Clear separation of concerns (types, utils, evaluators)
- Consistent evaluation interface
- Reusable base class with common functionality
- Type safety maintained

### Expected After Full Refactoring
- 9 files averaging ~80 lines each (vs 1 file with 1,922 lines)
- Each evaluator independently testable
- Easier to add new conditions
- Clearer logic per condition
- Better IDE performance
- Parallel development possible

---

## Migration Strategy

### Backward Compatibility
- Keep PRConditionStateService name
- Maintain public API unchanged
- Export all types from index.ts
- Re-export from main service file

### Import Updates Needed
```typescript
// Before
import { PRConditionStateService, type ConditionState } from './prConditionState.service.js';

// After (same - backward compatible)
import { PRConditionStateService, type ConditionState } from './prConditionState.service.js';

// Or direct access to new structure
import { CIChecksEvaluator } from './prConditions/evaluators/ciChecksEvaluator.js';
import type { ConditionState } from './prConditions/types.js';
```

---

## Testing Strategy

1. **Unit Tests**: Each evaluator can be tested in isolation
2. **Integration Tests**: Orchestrator coordinates all evaluators
3. **Regression Tests**: Existing tests should pass unchanged
4. **Performance Tests**: No performance degradation expected

---

## Next Steps

1. ✅ Create base infrastructure (types, utils, base class)
2. ✅ Extract CIChecksEvaluator  
3. 🔄 Extract remaining 7 evaluators (in progress)
4. Create orchestrator with delegation
5. Update imports and test
6. Update documentation

---

## Estimated Time

- **Phase 1**: 2-3 hours (20% complete)
- **Phase 2**: 2-3 hours  
- **Phase 3**: 2-3 hours
- **Phase 4**: 1-2 hours
- **Total**: 7-11 hours (1-2 days)
- **Completed**: ~1 hour so far

---

## Success Criteria

- ✅ Base infrastructure created
- ✅ First evaluator extracted and working
- 🔄 8 evaluators total (~80 lines each)
- 🔄 Main orchestrator (~300 lines)
- 🔄 All tests passing
- 🔄 No breaking changes
- 🔄 Documentation updated
