# Dev-Bots System Planning Documentation

This directory contains the consolidated planning and roadmap documentation for the dev-bots system.

## Primary Documents

### [CONSOLIDATED_ROADMAP.md](./CONSOLIDATED_ROADMAP.md)
**Status**: Active - This is the single source of truth for all planned improvements
**Created**: 2025-11-07
**Purpose**: Consolidates all planned features and improvements into a prioritized action plan

This document supersedes all previous planning documents and provides:
- Current system architecture overview
- Prioritized improvement roadmap
- Implementation timeline
- Success metrics and criteria
- Risk mitigation strategies

### [BOT_EXECUTION_IMPROVEMENTS.md](./BOT_EXECUTION_IMPROVEMENTS.md)
**Status**: Reference Only - Details incorporated into consolidated roadmap
**Focus**: Task prompt quality improvements and validation

Key insights from analysis:
- Task prompt quality is the bottleneck (not container execution)
- Agent validation has been implemented
- Need for step-by-step instructions and file context
- Target: Improve success rate from ~60% to >90%

## Related Documentation

### [../FAILURE_RECOVERY_SYSTEM.md](../FAILURE_RECOVERY_SYSTEM.md)
Technical documentation for the simplified two-stage failure recovery system:
- 343 lines (64% reduction from previous implementation)
- Event-driven architecture (no polling)
- Cleanup → Followup pattern

### [../../migrations/README.md](../../migrations/README.md)
Database migration documentation and procedures

### [../../TEST_CHECKLIST.md](../../TEST_CHECKLIST.md)
Comprehensive testing checklist for unit and integration tests

## Quick Reference

### Current Priorities (Nov 2025)
1. **System Stabilization** - Get dev-bots running consistently
2. **Bot Execution Quality** - Improve success rate to >90%
3. **Failure Recovery** - Monitor and optimize recovery system
4. **Database Performance** - Complete missing migrations

### Key Metrics to Track
- Task success rate (target: >90%)
- First-attempt success rate (target: >80%)
- Recovery success rate (target: >70%)
- Test coverage (target: >80%)

### Next Actions
1. Test agent validation with real tasks
2. Add PR tracking database columns (migration 006)
3. Build PromptEnhancer service
4. Monitor bot execution stability

## Navigation

All planning and feature documentation should reference the [CONSOLIDATED_ROADMAP.md](./CONSOLIDATED_ROADMAP.md) as the authoritative source. Individual feature documents may contain additional technical details but should align with the roadmap priorities.