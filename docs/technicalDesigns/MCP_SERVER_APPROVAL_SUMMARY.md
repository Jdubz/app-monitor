# MCP Server - Approval Summary

**Date:** 2025-11-17  
**Status:** ✅ ALL TOOLS APPROVED  
**Next Step:** Implementation (10 days estimated)

---

## Approval Results

**Original Proposal:** 35 tools  
**Approved:** 24 tools  
**Removed:** 11 tools (redundant, architecturally unsound, or agent-readable)

---

## Tools by Category

### ✅ Plan Management (11 tools)
1. `plan_create` - Create new plan
2. `plan_get_status` - Get execution status (modified from plan_read)
3. `plan_update_metadata` - Update title/description/priority (status auto-generated)
4. `plan_add_batch` - Add batch with tasks
5. `plan_update_batch` - Update batch (immutability enforced)
6. `plan_update_markdown` - Update research/notes sections
7. `plan_validate` - Validate before saving
8. `plan_save` - Persist to database
9. `plan_list` - List plans with filters
10. `plan_get_progress` - Get execution progress
11. `batch_can_import` - Check if batch ready

**Removed:**
- ❌ `batch_import` - Backend-only (UI button), not for agents
- ❌ `plan_read` - Agent reads files directly

---

### ✅ Task Operations (6 tools)
12. `task_create` - Create standalone task
13. `task_get` - Get task details
14. `task_list` - List tasks with filters
15. `task_unblock` - Manually unblock task
16. `task_cancel` - Cancel task
17. `task_report_outcome` - Dev-bot reports success/failure (dev-bots only)

**Removed:**
- ❌ `task_get_logs` - Agent reads logs directly
- ❌ `task_update_priority` - Priority doesn't affect FIFO execution

---

### ✅ Dev-Bot Control (4 tools)
18. `bot_list_active` - List all active dev-bots
19. `bot_get_status` - Get detailed bot status
20. `bot_recover` - Recover hung bot with recovery agent (admin only)
21. `bot_heartbeat_status` - Check all bot heartbeats

**Removed:**
- ❌ `bot_get_assigned_task` - Redundant with bot_get_status + task_get
- ❌ `bot_get_logs` - Agent reads logs directly
- ❌ `bot_terminate` - Replaced with bot_recover (better recovery flow)

---

### ✅ PR Evaluation (2 tools)
22. `pr_trigger_evaluation` - Manually trigger gate evaluation
23. `pr_get_blocking_issues` - Get detailed blocking reasons

**Removed:**
- ❌ `pr_get_status` - Redundant with pr_trigger_evaluation
- ❌ `pr_force_merge` - NEVER bypass gates (human-only in GitHub UI)

---

### ✅ System Diagnostics (1 tool - Enhanced)
24. `system_health` - Comprehensive system overview (includes deployment info, PR tracking, in-flight tasks, performance metrics)

**Removed:**
- ❌ `system_get_metrics` - Covered by enhanced system_health
- ❌ `system_check_ports` - Deployment info in system_health
- ❌ `system_get_logs` - Agent reads logs directly
- ❌ `system_restart_component` - Not architecturally sound (use blue-green deployment)

---

## Key Design Decisions

### 1. MCP Server Embedded in Backend
- ✅ Shares database/services with backend
- ✅ Deploys together (single version)
- ✅ Temporary reconnection during blue-green rollover
- ❌ No separate MCP server process

### 2. Access Control (Three Environments)
- **Production MCP:** Admin bot only (all tools except task_report_outcome)
- **Dev-Bot Test MCP:** Dev-bot in isolated container (full access for testing)
- **Dev-Bot Production API:** Limited REST API access (get task, report outcome)

### 3. Batch Import NOT an MCP Tool
- ✅ Human clicks "Import Batch" button in UI
- ✅ UI calls backend REST API directly
- ✅ Backend programmatically creates tasks from batch definition
- ❌ No agent involvement in batch import process

### 4. File Operations
- Agents read logs/files directly (filesystem access)
- No MCP tools for log retrieval or file reading
- MCP provides status/metadata only

### 5. Task Queue is FIFO
- Priority field is notation-only
- Tasks processed in order (first in, first out)
- No priority-based queue jumping

---

## Security Model

### Permission Checks
```typescript
// Admin-only tools
const adminTools = ["bot_recover"];

// Dev-bot-only tools
const devBotTools = ["task_report_outcome"];

// Dev-bots blocked from production MCP
if (isDevBot && env === "production") {
  throw new Error("Dev-bots cannot access production MCP");
}
```

### Immutability Enforcement
- Batches with `validation_state !== 'pending'` cannot be modified
- `plan_update_batch` fails with clear error if batch already imported
- `plan_save` rejects files with immutability violations

---

## Implementation Timeline

**Phase 1:** Core Infrastructure (3 days)
**Phase 2:** Plan Tools (2 days)
**Phase 3:** Task & Bot Tools (2 days)
**Phase 4:** PR & System Tools (1.5 days)
**Phase 5:** Integration & Testing (1.5 days)

**Total:** 10 days

---

## Documentation

**Implementation Spec:** `MCP_SERVER_IMPLEMENTATION_SPEC.md` (this directory)
**Original Proposal:** Consolidated into `app-monitor-mcp-server.md` to keep a single canonical design
**Plan System:** `multi-phase-plan-system.md` (updated with correct workflow)

---

## Next Steps

1. Review implementation spec: `MCP_SERVER_IMPLEMENTATION_SPEC.md`
2. Install dependencies: `@modelcontextprotocol/sdk`, `zod`
3. Create file structure: `backend/src/mcp/`
4. Begin Phase 1 implementation

**All tools approved and ready for implementation.**
