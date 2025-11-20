# Claude Workers Task Prompt System - START HERE

## What You're Looking At

This is a comprehensive analysis of the Claude Workers task prompt generation system used to create detailed, structured prompts for AI agents assigned to development tasks.

## Documents Available

### 1. START HERE: CLAUDE_WORKERS_QUICK_REFERENCE.md
**Best for:** Quick lookups, field requirements, agent options
- 5-minute read
- Fast reference tables
- API endpoints
- Validation rules
- Code examples

### 2. COMPREHENSIVE: CLAUDE_WORKERS_ANALYSIS.md
**Best for:** Complete understanding of the system
- 1,551 lines
- Full architecture breakdown
- All 6 agent personalities documented
- 10 identified gaps with severity
- 13 recommendations by priority
- Implementation checklist

### 3. NAVIGATION: CLAUDE_WORKERS_ANALYSIS_INDEX.md
**Best for:** Finding information, understanding document structure
- Document overview
- Key findings summary
- How to use documents
- File references
- Summary statistics

## Quick Facts

System Size: 3,267+ lines of code across 5 core files
Agent Personalities: 6 specialized agents
Task Types: 8+ with custom guidelines
Validation Rules: 20+
Scope Control Systems: 4 layers
Critical Gaps: 10 (3 are critical priority)

## What This System Does

The Claude Workers system generates comprehensive task prompts that include:
- Task overview and acceptance criteria
- Required reading with project-specific docs
- 5-step development workflow
- Testing requirements (80% coverage minimum)
- Scope boundaries to enforce
- Risk identification and rollback plans

## Key Findings

### Strengths
✓ Universal template ensures consistency
✓ 6 specialized agent personalities
✓ Strong pre-task validation (20+ rules)
✓ 80% test coverage requirement
✓ Scope creep detection systems
✓ Clear workflow instructions

### Critical Issues
✗ No acceptance criteria verification
✗ No test coverage report parsing
✗ Pattern-based scope detection (not foolproof)
✗ No code quality verification
✗ No security scanning integration

## Most Important Information

### The 5-Step Workflow (In Every Task)
1. **Workspace Setup** - git checkout, git pull
2. **Implementation** - Follow code patterns, write code
3. **Pre-Commit Validation** - lint, test, coverage check (80% min)
4. **Commit and Push** - Use semantic commits
5. **Post-Commit Verification** - Check CI/CD, verify criteria

### Critical Rules (In Every Task)
```
NEVER:
❌ Use --no-verify flag
❌ Skip linting or tests
❌ Commit without unit tests
❌ Skip test coverage

ALWAYS:
✅ Fix all linter errors
✅ Ensure all tests pass
✅ Write unit tests for new code
✅ Meet minimum 80% test coverage
```

### The 6 Agent Personalities
1. **Alex** (Backend Specialist) - APIs, Databases, Architecture
2. **Sam** (Frontend Specialist) - UI, Components, Design
3. **Casey** (Review Specialist) - Code Quality, Security
4. **Taylor** (Testing Specialist) - Test Automation, QA
5. **Jordan** (DevOps Specialist) - Infrastructure, Deployment
6. **Morgan** (Documentation Specialist) - Technical Writing

### Required Task Fields
```
- id: unique identifier
- type: task classification
- title: task title (min 10 chars)
- documentation: required reading
- acceptanceCriteria: what qualifies as complete
- status: pending|assigned|active|completed|failed
- createdAt: ISO timestamp
- assignedAgent: auto-populated agent personality (defaults to 'auto-select' until runtime assignment)
```

### Recommended Task Fields
```
Scope Control (CRITICAL):
- contextBoundaries.mustNotChange: []
- contextBoundaries.mustNotAffect: []
- contextBoundaries.integrationPoints: []

Quality Assurance:
- acceptanceCriteria: string[]
- validationSteps: string[]
- testingRequirements: string[]
- documentationRequirements: string[]
- rollbackPlan: string[]

Effort:
- estimatedEffort.hours: 1-40
- estimatedEffort.complexity: simple|medium|complex|expert
- estimatedEffort.confidence: low|medium|high
```

## Next Steps

### If You Want To...

**Understand the System:**
1. Read CLAUDE_WORKERS_QUICK_REFERENCE.md
2. Read CLAUDE_WORKERS_ANALYSIS.md sections 1-4
3. Review sections 5-6

**Create a Task:**
1. Check quick reference for required fields
2. Review validation rules
3. Look up agent options
4. See examples in main analysis

**Improve the System:**
1. Read main analysis Section 7 (Identified Gaps)
2. Review Section 12 (Recommendations)
3. Start with Priority 1 items
4. Follow implementation checklist

**Understand Scope Control:**
1. Read quick reference scope section
2. Review main analysis Section 6
3. Understand 3-tier control mechanism

## Critical Issues to Know About

### Gap #1: No Acceptance Criteria Verification (CRITICAL)
**Problem:** System states acceptance criteria but doesn't verify they were met
**Impact:** No automated way to confirm task completion
**Solution Needed:** Parse task output, analyze git diffs, flag incomplete criteria

### Gap #2: No Test Coverage Verification (HIGH)
**Problem:** Template requires 80% coverage but doesn't verify it
**Impact:** Coverage might not actually meet 80% threshold
**Solution Needed:** Parse coverage reports, verify >= 80%, remediate

### Gap #3: Pattern-Based Scope Detection (HIGH)
**Problem:** Uses regex patterns only, can be evaded
**Impact:** Scope violations might go undetected
**Solution Needed:** Analyze git diffs, check actual file changes

## File Structure

All files are in: `/home/jdubz/Development/job-finder-app-manager/`

Source code analyzed:
- `/dev-monitor/backend/src/services/taskPromptTemplates.ts`
- `/dev-monitor/backend/src/services/taskCreationGuidelines.ts`
- `/dev-monitor/backend/src/services/agentPersonalities.ts`
- `/dev-monitor/backend/src/services/taskTypeGuidelines.ts`
- `/dev-monitor/backend/src/services/claudeWorkersManager.ts`

## Questions Answered

**Q: How is a task prompt generated?**
A: TaskPromptTemplateManager uses a universal template with 72 variable processors to inject task-specific content

**Q: What are the 6 agents?**
A: Backend, Frontend, Review, Testing, DevOps, and Documentation specialists

**Q: What happens if a task violates scope?**
A: ScopeCreepDetector detects it, ContextIsolation restricts future work, SnowballPrevention triggers emergency recovery

**Q: What's the minimum test coverage?**
A: 80% for all new code, 100% for critical paths, all edge cases covered

**Q: How are tasks validated?**
A: 20+ pre-task rules check title, description, criteria, project, agent, effort

**Q: What are the biggest weaknesses?**
A: No automated verification of acceptance criteria, test coverage, or code quality

## Summary

This is a sophisticated system for managing AI-assisted development work with:
- Clear structure and expectations
- Multiple validation layers
- Scope protection mechanisms
- Quality assurance requirements
- But lacking automated post-completion verification

The system would be significantly improved by implementing the Priority 1 recommendations.

---

Analysis Date: October 23, 2025
Analysis Scope: Complete system review
Documents: 5 total files, 3,236 lines
Files to Review: Start with quick reference, then main analysis

Ready to dive in? Start with CLAUDE_WORKERS_QUICK_REFERENCE.md
