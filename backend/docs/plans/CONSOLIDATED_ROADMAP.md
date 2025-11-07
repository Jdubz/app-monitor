# Dev-Bots System Consolidated Roadmap

**Status**: Active Development
**Priority**: Critical - System Stability
**Last Updated**: 2025-11-07
**Owner**: Backend Team

## Executive Summary

The dev-bots system is an automated task execution platform using ephemeral Docker containers with Claude/Codex CLIs. The system is functional but requires stabilization to run consistently. This roadmap consolidates all planned improvements into a single, prioritized action plan.

## Current System Architecture

### Working Components
- **Ephemeral Container Execution**: Docker containers with Claude/Codex CLIs working perfectly
- **Task Queue Management**: SQLite-based queue with priority and concurrency controls
- **Failure Recovery System**: Simplified two-stage recovery (cleanup → followup)
- **PR Workflow**: Automated PR creation direct to main branch with monitoring
- **CLI Flag Compatibility**: Validation layer preventing incompatible flag combinations

### Problem Areas
1. **Task Quality**: Insufficient information in prompts leading to incomplete implementations
2. **Agent Validation**: Invalid agents accepted causing runtime failures
3. **Documentation**: Scattered and partially outdated
4. **Migration Issues**: Fixed - was re-running on every startup
5. **PR Monitoring**: Schema missing PR tracking columns

## Priority 1: System Stabilization (Current Focus)

### Goal
Get dev-bots running consistently and reliably without manual intervention.

### Tasks

#### 1.1 Task Quality Improvements ✓ Partially Complete
**Status**: Agent validation implemented, needs testing

**Completed**:
- Agent validation in `src/routes/dev-bots.routes.ts:164-172`
- CLI flag validation preventing incompatible combinations

**Remaining**:
- [ ] Add task quality warnings for missing files/description
- [ ] Implement step-by-step instruction templates
- [ ] Create acceptance criteria templates
- [ ] Test with real task executions

#### 1.2 PR Monitoring Schema Fix
**Status**: Identified, needs implementation

**Issue**: Database missing columns: pr_number, pr_url, pr_branch

**Solution**:
```sql
-- Migration 006_pr_tracking.sql
ALTER TABLE tasks ADD COLUMN pr_number INTEGER;
ALTER TABLE tasks ADD COLUMN pr_url TEXT;
ALTER TABLE tasks ADD COLUMN pr_branch TEXT;
CREATE INDEX idx_tasks_pr_number ON tasks(pr_number);
```

#### 1.3 Dev Tooling Hardening ✓ Complete
**Status**: Implemented and tested

**Completed**:
- Comprehensive stop/restart scripts
- Makefile for easy operations
- Process detection with port verification
- Graceful shutdown patterns

## Priority 2: Bot Execution Quality

### Goal
Improve task execution success rate from ~60% to >90%.

### Implementation Plan

#### Phase 1: Validation Layer (Week 1)
- [x] Agent validation - code complete, needs testing
- [ ] Task quality validation warnings
- [ ] Files array requirement for technical tasks
- [ ] Description minimum length checks
- [ ] Acceptance criteria specificity checks

#### Phase 2: Prompt Enhancement (Week 2)
- [ ] Create `PromptEnhancer` service
- [ ] Step-by-step instruction generator
- [ ] File context inference
- [ ] Acceptance criteria expander
- [ ] Template library for common tasks

#### Phase 3: Testing & Metrics (Week 3)
- [ ] Retry failed tasks with enhanced prompts
- [ ] Measure success rate improvement
- [ ] Document best practices
- [ ] Create task creation guidelines

### Success Metrics
- Invalid agents: 0% (currently 40%)
- Schema coverage: 100% (currently 50%)
- Task completion accuracy: >90% (currently ~60%)
- First-attempt success rate: >80% (currently ~50%)

## Priority 3: Failure Recovery Optimization

### Current State ✓ Simplified System Deployed
- 257 lines (73% reduction from previous 950 lines)
- Event-driven followup creation
- No polling loops
- Simple metadata tracking

### Future Enhancements (Lower Priority)
1. **Adaptive Recovery**: Learn from successful patterns
2. **Pattern Detection**: Identify recurring failures
3. **Recovery Analytics**: Track success rates by error type
4. **Smart Rollback**: Auto-rollback if followup fails
5. **Recovery Budget**: Limit attempts per task

## Priority 4: Database & Performance

### Completed Migrations
- 001: Initial schema
- 002: Tasks table
- 003: Documentation only
- 004: Task context tracking

### Pending Migrations
- [ ] 005: Missing Task interface fields (~30 fields)
- [ ] 006: PR tracking columns
- [ ] 007: Performance indexes optimization

### Performance Targets
- Task query response: <10ms
- Queue processing: <100ms per cycle
- Container spawn time: <5s
- Log streaming latency: <100ms

## Priority 5: Testing Coverage

### Current Coverage
- Overall: ~20%
- Critical paths: ~40%
- Utils: ~30%

### Target Coverage (Q1 2025)
- Overall: 80%+
- Critical paths: 95%+
- Utils: 90%+
- Services: 85%+
- Routes: 80%+

### Test Priorities
1. Task execution lifecycle
2. Failure recovery system
3. CLI flag compatibility
4. PR workflow automation
5. Queue management

## Implementation Timeline

### Week 1 (Current)
- [x] Fix migration re-run issue
- [x] Implement agent validation
- [ ] Deploy and test validation
- [ ] Add PR tracking schema

### Week 2
- [ ] Build PromptEnhancer service
- [ ] Create prompt templates
- [ ] Test enhanced prompts
- [ ] Measure improvement

### Week 3
- [ ] Documentation cleanup
- [ ] Performance optimization
- [ ] Recovery system monitoring
- [ ] Success metrics collection

### Week 4
- [ ] Test coverage improvement
- [ ] System stabilization
- [ ] Production readiness check
- [ ] Deployment procedures

## Configuration & Environment

### Required Environment Variables
```bash
# Auto-recovery System
ENABLE_AUTO_RECOVERY=true    # Enable failure recovery
RECOVERY_DRY_RUN=false       # Execute repairs (not just log)

# Docker Configuration
DOCKER_REGISTRY=...          # Container registry
CLAUDE_IMAGE=...             # Claude CLI image
CODEX_IMAGE=...              # Codex CLI image

# Database
DB_PATH=/workspace/dev-bots.db
```

### Key Configuration Files
- `src/config.ts`: Central configuration
- `src/services/cliFlags.ts`: CLI compatibility layer
- `src/services/taskPromptTemplates.ts`: Prompt generation

## Monitoring & Observability

### Log Categories
- `task`: Task lifecycle events
- `recovery`: Failure recovery actions
- `docker_run`: Container operations
- `process`: Process management
- `worker`: Worker status

### Key Metrics to Track
- Task success rate by type
- Recovery attempt success rate
- Average task execution time
- Container resource usage
- Queue depth and processing rate

## Risk Mitigation

### Risk 1: Container Resource Exhaustion
**Mitigation**: Implement container limits and cleanup policies

### Risk 2: Infinite Recovery Loops
**Mitigation**: Recovery budget limits, max attempts per task

### Risk 3: PR Workflow Breakage
**Mitigation**: Comprehensive PR status monitoring, manual override capability

### Risk 4: Database Lock Contention
**Mitigation**: WAL mode enabled, proper transaction management

## Dependencies & Blockers

### No Current Blockers
All critical issues resolved:
- ✅ Migration re-run fixed
- ✅ CLI flag compatibility implemented
- ✅ Dev tooling hardened
- ✅ Failure recovery simplified

### Dependencies
- Docker daemon must be running
- Claude/Codex CLI images must be accessible
- Git credentials properly configured
- GitHub CLI (gh) installed and authenticated

## Success Criteria

### Short-term (2 weeks)
- [ ] Dev-bots run for 24 hours without manual intervention
- [ ] Task success rate >80%
- [ ] Zero invalid agent errors
- [ ] PR workflow completes automatically

### Long-term (Q1 2025)
- [ ] Task success rate >90%
- [ ] Test coverage >80%
- [ ] Recovery success rate >70%
- [ ] Production deployment completed

## References

### Documentation
- [Failure Recovery System](../FAILURE_RECOVERY_SYSTEM.md)
- [Database Migrations](../../migrations/README.md)
- [Test Checklist](../../TEST_CHECKLIST.md)

### Key Implementation Files
- `src/services/devBotsManager.ts`: Core orchestration
- `src/services/failureRecovery.ts`: Recovery system
- `src/services/cliFlags.ts`: CLI compatibility
- `src/services/taskQueue.sqlite.ts`: Queue management

## Next Actions

**Immediate** (Today):
1. Test agent validation with real tasks
2. Add PR tracking database columns
3. Monitor bot execution for stability

**This Week**:
1. Implement task quality warnings
2. Create prompt enhancement templates
3. Test recovery system under load

**Next Week**:
1. Build PromptEnhancer service
2. Improve test coverage
3. Documentation cleanup

---

**Note**: This roadmap supersedes all previous planning documents. It represents the consolidated, deduplicated plan for dev-bots system improvements with accuracy verified against the running codebase.