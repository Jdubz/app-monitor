# App Monitor MCP Server - Agent Interaction Interface

**Date:** 2025-11-17
**Status:** Design Approved - Ready for Implementation
**Purpose:** Unified Model Context Protocol (MCP) server for seamless agent interactions with App Monitor system

---

## Executive Summary

This design specifies a **MCP (Model Context Protocol) server embedded in the backend** that provides structured, validated, and secure access to App Monitor's core operations for AI agents (Claude, Codex, Gemini, etc.). The server exposes 24 approved tools for plan management, task operations, dev-bot monitoring, PR evaluation, and system diagnostics.

**Key Benefits:**
- ✅ Universal agent compatibility (works with any MCP-compatible AI)
- ✅ Structured operations with Zod schema validation
- ✅ Built-in immutability enforcement and permission checks
- ✅ Real-time status monitoring and debugging capabilities
- ✅ Embedded in backend - deploys with application, shares services/database
- ✅ Automatic version synchronization with backend
- ✅ Single interface for all agent operations

**Architecture:** MCP server runs as part of backend application, shares database and services, deploys via blue-green process with temporary reconnection during rollover.

## November 20, 2025 Scope Correction (MCP MVP)

- **Plan management tools deferred.** The existing planning system is still being stabilized, so no MCP plan/batch tools ship in this milestone. Agents edit plan files directly when needed.
- **Only existing production features have MCP tools.** Shipping surface area: task queue CRUD/inspection, dev-bot health, PR evaluation triggers, and `system_health`. Task cancellation, reprioritisation, batch import, and log retrieval remain out-of-scope.
- **Diagnostics stay minimal.** `system_health` reports database connectivity, queue metrics, and dev-bot status; deeper diagnostics/metrics/log APIs will be added only after the core system is proven in production.
- **No Cloudflare/nginx exposure.** The MCP server only runs over stdio inside the backend process so it is never reachable through the public tunnel.
- **Explicit roles required.** `APP_MONITOR_MCP_USER_ROLE` must be `admin` or `dev-bot`. Dev-bots are blocked outright when `APP_MONITOR_ENV/NODE_ENV` is `production`, and they do not need API keys.
- **Feature flags removed.** Outside of automated tests the MCP server always starts with the backend, keeping agents in sync with every deploy.

This section supersedes any earlier references to plan tooling, task priority controls, or log/diagnostic APIs in the remainder of this document.
---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     AI Agents Layer                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────────┐   │
│  │ Claude  │  │  Codex  │  │ Gemini  │  │ Admin Bot    │   │
│  │ Desktop │  │   CLI   │  │  API    │  │ (Interactive)│   │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────┬───────┘   │
└───────┼───────────┼─────────────┼───────────────┼───────────┘
        │           │             │               │
        └───────────┴─────────────┴───────────────┘
                    │ JSON-RPC 2.0 over stdio
        ┌───────────▼────────────────────────────────┐
        │  Backend Application (port 5001/5002)      │
        │  ┌──────────────────────────────────────┐  │
        │  │      MCP Server (Embedded)           │  │
        │  │  Tool Registry (24 tools)            │  │
        │  │  • Plan Management (11 tools)        │  │
        │  │  • Task Operations (6 tools)         │  │
        │  │  • Dev-Bot Control (4 tools)         │  │
        │  │  • PR Evaluation (2 tools)           │  │
        │  │  • System Diagnostics (1 tool)       │  │
        │  └──────────────┬───────────────────────┘  │
        │                 │ Shared Access            │
        │  ┌──────────────▼───────────────────────┐  │
        │  │  Express API │ Services │ Database   │  │
        │  │  (REST/WS)   │          │ (SQLite)   │  │
        │  └──────────────────────────────────────┘  │
        └─────────────────┬──────────────────────────┘
                          │ HTTP/WebSocket
                          ▼
                    Webhooks/UI/Dev-Bots
```

**Key Architecture Change:** MCP server is **embedded in backend**, shares database/services, deploys together as single unit.

---

## Tool Categories

### 1. Plan Management Tools (11 tools)
> **Implementation status (Nov 20, 2025):** deferred for MCP MVP – agents rely on existing plan files until the planning system is stable.

**Purpose:** Complete lifecycle management of multi-phase development plans

**CRITICAL WORKFLOW NOTE:**
- Admin bot creates plans, adds batches, saves to database
- **HUMAN** reviews plans and approves batch imports (one at a time)
- System executes tasks automatically after batch import (FIFO queue)
- Admin bot does NOT automatically import batches
- Each batch requires explicit human approval via UI "Import Batch" button (backend API call, no agent involvement)
- Batch import is **backend-only** - not exposed as MCP tool

#### Core Operations

```typescript
// Tool: plan_create
// Create new plan with auto-generated file
{
  name: "plan_create",
  description: "Create a new development plan with auto-generated YAML file",
  inputSchema: z.object({
    name: z.string().describe("Plan name (e.g., 'API Caching Layer')"),
    type: z.enum(["feature", "refactor", "fix", "investigation"]).optional(),
    priority: z.enum(["p0", "p1", "p2", "p3"]).optional()
  })
}
// Returns: { plan_id, file_path, version }

// Tool: plan_read
// Read entire plan or specific section
{
  name: "plan_read",
  description: "Read plan file contents (YAML frontmatter + markdown body)",
  inputSchema: z.object({
    plan_id: z.string(),
    section: z.enum(["all", "metadata", "batches", "markdown", "progress"]).optional()
  })
}
// Returns: Plan data structure

// Tool: plan_update_metadata
// Update plan-level fields (title, priority, status, etc.)
{
  name: "plan_update_metadata",
  description: "Update plan metadata fields in YAML frontmatter",
  inputSchema: z.object({
    plan_id: z.string(),
    updates: z.object({
      title: z.string().optional(),
      priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
      status: z.enum(["draft", "researched", "ready", "in_progress", "blocked", "completed", "cancelled"]).optional(),
      estimated_effort_hours: z.number().optional()
    })
  })
}

// Tool: plan_add_batch
// Add new task batch to plan
{
  name: "plan_add_batch",
  description: "Add a new batch of tasks to plan (auto-validates dependencies)",
  inputSchema: z.object({
    plan_id: z.string(),
    batch: z.object({
      id: z.string().optional(), // Auto-generated if omitted
      name: z.string(),
      description: z.string().optional(),
      order_num: z.number().optional(), // Auto-incremented if omitted
      depends_on: z.array(z.string()).optional(),
      tasks: z.array(z.object({
        title: z.string(),
        type: z.enum(["implementation", "analysis", "documentation", "review"]).optional(),
        context: z.string(),
        success_criteria: z.array(z.string()),
        estimated_effort_hours: z.number().optional(),
        agent_preference: z.enum(["claude", "codex", "gemini"]).optional(),
        tags: z.array(z.string()).optional()
      }))
    })
  })
}

// Tool: plan_update_batch
// Update existing batch (only if not imported)
{
  name: "plan_update_batch",
  description: "Update batch definition (fails if already imported to task queue)",
  inputSchema: z.object({
    plan_id: z.string(),
    batch_id: z.string(),
    updates: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      tasks: z.array(z.any()).optional() // Full task array
    })
  })
}
// Returns: Success or immutability error

// Tool: plan_update_markdown
// Update markdown body (research notes, execution notes, retrospective)
{
  name: "plan_update_markdown",
  description: "Update markdown body sections (research findings, execution notes)",
  inputSchema: z.object({
    plan_id: z.string(),
    section: z.enum(["research", "execution", "retrospective", "full"]),
    content: z.string()
  })
}

// Tool: plan_validate
// Validate plan without saving
{
  name: "plan_validate",
  description: "Validate plan file (checks dependencies, batch completeness, immutability)",
  inputSchema: z.object({
    plan_id: z.string()
  })
}
// Returns: { valid, errors[], warnings[], batches: { [id]: { state, can_import } } }

// Tool: plan_save
// Save plan file to database
{
  name: "plan_save",
  description: "Persist plan file to database (creates backup, updates version)",
  inputSchema: z.object({
    plan_id: z.string(),
    commit_message: z.string().optional()
  })
}
// Returns: { success, version, warnings[], batches }

// Tool: plan_list
// List all plans with filtering
{
  name: "plan_list",
  description: "List plans with optional filtering by status, type, priority",
  inputSchema: z.object({
    status: z.enum(["draft", "researched", "ready", "in_progress", "completed"]).optional(),
    type: z.enum(["feature", "refactor", "fix", "investigation"]).optional(),
    limit: z.number().optional()
  })
}
// Returns: { plans: Plan[] }

// Tool: plan_get_progress
// Get real-time progress from tasks/batches
{
  name: "plan_get_progress",
  description: "Get plan execution progress (batch completion, task counts)",
  inputSchema: z.object({
    plan_id: z.string()
  })
}
// Returns: { percentComplete, batches_total, batches_completed, tasks_completed, ... }

// Tool: batch_import
// Import batch to task queue (HUMAN-TRIGGERED ONLY)
{
  name: "batch_import",
  description: "Import batch to task queue - REQUIRES HUMAN APPROVAL. System does NOT auto-import batches. Each batch must be explicitly approved via UI button or this tool call.",
  inputSchema: z.object({
    plan_id: z.string(),
    batch_id: z.string(),
    approved_by: z.string().describe("User ID or 'human-via-ui' - confirms human approval")
  })
}
// Returns: { success, tasks_created, task_ids[] }
// NOTE: Do NOT call this tool automatically in response to batch completion events

// Tool: batch_can_import
// Check if batch is ready to import
{
  name: "batch_can_import",
  description: "Check if batch can be imported (dependencies satisfied, state ready)",
  inputSchema: z.object({
    plan_id: z.string(),
    batch_id: z.string()
  })
}
// Returns: { can_import, blocking_batches[], blocking_plans[] }
```

---

### 2. Task Operations Tools (8 tools)

**Purpose:** Task queue management, status monitoring, manual intervention

```typescript
// Tool: task_create
// Create individual task (outside of plan batches)
{
  name: "task_create",
  description: "Create standalone task in queue (not part of a plan)",
  inputSchema: z.object({
    title: z.string(),
    type: z.enum(["implementation", "analysis", "documentation", "review"]),
    prompt: z.string(),
    success_criteria: z.array(z.string()).optional(),
    assigned_agent: z.enum(["claude", "codex", "gemini"]).optional(),
    priority: z.number().min(1).max(10).optional(),
    tags: z.array(z.string()).optional()
  })
}
// Returns: { task_id, status }

// Tool: task_get
// Get task details with full context
{
  name: "task_get",
  description: "Get task details including status, progress, assigned bot",
  inputSchema: z.object({
    task_id: z.string(),
    include_logs: z.boolean().optional()
  })
}
// Returns: Task object with status, bot_id, phase, attempt_count, etc.

// Tool: task_list
// List tasks with filtering
{
  name: "task_list",
  description: "List tasks with filtering by status, plan, batch, agent",
  inputSchema: z.object({
    status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]).optional(),
    plan_id: z.string().optional(),
    batch_id: z.string().optional(),
    assigned_agent: z.string().optional(),
    limit: z.number().optional()
  })
}
// Returns: { tasks: Task[], total }

// Tool: task_unblock
// Manually unblock a blocked task
{
  name: "task_unblock",
  description: "Unblock a task (provide resolution context for recovery agent)",
  inputSchema: z.object({
    task_id: z.string(),
    resolution_notes: z.string(),
    retry_immediately: z.boolean().optional()
  })
}
// Returns: { success, new_status }

// Tool: task_cancel
// Cancel a task
{
  name: "task_cancel",
  description: "Cancel task (removes from queue, updates plan progress)",
  inputSchema: z.object({
    task_id: z.string(),
    reason: z.string()
  })
}

// Tool: task_get_logs
// Get task execution logs
{
  name: "task_get_logs",
  description: "Get task execution logs (console output, errors, agent responses)",
  inputSchema: z.object({
    task_id: z.string(),
    tail_lines: z.number().optional() // Default: 100
  })
}
// Returns: { logs: LogEntry[] }

// Tool: task_update_priority
// Change task priority
{
  name: "task_update_priority",
  description: "Update task priority (1-10, higher = more urgent)",
  inputSchema: z.object({
    task_id: z.string(),
    priority: z.number().min(1).max(10)
  })
}

// Tool: task_report_success
// Dev-bot reports task success (dev-bots only)
{
  name: "task_report_success",
  description: "Report task completion (creates PR, triggers verification) - Dev-bots only",
  inputSchema: z.object({
    task_id: z.string(),
    pr_url: z.string().optional(),
    summary: z.string(),
    files_changed: z.array(z.string()).optional()
  })
}
```

---

### 3. Dev-Bot Control Tools (6 tools)

**Purpose:** Monitor and control autonomous dev-bot workers

```typescript
// Tool: bot_list_active
// Get all active dev-bots
{
  name: "bot_list_active",
  description: "List all active dev-bot workers with assigned tasks",
  inputSchema: z.object({
    include_idle: z.boolean().optional()
  })
}
// Returns: { bots: [{ id, status, assigned_task_id, container_id, started_at }] }

// Tool: bot_get_status
// Get specific bot status
{
  name: "bot_get_status",
  description: "Get detailed status of a specific dev-bot",
  inputSchema: z.object({
    bot_id: z.string()
  })
}
// Returns: { status, task, phase, container_status, resource_usage, heartbeat_age }

// Tool: bot_get_assigned_task
// Get task currently assigned to bot
{
  name: "bot_get_assigned_task",
  description: "Get details of task currently assigned to dev-bot",
  inputSchema: z.object({
    bot_id: z.string()
  })
}
// Returns: Task object

// Tool: bot_terminate
// Stop a hung or misbehaving bot
{
  name: "bot_terminate",
  description: "Terminate dev-bot worker (emergency stop for hung bots)",
  inputSchema: z.object({
    bot_id: z.string(),
    reason: z.string(),
    requeue_task: z.boolean().optional() // Default: true
  })
}
// Returns: { success, container_stopped, task_requeued }

// Tool: bot_get_logs
// Get bot container logs
{
  name: "bot_get_logs",
  description: "Get dev-bot container logs (stdout/stderr)",
  inputSchema: z.object({
    bot_id: z.string(),
    tail_lines: z.number().optional(),
    follow: z.boolean().optional() // Stream logs
  })
}
// Returns: { logs: string[] } or stream

// Tool: bot_heartbeat_status
// Check all bot heartbeats
{
  name: "bot_heartbeat_status",
  description: "Check heartbeat status of all bots (detect hung workers)",
  inputSchema: z.object({
    alert_threshold_seconds: z.number().optional() // Default: 30
  })
}
// Returns: { healthy: Bot[], unhealthy: Bot[], alerts: Alert[] }
```

---

### 4. PR Evaluation Tools (4 tools)

**Purpose:** Trigger and monitor PR merge gate evaluation

```typescript
// Tool: pr_trigger_evaluation
// Manually trigger PR evaluation
{
  name: "pr_trigger_evaluation",
  description: "Trigger PR merge gate evaluation (checks all 8 gates)",
  inputSchema: z.object({
    pr_number: z.number(),
    force: z.boolean().optional() // Override cooldown
  })
}
// Returns: { evaluation_id, status, gates: GateResult[] }

// Tool: pr_get_status
// Get PR merge gate status
{
  name: "pr_get_status",
  description: "Get current PR status (which gates passing, which blocking)",
  inputSchema: z.object({
    pr_number: z.number()
  })
}
// Returns: { can_merge, gates: [{ name, status, blocking }], next_evaluation_at }

// Tool: pr_get_blocking_issues
// Get issues blocking PR merge
{
  name: "pr_get_blocking_issues",
  description: "Get detailed list of issues blocking PR from merging",
  inputSchema: z.object({
    pr_number: z.number()
  })
}
// Returns: { blocking_gates: [{ gate, reason, fingerprint, suggested_fix }] }

// Tool: pr_force_merge
// Force merge PR (admin override)
{
  name: "pr_force_merge",
  description: "Force merge PR bypassing gates (requires admin approval)",
  inputSchema: z.object({
    pr_number: z.number(),
    reason: z.string(),
    bypass_gates: z.array(z.string()) // Which gates to bypass
  })
}
// Returns: { merged, commit_sha, bypassed_gates[] }
```

---

### 5. System Diagnostics Tools (5 tools)

**Purpose:** Minimal system health overview for operators

```typescript
// Tool: system_health
// Get overall system health (DB + queue + dev-bots)
{
  name: 'system_health',
  description: 'Get system health status (database connectivity, queue depth, dev-bot stats)',
  inputSchema: z.object({})
}
// Returns: { status, database, queue, devBots, timestamp }
```

> ⚠️ Enhanced diagnostics (`system_get_metrics`, `system_check_ports`, `system_get_logs`, `system_restart_component`) were intentionally removed from this MVP. Agents read logs directly from disk, and deeper diagnostics will be added only after the base MCP server proves stable in production.

---

## Implementation Architecture

### File Structure

```
backend/src/
├── mcp/
│   ├── server.ts              # Main MCP server entry point
│   ├── tools/
│   │   ├── tasks.tools.ts     # Task operation tools
│   │   ├── bots.tools.ts      # Dev-bot control tools
│   │   ├── prs.tools.ts       # PR evaluation tools
│   │   └── system.tools.ts    # System diagnostics tools
│   ├── middleware/
│   │   ├── auth.ts            # MCP authentication
│   │   ├── validation.ts      # Input validation
│   │   └── permissions.ts     # Permission checks
│   └── utils/
│       ├── apiClient.ts       # Internal API client
│       └── responses.ts       # Response formatting
```

### Core Server Implementation

```typescript
// backend/src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import Database from "better-sqlite3";
import { registerTaskTools } from "./tools/tasks.tools.js";
import { registerBotTools } from "./tools/bots.tools.js";
import { registerPRTools } from "./tools/prs.tools.js";
import { registerSystemTools } from "./tools/system.tools.js";

export class AppMonitorMcpServer {
  private server: McpServer;
  private db: Database.Database;
  private apiBaseUrl: string;

  constructor(config: {
    databasePath: string;
    apiBaseUrl: string;
  }) {
    this.db = new Database(config.databasePath);
    this.apiBaseUrl = config.apiBaseUrl;

    this.server = new McpServer({
      name: "app-monitor",
      version: "1.0.0",
      description: "App Monitor system control for AI agents"
    });

    this.registerAllTools();
  }

  private registerAllTools() {
    // Register all tool categories
    registerTaskTools(this.server, this.db, this.apiBaseUrl);
    registerBotTools(this.server, this.db, this.apiBaseUrl);
    registerPRTools(this.server, this.db, this.apiBaseUrl);
    registerSystemTools(this.server, this.db, this.apiBaseUrl);
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error("App Monitor MCP Server started"); // stderr for logging
    console.error(`Database: ${this.db.name}`);
    console.error(`API: ${this.apiBaseUrl}`);
    console.error(`Tools registered: ${this.getToolCount()}`);
  }

  private getToolCount(): number {
    // Return total number of registered tools
    return Object.keys(this.server.tools).length;
  }
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AppMonitorMcpServer({
    databasePath: process.env.DATABASE_PATH || "./data/app-monitor.db",
    apiBaseUrl: process.env.API_BASE_URL || "http://localhost:5000"
  });

  server.start().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  });
}
```

### Example Tool Implementation

```typescript
// backend/src/mcp/tools/tasks.tools.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { withAuth } from '../middleware/auth.js';
import type { McpServices } from '../server.js';

export function registerTasksTools(
  server: McpServer,
  _db: Database.Database,
  services: McpServices,
) {
  const taskQueue = services.devBotsManager.getTaskQueue();

  server.registerTool(
    'task_list',
    {
      title: 'List Tasks',
      description: 'Lists pending/running/blocked tasks with optional filters.',
      inputSchema: z.object({
        status: z.enum(['pending', 'running', 'blocked', 'completed', 'failed']).optional(),
        assigned_agent: z.string().optional(),
        limit: z.number().optional(),
      }),
    },
    withAuth('task_list', async (params, context) => {
      const groups = await services.devBotsManager.getTasks();
      const combined = [
        ...groups.pending,
        ...groups.active,
        ...groups.blocked,
        ...groups.completed,
        ...groups.failed,
      ];

      const filtered = params.status
        ? combined.filter((task) => task.status === params.status)
        : combined;

      const limited = filtered.slice(0, params.limit ?? 50);
      return { content: [{ type: 'text', text: JSON.stringify(limited, null, 2) }] };
    }),
  );
}
```


---

## Security & Permissions

### Authentication

```typescript
// MCP server runs with system-level access
// Authentication via:
// 1. Environment variables (API_KEY)
// 2. File system permissions (can only access mounted dirs)
// 3. Tool-level permission checks

const authMiddleware = {
  checkApiKey: (apiKey: string) => {
    return apiKey === process.env.APP_MONITOR_API_KEY;
  },

  checkToolPermission: (tool: string, context: any) => {
    // Admin-only tools
    const adminTools = ["pr_force_merge", "system_restart_component", "bot_terminate"];
    if (adminTools.includes(tool) && !context.isAdmin) {
      throw new Error(`Tool ${tool} requires admin permissions`);
    }

    // Dev-bot-only tools
    const botOnlyTools = ["task_report_success"];
    if (botOnlyTools.includes(tool) && !context.isBot) {
      throw new Error(`Tool ${tool} can only be called by dev-bots`);
    }
  }
};
```

### Immutability Enforcement

All plan editing tools enforce immutability rules:
- Batches with `validation_state !== 'pending'` cannot be modified
- Validation returns clear errors when attempting to edit imported batches
- Save operation rejects files with immutability violations

---

## Deployment Configuration

### Package.json Scripts

```json
{
  "scripts": {
    "mcp:start": "node --loader tsx backend/src/mcp/server.ts",
    "mcp:dev": "nodemon --watch backend/src/mcp --exec npm run mcp:start",
    "mcp:test": "vitest run backend/src/mcp/__tests__"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "zod": "^3.22.0"
  }
}
```

### MCP Client Configuration

**For Claude Desktop:**

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "app-monitor": {
      "command": "npm",
      "args": ["run", "mcp:start"],
      "cwd": "/opt/app-monitor",
      "env": {
        "DATABASE_PATH": "/opt/app-monitor/shared/backend/data/app-monitor.db",
        "API_BASE_URL": "http://localhost:5001",
        "APP_MONITOR_API_KEY": "..."
      }
    }
  }
}
```

**For Codex CLI:**

```bash
# .codex/servers.json
{
  "app-monitor": {
    "command": ["npm", "run", "mcp:start"],
    "cwd": "/opt/app-monitor"
  }
}
```

**For Interactive Admin Bot:**

```typescript
// backend/src/services/interactiveSessionOrchestrator.ts
private buildEnv(session: InteractiveSessionRecord): Record<string, string> {
  return {
    // ... existing vars ...

    // MCP Server connection
    MCP_SERVER_COMMAND: "npm run mcp:start",
    MCP_SERVER_CWD: this.repoRoot,

    // Or use direct stdio connection
    APP_MONITOR_MCP_AVAILABLE: "true"
  };
}
```

---

## Usage Examples

### Example 1: Plan Creation Workflow (Admin Bot)

```
Agent: "I need to create a plan for implementing a Redis caching layer"

MCP Call: plan_create({ name: "API Caching Layer", type: "feature", priority: "p1" })
Response: { plan_id: "plan-abc123", file_path: "docs/plans/plan-api-caching-layer.md" }

Agent: "Add research findings to the plan"

MCP Call: plan_update_markdown({
  plan_id: "plan-abc123",
  section: "research",
  content: "### Architecture Analysis\n- Redis already in stack...\n..."
})

Agent: "Create first batch for infrastructure setup"

MCP Call: plan_add_batch({
  plan_id: "plan-abc123",
  batch: {
    name: "Infrastructure Setup",
    description: "Deploy and configure Redis cluster",
    tasks: [
      {
        title: "Deploy Redis cluster (3 nodes)",
        context: "Use docker-compose to deploy...",
        success_criteria: ["Cluster running on ports 6379-6381", "Health checks passing"],
        estimated_effort_hours: 2
      }
    ]
  }
})

Agent: "Validate the plan"

MCP Call: plan_validate({ plan_id: "plan-abc123" })
Response: { valid: true, batches: { "batch-infra": { state: "ready", can_import: true } } }

Agent: "Save the plan"

MCP Call: plan_save({ plan_id: "plan-abc123", commit_message: "Initial plan with infra batch" })
Response: { success: true, version: 2 }

Agent: "The plan is ready. Human should now review and approve batches for execution."

NOTE: Agent does NOT call batch_import. Human clicks "Import Batch" button in UI to approve each batch.
```

### Example 2: Task Monitoring & Debugging

```
Agent: "What tasks are currently blocked?"

MCP Call: task_list({ status: "blocked", limit: 10 })
Response: { tasks: [{ id: "task-123", title: "Deploy Redis", status: "blocked", ... }] }

Agent: "Why is task-123 blocked?"

MCP Call: task_get({ task_id: "task-123", include_logs: true })
Response: {
  task: { ... },
  blocking_reason: "Docker container failed to start",
  logs: [...]
}

Agent: "Get the last 50 lines of logs"

MCP Call: task_get_logs({ task_id: "task-123", tail_lines: 50 })
Response: { logs: [...] }

Agent: "Unblock the task, the issue was a port conflict which is now resolved"

MCP Call: task_unblock({
  task_id: "task-123",
  resolution_notes: "Port conflict resolved, cleared 6379",
  retry_immediately: true
})
Response: { success: true, new_status: "pending" }
```

### Example 3: Bot Monitoring

```
Agent: "Are all dev-bots healthy?"

MCP Call: bot_heartbeat_status({})
Response: {
  healthy: [{ id: "bot-1", ... }, { id: "bot-2", ... }],
  unhealthy: [{ id: "bot-3", last_heartbeat: "2min ago", ... }],
  alerts: [{ bot_id: "bot-3", message: "Heartbeat timeout" }]
}

Agent: "What is bot-3 working on?"

MCP Call: bot_get_assigned_task({ bot_id: "bot-3" })
Response: { task: { id: "task-456", title: "Implement cache middleware", ... } }

Agent: "Check bot-3 logs"

MCP Call: bot_get_logs({ bot_id: "bot-3", tail_lines: 100 })
Response: { logs: ["Agent is stuck in infinite loop..."] }

Agent: "Terminate bot-3 and requeue its task"

MCP Call: bot_terminate({
  bot_id: "bot-3",
  reason: "Infinite loop detected in agent output",
  requeue_task: true
})
Response: { success: true, container_stopped: true, task_requeued: true }
```

### Example 4: PR Evaluation

```
Agent: "Check if PR #42 is ready to merge"

MCP Call: pr_get_status({ pr_number: 42 })
Response: {
  can_merge: false,
  gates: [
    { name: "base_branch_updated", status: "passed" },
    { name: "no_conflicts", status: "passed" },
    { name: "ci_checks_passing", status: "failed", blocking: true },
    ...
  ]
}

Agent: "What's blocking the merge?"

MCP Call: pr_get_blocking_issues({ pr_number: 42 })
Response: {
  blocking_gates: [
    {
      gate: "ci_checks_passing",
      reason: "TypeScript compilation failed",
      fingerprint: "ts-error-cannot-find-module",
      suggested_fix: "Run 'npm install' to update dependencies"
    }
  ]
}

Agent: "Trigger a re-evaluation after fixing the issue"

MCP Call: pr_trigger_evaluation({ pr_number: 42, force: true })
Response: { evaluation_id: "eval-789", status: "running", gates: [...] }
```

---

## Testing Strategy

### Unit Tests

```typescript
// backend/src/mcp/__tests__/plans.tools.test.ts
describe("Plan MCP Tools", () => {
  let server: AppMonitorMcpServer;
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    server = new AppMonitorMcpServer({ db, apiBaseUrl: "http://localhost:5000" });
  });

  test("plan_create creates plan with auto-generated file", async () => {
    const result = await server.executeTool("plan_create", {
      name: "Test Plan",
      type: "feature"
    });

    expect(result.content[0].text).toContain("plan_id");
    expect(result.content[0].text).toContain("file_path");
  });

  test("plan_validate enforces immutability", async () => {
    // Create plan, add batch, import batch
    const planId = "plan-test-123";
    // ... setup imported batch ...

    // Try to modify imported batch
    const result = await server.executeTool("plan_update_batch", {
      plan_id: planId,
      batch_id: "batch-imported",
      updates: { name: "New Name" }
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("already imported");
  });
});
```

### Integration Tests

```typescript
// backend/src/mcp/__tests__/integration.test.ts
describe("MCP Server Integration", () => {
  test("full plan workflow: create → add batches → validate → save → import", async () => {
    // Test complete workflow through MCP tools
  });

  test("task monitoring: create → monitor → unblock → complete", async () => {
    // Test task lifecycle
  });

  test("bot control: list → monitor → terminate", async () => {
    // Test bot management
  });
});
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure (3 days)
- [ ] Install MCP SDK and dependencies
- [ ] Create MCP server structure (`backend/src/mcp/`)
- [ ] Implement base server with tool registration
- [ ] Add authentication middleware
- [ ] Add validation middleware
- [ ] Write server startup script

### Phase 2: Plan Tools (2 days)
- [ ] Implement all 12 plan management tools
- [ ] Add immutability enforcement
- [ ] Add dependency cycle detection
- [ ] Write unit tests for plan tools

### Phase 3: Task & Bot Tools (2 days)
- [ ] Implement 8 task operation tools
- [ ] Implement 6 dev-bot control tools
- [ ] Add permission checks
- [ ] Write unit tests

### Phase 4: PR & System Tools (1.5 days)
- [ ] Implement 4 PR evaluation tools
- [ ] Implement 5 system diagnostic tools
- [ ] Write unit tests

### Phase 5: Integration & Documentation (1.5 days)
- [ ] Write integration tests
- [ ] Test with Claude Desktop
- [ ] Test with Codex CLI
- [ ] Document all tools in `docs/guides/mcp-server-reference.md`
- [ ] Add usage examples
- [ ] Update admin bot documentation

**Total: 10 days**

---

## Success Criteria

**Functional:**
- [ ] All 35+ tools working correctly
- [ ] Immutability enforced for plan batches
- [ ] Permission checks prevent unauthorized operations
- [ ] Works with Claude Desktop, Codex CLI, and interactive admin bot
- [ ] All tools return structured responses with clear errors

**Performance:**
- [ ] Tool invocation latency < 200ms (excluding API calls)
- [ ] Validation tools < 500ms
- [ ] Batch import tools < 2s for 10 tasks

**Quality:**
- [ ] 100% test coverage for tool implementations
- [ ] Comprehensive error messages
- [ ] Full Zod schema validation
- [ ] Complete documentation

---

## Benefits Over Direct API Access

| Aspect | Direct REST API | MCP Server |
|--------|----------------|------------|
| **Agent Compatibility** | HTTP only | Any MCP-compatible AI |
| **Type Safety** | Manual validation | Zod schemas |
| **Discoverability** | Must read docs | Tools auto-discovered |
| **Error Handling** | HTTP status codes | Structured error objects |
| **Complex Operations** | Multiple API calls | Single tool call |
| **Permissions** | Per-endpoint auth | Tool-level checks |
| **Immutability** | Manual checks | Enforced automatically |

---

## Future Enhancements

### Advanced Features
- Real-time tool result streaming (for long-running operations)
- Tool composition (combine multiple tools into workflows)
- Batch operations (execute multiple tools in single call)
- Conditional tool execution (if-then logic in tool calls)

### Additional Tool Categories
- **GitHub Integration:** PR review, issue creation, branch management
- **Metrics & Analytics:** Query historical data, generate reports
- **Configuration Management:** Update system settings, toggle features
- **Deployment Control:** Trigger blue-green deployments, rollbacks

---

## Conclusion

The App Monitor MCP Server provides a **universal, type-safe, and structured interface** for AI agents to interact with the development automation system. By exposing 35+ specialized tools across plan management, task operations, bot control, PR evaluation, and system diagnostics, it enables seamless debugging, troubleshooting, maintenance, and standard process operations.

**Key Advantages:**
1. ✅ Works with any MCP-compatible AI (Claude, Codex, Gemini, future agents)
2. ✅ Enforces immutability and permissions at the tool level
3. ✅ Provides rich, structured responses with context and next-step guidance
4. ✅ Reduces complexity for agents (single tool call vs. multiple API calls)
5. ✅ Future-proof extensible architecture

**Ready for implementation.**

---

## Related Documentation

- **Multi-Phase Plan System:** `docs/technicalDesigns/multi-phase-plan-system.md`
- **Master Design Intent:** `docs/architecture/master-design-intent.md`
- **Dev-Bots Overview:** `docs/architecture/dev-bots-overview.md`
- **API Reference:** `docs/guides/api-reference.md`
