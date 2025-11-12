# DEV_BOT_SAFETY_AND_PROMPT_IMPROVEMENTS Technical Design

**Source Plan:** docs/plans/DEV_BOT_SAFETY_AND_PROMPT_IMPROVEMENTS.md
**Status:** Planning
**Outstanding Focus:** Ship safety gate + prompt linting work.

## Objectives
- Ship safety gate + prompt linting work.

## Plan Snapshot

# Dev-Bot Safety Mechanisms & Prompt Improvements

**Status**: Planning
**Priority**: Critical
**Created**: 2025-11-06
**Owner**: Backend Team

## Executive Summary

Analysis of task `task-2-1762414973543` revealed two critical issues:
1. **Bot misinterpreted the task** - wrote tests instead of implementation
2. **Changes were lost** - bot made 3,694 line changes but didn't commit to staging

This plan addresses both issues with improved prompts and automatic safety mechanisms.

## Problem Analysis

### Issue 1: Task Misinterpretation

**Task Given:**
```
Title: "Add task quality validation warnings"
Documentation: "Step-by-step instructions:
1. Read the validation recommendations in docs/plans/BOT_EXECUTION_IMPROVEMENTS.md lines 67-106
2. Open src/routes/dev-bots.routes.ts and locate the POST /tasks endpoint
3. Add validation checks AFTER the agent validation block (after line 172)
4. Implement warnings for: (a) missing files array on technical tasks, (b) missing/short description, (c) vague acceptance criteria
5. Use logger.warn() with structured logging (category, action, message, taskId)
6. Test with sample tasks to verify warnings appear in logs but tasks still get created"
```

**What Bot Did:**
- ✅ Read the plan document
- ❌ Did NOT implement validation warnings in `dev-bots.routes.ts`
- ✅ Created comprehensive unit tests in `dev-bots.routes.test.ts` (685 lines)
- ❌ Misunderstood step 6 "Test with sample tasks" as "Write tests"

**Root Cause:**
- Ambiguous instruction #6: "Test with sample tasks" could mean either:
  - (Intended) "Manually test by creating sample tasks via API"


## Requirements
- Refer to the source plan for full requirement breakdown; key deliverables must satisfy the outstanding focus above.

## Architecture Considerations
- Define system boundaries, data flows, and integrations described in the plan.
- Ensure compatibility with the updated master design intent.

## Implementation Steps
1. Review the source plan sections relevant to this feature.
2. Break work into milestones (schema, services, UI, telemetry, etc.).
3. Update dev-monitor visibility and automation hooks as needed.
4. Add automated tests per subsystem.

## Open Questions
- Identify unresolved decisions noted in the plan.
- Capture new questions discovered during implementation.

## Next Actions
- Schedule design review with architecture owners.
- Flesh out detailed sub-designs (schema, API, UI) as required.
- Create execution tickets once this design is ratified.
