# Obsolete Documentation Archive (2025-11-14)

This directory contains documentation that has been superseded by implemented features or newer architectural decisions.

## Archived Documents

### BOT_PROMPT_ENGINEERING_V3.md
- **Archived:** 2025-11-14
- **Reason:** Superseded by context management system
- **Replacement:** Context-aware task submission with auto-generated prompts (see `docs/technicalDesigns/dev-bot-context-management.md`)
- **Status:** Manual v3 template authoring is obsolete. Context system auto-generates investigation steps, constraints, and checklists from mounted context bundles.
- **Migration Path:** 
  - Phase 1 of context management is COMPLETE (2400+ lines implemented)
  - Phases 2-7 remain: Minimal task submission API, auto-detection, container mounting, prompt generation
  - When complete: All v3 template validation code will be deleted
  - Task submission reduces from 15+ fields to 3: title, type, intent

## Why These Were Archived

The v3 prompt engineering approach required humans to manually author:
- Investigation steps
- Constraints (MUST/MUST NOT)
- doNotCreate lists
- Pre-implementation checklists
- 15+ template fields

The context management system makes this obsolete by:
- Auto-detecting files from git diff
- Auto-generating investigation steps from context bundles
- Auto-injecting constraints from recipe definitions
- Mounting read-only context in containers
- Requiring only 3 fields: title, type, intent

## Implementation Status

- ✅ Context infrastructure (ContextCache, ContextRecipeLoader, ContextBundleGenerator, etc.)
- ⏳ Context recipes (config/context-recipes/*.yaml) - NOT YET CREATED
- ⏳ Minimal task submission API - NOT YET IMPLEMENTED
- ⏳ Auto-detection logic - NOT YET IMPLEMENTED
- ⏳ Container context mounting - NOT YET IMPLEMENTED
- ⏳ Prompt auto-generation - NOT YET IMPLEMENTED

Until context management Phases 2-7 complete, current task creation still uses SimpleTaskData/EnhancedTaskData schema.
