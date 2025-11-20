# Task Submission Guide

**Version:** 1.0  
**Date:** 2025-11-14  
**Status:** Production Ready

## Overview

As of November 2025, app-monitor supports **ultra-simplified task submission** requiring only 3 fields:
- `title` - What you want done
- `taskType` - implementation | fix | review | pr-follow-up | analysis
- `intent` - Why and what should be accomplished

The system automatically detects files, risk level, and context profiles, then generates complete prompts with investigation steps, constraints, and checklists from context bundles.

## API Endpoint

```
POST /api/dev-bots/tasks
Content-Type: application/json
```

## Required Fields (3 Only)

```json
{
  "title": "Add validation to user registration form",
  "taskType": "implementation",
  "intent": "Prevent duplicate email registrations by adding unique constraint"
}
```

## Optional Overrides

Use these ONLY if auto-detection fails or you want explicit control:

```json
{
  "title": "Fix memory leak in log rotation",
  "taskType": "fix",
  "intent": "Prevent OOM errors by implementing proper log cleanup",
  
  // Optional overrides (auto-detected if omitted)
  "targetFiles": ["backend/src/services/logging.service.ts"],
  "riskLevel": "medium",  // minimal | low | medium | high
  "contextProfiles": ["implementation-patterns", "fix-debugging"],
  "desiredOutputs": ["patch", "verification-log", "unit-tests"],
  "priority": 5,
  "assignedAgent": "claude-sonnet"
}
```

## Auto-Detection Details

### File Detection
Files are auto-detected from git status:
- Staged files (`git diff --cached --name-only`)
- Modified files (`git diff --name-only`)
- Newly created files (`git ls-files --others --exclude-standard`)

If no files detected, you can specify `targetFiles` manually or the system will infer from `intent`.

### Risk Level Inference

Risk is inferred from file paths:

| Pattern | Risk Level |
|---------|------------|
| `docker/`, `migrations/`, secrets/credentials | **high** |
| `backend/src/services/`, `database/`, `schema` | **medium** |
| `frontend/src/components/`, tests | **low** |
| `docs/`, README files | **minimal** |

### Context Profile Selection

Context profiles are auto-selected based on `taskType` + `targetFiles`:

| Task Type | Default Profiles |
|-----------|------------------|
| implementation | scope-control, dev-monitor, implementation-patterns |
| fix | scope-control, fix-debugging, failure-recovery |
| review | review-checklist, pr-workflow |
| pr-follow-up | pr-workflow, dev-monitor |
| analysis | dev-monitor, implementation-patterns |

Additional profiles added based on file paths:
- `frontend/*` → adds frontend-specific context
- `backend/src/services/pr*` → adds pr-workflow context
- `docker/*`, `scripts/deploy*` → adds deployment context

### Default Outputs

| Task Type | Auto-Generated Outputs |
|-----------|------------------------|
| implementation | unit-tests, integration-tests, documentation |
| fix | patch, verification-log, root-cause-analysis |
| review | review-report, action-recommendation |
| pr-follow-up | merge-status, gate-evaluation, blocker-resolution |
| analysis | findings-report, recommendations, metrics |

## Examples

### Example 1: Simple Implementation
```json
{
  "title": "Add auto-scroll toggle to logs viewer",
  "taskType": "implementation",
  "intent": "Allow users to pause auto-scroll while reviewing older logs"
}
```

**Auto-Detection Result:**
- Files: `frontend/src/components/EnhancedLogsViewer.tsx` (from git status)
- Risk: low (frontend component)
- Profiles: scope-control, dev-monitor, implementation-patterns
- Outputs: unit-tests, integration-tests, documentation

### Example 2: Bug Fix
```json
{
  "title": "Fix task queue deadlock on database lock",
  "taskType": "fix",
  "intent": "Prevent task queue from hanging when SQLite database is locked"
}
```

**Auto-Detection Result:**
- Files: `backend/src/services/taskQueue.sqlite.ts` (from git status)
- Risk: high (database/concurrency issue)
- Profiles: scope-control, fix-debugging, failure-recovery
- Outputs: patch, verification-log, root-cause-analysis

### Example 3: Review Task (Manual Override)
```json
{
  "title": "REVIEW: Authentication refactoring PR",
  "taskType": "review",
  "intent": "Verify auth changes don't introduce security issues",
  "targetFiles": [
    "backend/src/services/auth.service.ts",
    "backend/src/middleware/authenticate.ts"
  ],
  "riskLevel": "high"
}
```

**Why Override:**
- Security review requires explicit file list
- Risk level raised from auto-detected "medium" to "high"

## What Happens Automatically

Once you submit a task, the system:

1. **Auto-Detects** missing fields (files, risk, profiles, outputs)
2. **Generates Context Bundle** from YAML recipes (cached by git hash)
3. **Copies Context** to container at `/workspace/context/`
4. **Assembles Prompt** with investigation steps, constraints, checklists
5. **Launches Container** with context files available
6. **Tracks Execution** with metadata for debugging

## Context Files Available to Bots

Bots receive these files in `/workspace/context/`:

```
/workspace/context/
├── scope-control.md        # Boundaries, forbidden operations
├── dev-monitor.md          # App-monitor specific patterns
├── pr-workflow.md          # Git/PR workflows
├── failure-recovery.md     # Error handling patterns
├── deployment.md           # Deployment guidelines
├── implementation-patterns.md  # Code patterns and best practices
├── review-checklist.md     # Code review checklist
└── fix-debugging.md        # Debugging and fix patterns
```

Each file includes:
- Constraints (what NOT to do)
- Investigation steps (how to start)
- Best practices (patterns to follow)
- Examples (concrete guidance)

## Migrating from V3 Templates

**Old Way (15+ fields, manual authoring):**
```json
{
  "type": "implementation",
  "title": "Add validation",
  "description": "Long description...",
  "documentation": "READ this, READ that...",
  "investigation": {
    "required": true,
    "steps": ["Step 1", "Step 2", ...],
    "mustFind": [...],
    "mustNotDuplicate": [...]
  },
  "preImplementationChecklist": [...],
  "acceptanceCriteria": [...],
  "files": [...],
  "modifyOnly": [...],
  "doNotModify": [...],
  "doNotCreate": [...],
  "constraints": {...},
  "gitWorkflow": {...},
  "estimatedEffort": {...},
  "metadata": {...},
  "architectureReferences": [...]
}
```

**New Way (3 fields, auto-generated):**
```json
{
  "title": "Add validation",
  "taskType": "implementation",
  "intent": "Prevent duplicate email registrations"
}
```

**Everything else is auto-generated from context bundles.**

## Troubleshooting

### Auto-Detection Warnings

If confidence is low (<0.7), you'll get warnings:
```json
{
  "warnings": [
    "No files detected - risk level defaulted to low. Consider specifying targetFiles.",
    "Large file count (53) - consider narrowing scope"
  ]
}
```

**Solution:** Provide manual overrides for low-confidence fields.

### Context Bundle Generation Failures

If context bundle fails to generate, task proceeds without context (degraded mode).
Check logs for:
```
category: 'context'
action: 'context_bundle_generation_failed'
```

**Solution:** Verify YAML recipes are valid and accessible.

### High Cache Miss Rate

If cache hit rate <80%, context regeneration is expensive.
Check logs for:
```
category: 'context'
action: 'cache_miss'
```

**Solution:** Verify git hash detection is working correctly.

## Related Documentation

- **Technical Design:** `docs/technicalDesigns/dev-bot-context-management.md`
- **API Reference:** `docs/guides/API_REFERENCE.md`
- **Context Recipes:** `backend/config/context-recipes/*.yaml`

## CLI Usage

```bash
# Using Node.js script (recommended)
node scripts/submit-task.js \
  --title "Fix timeout issue" \
  --type fix \
  --intent "Increase connection timeout from 5s to 30s"

# Using curl (for automation)
curl -X POST http://localhost:5000/api/dev-bots/tasks \
  -H "Content-Type: application/json" \
  -d @task.json
```

## FAQ

**Q: Can I still use the old V3 template format?**  
A: No. The legacy endpoint has been removed; `/api/dev-bots/tasks` is the single submission path.

**Q: How accurate is auto-detection?**  
A: >90% accuracy measured in testing. Low-confidence detections include warnings.

**Q: Can I preview the auto-detected fields before submitting?**  
A: No. Tasks must be submitted to view detection results; use overrides if you need precise control.

**Q: What if auto-detection is wrong?**  
A: Provide manual overrides via optional fields (`targetFiles`, `riskLevel`, `contextProfiles`).

**Q: Where do context bundles come from?**  
A: Generated from YAML recipes in `backend/config/context-recipes/`, cached by git hash for performance.

**Q: Can I add custom context recipes?**  
A: Yes! Add new `.yaml` files to `backend/config/context-recipes/` following the schema defined in `backend/config/context-recipes/schema.json`.

## Future Enhancements

- Frontend form component (in progress)
- Context bundle analytics dashboard
- Custom recipe management UI
- Auto-detection confidence tuning
- Chain-aware context inheritance (REVIEW/FIX tasks)

---

**Last Updated:** 2025-11-14  
**Status:** Production Ready  
**API Version:** v1
