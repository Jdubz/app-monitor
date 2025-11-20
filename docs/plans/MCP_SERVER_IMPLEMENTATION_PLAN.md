# App Monitor MCP Server Implementation Plan

**Date:** 2025-11-19
**Status:** ✅ APPROVED - Ready for Implementation
**Total Tools:** 24 (Plan: 11, Task: 6, Bot: 4, PR: 2, System: 1)

---

## 1. Overview

This document provides the complete implementation plan for the App Monitor MCP (Model Context Protocol) server. It is the single source of truth for this project, consolidating all previous design and approval documents.

**What:** An MCP server embedded in the backend to provide structured, secure, and validated access for AI agents.
**Who:** Admin bot (full access), Dev-bots (limited access), Humans (via Claude Desktop).
**Where:** The server will be implemented in the `backend/src/mcp/` directory and will run as part of the main backend process.
**Deploy:** The MCP server will be deployed automatically with the backend via a blue-green deployment strategy.

---

## 2. Architecture

### 2.1. Embedded in Backend

The MCP server will be embedded directly into the backend application.

```typescript
// backend/src/server.ts
import { startMcpServer } from './mcp/server.js';

async function main() {
  // Start HTTP API
  const app = await startExpressApp();
  app.listen(PORT);

  // Start MCP server (stdio)
  await startMcpServer({
    db: getDatabase(),
    services: getServices()
  });
}
```

**Benefits:**
- ✅ **Shared Resources:** Shares the database and services with the backend, preventing duplication.
- ✅ **Version Sync:** The MCP server version will always match the backend version.
- ✅ **Simplified Deployment:** A single deployment process for both the backend and the MCP server.

### 2.2. Blue-Green Deployment Handling

The blue-green deployment process will be handled as follows:
1.  **Blue Active:** The blue instance (e.g., on port 5001) is live with the admin bot connected.
2.  **Green Deploy:** A new green instance (e.g., on port 5002) starts and passes health checks.
3.  **Switch Traffic:** Nginx switches traffic from the blue to the green instance.
4.  **Blue Shutdown:** The blue instance shuts down, causing the admin bot to lose its connection.
5.  **Reconnect:** The admin bot automatically reconnects and establishes a connection with the new green instance, displaying a clear message: "🔄 Backend deployed, reconnecting..."

---

## 3. Access Control

Access to the MCP server is managed across three distinct environments.

**1. Production MCP (Admin bot only)**
- **Location:** `/opt/app-monitor` backend.
- **Access:** Admin bot and human operators.
- **Tools:** All 24 tools are available, except for `task_report_outcome`.

**2. Dev-Bot Test Environment MCP (Full access)**
- **Location:** Inside the dev-bot container.
- **Access:** Dev-bot only.
- **Tools:** All 24 tools are available in an isolated test environment.
- **Purpose:** To allow for safe testing of changes in isolation.

**3. Dev-Bot Production API (Limited)**
- Dev-bots will not have direct access to the production MCP server. Instead, they will use the production backend's REST API for a limited set of actions:
  - `GET` task details (for their assigned task).
  - `POST` task outcome (to report completion).
- ❌ Dev-bots **cannot** create plans or tasks in the production environment.

### 3.1. Permission Middleware

A middleware layer will enforce these access rules:

```typescript
const checkToolPermission = (tool: string, context: AuthContext) => {
  if (context.isDevBot && context.env === "production") {
    throw new Error("Dev-bots cannot access production MCP");
  }

  if (context.isAdminBot) {
    const disallowed = ["task_report_outcome"];
    if (disallowed.includes(tool)) {
      throw new Error(`Admin bot cannot access: ${tool}`);
    }
  }
};
```

---

## 4. Approved Tools (24 Total)

The following 24 tools have been approved for implementation.

### 4.1. Plan Management (11 tools)

- **`plan_create`**: Creates a new plan with an auto-generated YAML file.
- **`plan_get_status`**: Retrieves the execution status of a plan.
- **`plan_update_metadata`**: Updates a plan's metadata.
- **`plan_add_batch`**: Adds a batch of tasks to a plan.
- **`plan_update_batch`**: Updates a batch of tasks (fails if the batch has already been imported).
- **`plan_update_markdown`**: Updates the markdown sections of a plan.
- **`plan_validate`**: Validates a plan without saving it.
- **`plan_save`**: Persists a plan to the database.
- **`plan_list`**: Lists plans with filtering options.
- **`plan_get_progress`**: Retrieves the real-time execution progress of a plan.
- **`batch_can_import`**: Checks if a batch is ready to be imported.

### 4.2. Task Operations (6 tools)

- **`task_create`**: Creates a standalone task.
- **`task_get`**: Retrieves the details of a task.
- **`task_list`**: Lists tasks with filtering options.
- **`task_unblock`**: Manually unblocks a blocked task.
- **`task_cancel`**: Cancels a task.
- **`task_report_outcome`**: (DEV-BOTS ONLY) Allows a dev-bot to report the outcome of a task.

### 4.3. Dev-Bot Control (4 tools)

- **`bot_list_active`**: Lists all active dev-bots.
- **`bot_get_status`**: Retrieves the detailed status of a dev-bot.
- **`bot_recover`**: (ADMIN ONLY) Recovers a hung dev-bot.
- **`bot_heartbeat_status`**: Checks the heartbeat status of all dev-bots.

### 4.4. PR Evaluation (2 tools)

- **`pr_trigger_evaluation`**: Manually triggers a PR gate evaluation.
- **`pr_get_blocking_issues`**: Retrieves the detailed reasons why a PR is blocked.

### 4.5. System Diagnostics (1 tool)

- **`system_health`**: Provides a comprehensive overview of the system's health.

---

## 5. Removed Tools (From Original Proposal)

The following 11 tools were part of the original proposal but have been removed for the reasons specified below.

- `batch_import`: This is a backend-only operation, not to be triggered by agents.
- `plan_read`: Agents should read files directly from the filesystem.
- `task_get_logs`: Agents should read logs directly from the filesystem.
- `task_update_priority`: The task queue is strictly FIFO, so this tool is redundant.
- `bot_get_assigned_task`: This is redundant, as the information is available via `bot_get_status` and `task_get`.
- `bot_get_logs`: Agents should read logs directly from the filesystem.
- `bot_terminate`: This has been replaced by the more robust `bot_recover`.
- `pr_get_status`: This is redundant, as the information is available via `pr_trigger_evaluation`.
- `pr_force_merge`: This is a high-risk operation that should only be performed by a human in the GitHub UI.
- `system_get_metrics`, `system_check_ports`, `system_get_logs`: These are all covered by the enhanced `system_health` tool.
- `system_restart_component`: This is not architecturally sound; blue-green deployments are the correct approach for this.

---

## 6. Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Install the latest stable versions of `@modelcontextprotocol/sdk` and `zod`.
- [ ] Create the directory structure: `backend/src/mcp/`.
- [ ] Implement the base MCP server with tool registration.
- [ ] Add authentication middleware (admin vs. dev-bot).
- [ ] Add validation middleware using Zod schemas.
- [ ] Integrate the MCP server with the backend startup process.

### Phase 2: Plan Tools
- [ ] Implement all 11 plan management tools.
- [ ] Add immutability enforcement (e.g., a batch update check).
- [ ] Add dependency cycle detection for batches.
- [ ] Write unit tests for all plan management tools.

### Phase 3: Task & Bot Tools
- [ ] Implement all 6 task operation tools.
- [ ] Implement all 4 dev-bot control tools.
- [ ] Add permission checks (e.g., admin-only for `bot_recover`).
- [ ] Write unit tests for all task and bot tools.

### Phase 4: PR & System Tools
- [ ] Implement all 2 PR evaluation tools.
- [ ] Implement the enhanced `system_health` tool.
- [ ] Write unit tests for all PR and system tools.

### Phase 5: Integration, Testing & Documentation
- [ ] Write integration tests that cover full end-to-end workflows.
- [ ] Test the blue-green deployment reconnection process with a sample client.
- [ ] Create a comprehensive guide at `docs/guides/mcp-server-reference.md`. This guide will:
  - Document all 24 approved tools with their inputs, outputs, and usage examples.
  - Provide detailed instructions and code snippets for connecting various local admin bot clients (e.g., Claude, Codex, Gemini) to the production MCP server.

---

## 7. Success Criteria

**Functional:**
- [ ] All 24 approved tools are working correctly.
- [ ] Immutability is enforced (e.g., editing an imported batch fails as expected).
- [ ] Permission checks prevent unauthorized operations.
- [ ] The admin bot reconnects cleanly during a blue-green deployment.
- [ ] Dev-bots are blocked from accessing the production MCP.

**Performance Goals:**
- [ ] Tool invocation latency should generally be under 200ms (excluding backend API calls).
- [ ] Validation tools should aim to complete in less than 500ms.
- [ ] The `system_health` tool should aim to complete in less than 1 second.

**Quality:**
- [ ] There is 100% test coverage for all tool implementations.
- [ ] All tools return comprehensive error messages with context.
- [ ] All inputs are validated using Zod schemas.
- [ ] The `docs/guides/mcp-server-reference.md` guide is complete and accurate.

---

## 8. Deployment Configuration

### MCP Client Setup (Admin Bots)

Connection to the production MCP server is designed for any local AI agent (e.g., Claude, Codex, Gemini) running on the host machine. The connection is established via an SSH command that executes the MCP server's startup script on the production server.

A detailed guide with specific configuration examples for different clients will be created in `docs/guides/mcp-server-reference.md`.

**General Connection Method:**

An MCP client should be configured to execute a command similar to the following:

```bash
ssh app-monitor-server /opt/app-monitor/current/backend/dist/mcp/start.js
```

The client must also provide the necessary environment variables, such as `DATABASE_PATH` and `APP_MONITOR_API_KEY`, within the SSH session.

The server supports auto-reconnect, and clients should be configured to listen for the "🔄 Backend deployed, reconnecting to new version..." message to handle blue-green deployments gracefully.

### Package.json Scripts

```json
{
  "scripts": {
    "mcp:start": "node --loader tsx backend/src/mcp/start.js",
    "mcp:dev": "nodemon --watch backend/src/mcp --exec npm run mcp:start",
    "mcp:test": "vitest run backend/src/mcp/__tests__"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "zod": "latest"
  }
}
```
