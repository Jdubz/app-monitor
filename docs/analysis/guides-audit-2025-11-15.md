# Guides Audit - 2025-11-15

**Purpose:** Systematic review of all /guides/ docs for consolidation/deletion per DOCUMENTATION_SYSTEM.md

## Audit Criteria

Per DOCUMENTATION_SYSTEM.md, guides must:
1. Be **actionable** - Workflow with clear steps
2. Be **current** - Accurate and up-to-date
3. Be **referenced** - Used by developers or agents
4. No duplicates - Consolidated information

## Files to DELETE (9 files)

### 1. CLOUDFLARE_TUNNEL.md (216 lines)
**Reason:** Obsolete - We use nginx reverse proxy, not Cloudflare Tunnel
**Action:** DELETE
**Evidence:** No references in codebase, infrastructure is nginx-based

### 2. GOOGLE_CLOUD_LOGGING_PERMISSIONS.md (89 lines)
**Reason:** Obsolete - We don't use Google Cloud Logging
**Action:** DELETE  
**Evidence:** No cloud logging service in backend/src/services/

### 3. structured-logging.md (46 lines)
**Reason:** Obsolete - Local file watching no longer used
**Action:** DELETE
**Evidence:** Superseded by observability/logger.ts system

### 4. worker-onboarding.md (189 lines)
**Reason:** Obsolete - "Claude Worker" naming outdated, content superseded
**Action:** DELETE
**Evidence:** Setup info is in setup/ENVIRONMENT_SETUP.md

### 5. failure-recovery-quick-start.md (333 lines)
**Reason:** Implementation details, not operational guide
**Action:** DELETE
**Evidence:** These are code patterns, not a workflow guide

### 6. task-execution-template.md (165 lines)
**Reason:** Duplicates content in task-examples.md
**Action:** DELETE (merge unique content into task-examples.md)

### 7. deploy-agent-integration.md (248 lines)
**Reason:** Implementation detail, not operational guide
**Action:** DELETE (code example, not workflow)

### 8. docker-optimization.md (562 lines)
**Reason:** Implementation notes, superseded by actual Dockerfile
**Action:** DELETE (Docker config is in code, not docs)

### 9. e2e-testing-guide.md (327 lines)
**Reason:** Operational info is in CONTRIBUTING.md and package.json
**Action:** DELETE (tests are self-documenting via npm scripts)

## Files to CONSOLIDATE (3 files)

### 10-12. API Docs → Consolidate into ONE file
- API_AUTHENTICATION.md (167 lines)
- api-error-responses.md (254 lines)  
- api-reference.md (422 lines)

**Action:** Merge into single `api-reference.md` with 3 sections
**Result:** 1 file (~500 lines) instead of 3 files (843 lines)

## Files to KEEP & UPDATE (9 files)

### 13. DOCUMENTATION_SYSTEM.md ✅
**Status:** Keep - Master documentation guide
**Action:** None

### 14. PRODUCTION_DEPLOYMENT.md ✅
**Status:** Keep - Critical operational workflow
**Action:** None (recently updated)

### 15. MINIMAL_TASK_SUBMISSION_GUIDE.md ✅
**Status:** Keep - Core workflow for task submission
**Action:** None (recently updated)

### 16. agent-personalities.md ✅
**Status:** Keep - Agent behavior reference
**Update:** Remove "Claude Workers" branding → "Dev-Bots"

### 17. task-examples.md ✅  
**Status:** Keep - Practical examples for task creation
**Update:** Merge unique content from task-execution-template.md

### 18. FRONTEND_DEVELOPMENT.md ✅
**Status:** Keep - Developer workflow guide
**Update:** Review for accuracy

### 19. GITHUB_WEBHOOKS.md ✅
**Status:** Keep - Webhook integration guide
**Update:** Verify endpoints are current

### 20. component-style-guide.md ✅
**Status:** Keep - Frontend development standards
**Update:** Verify against current component patterns

### 21. deployment-protection-system.md ✅
**Status:** Keep - Deployment safety workflow
**Action:** None (recently updated)

## Summary

**Current:** 24 files (6,795 lines total)
**After cleanup:** 10 files (~3,500 lines estimated)

**Delete:** 9 files (2,827 lines)
**Consolidate:** 3 → 1 file (save 343 lines)
**Keep:** 9 files  
**Update:** 3 files

**Space savings:** ~50% reduction in documentation

## Execution Plan

1. Delete obsolete files (9 files)
2. Consolidate API docs (3 → 1)
3. Update terminology in agent-personalities.md
4. Merge content into task-examples.md
5. Update README.md to reflect new structure
6. Commit with message explaining cleanup
