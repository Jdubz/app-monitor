# MCP Server Documentation

This directory contains the approved MCP server design for App Monitor.

---

## 📋 Start Here

**Quick Summary:** [MCP_SERVER_APPROVAL_SUMMARY.md](./MCP_SERVER_APPROVAL_SUMMARY.md)
- All 24 approved tools listed
- Key design decisions
- Security model
- Implementation timeline

**Full Specification:** [MCP_SERVER_IMPLEMENTATION_SPEC.md](./MCP_SERVER_IMPLEMENTATION_SPEC.md)
- Complete tool specifications with input/output schemas
- Architecture details (embedded in backend)
- Access control implementation
- Deployment configuration
- Testing checklist

---

## 📊 Approval Results

- **Date:** 2025-11-17
- **Status:** ✅ ALL TOOLS APPROVED
- **Original Proposal:** 35 tools
- **Approved:** 24 tools
- **Removed:** 11 tools (redundant/unsound)

---

## 🏗️ Architecture

**MCP Server Location:** Embedded in backend (`backend/src/mcp/`)

**Deployment:** Blue-green with backend (temporary reconnection during rollover)

**Access Control:**
- Production MCP: Admin bot only
- Dev-Bot Test MCP: Full access in isolated container
- Dev-Bot Production: Limited REST API only

---

## 🛠️ Tool Categories

1. **Plan Management:** 11 tools (create, update, validate, save, progress)
2. **Task Operations:** 6 tools (create, get, list, unblock, cancel, report)
3. **Dev-Bot Control:** 4 tools (list, status, recover, heartbeat)
4. **PR Evaluation:** 2 tools (trigger eval, get blocking issues)
5. **System Diagnostics:** 1 tool (comprehensive health check)

---

## 📚 Related Documents

- **Plan System Design:** [multi-phase-plan-system.md](./multi-phase-plan-system.md)
- **Current MCP Server Design:** [app-monitor-mcp-server.md](./app-monitor-mcp-server.md)
- **Master Design Intent:** [../architecture/master-design-intent.md](../architecture/master-design-intent.md)

---

## 🔧 Codex CLI Configuration

The MCP server is accessed via Codex CLI. Configuration is stored in `~/.codex/config.toml`.

### Development Configuration

```toml
# App Monitor MCP Server - Development
[mcp_servers.app-monitor-dev]
type = "stdio"
command = "node"
args = ["/home/<user>/Development/app-monitor/backend/dist/mcp/start.js"]
startup_timeout_ms = 15000

[mcp_servers.app-monitor-dev.env]
APP_MONITOR_MCP_USER_ROLE = "admin"
NODE_ENV = "development"
DATABASE_PATH = "/home/<user>/Development/app-monitor/backend/data/app-monitor.db"
```

### Production Configuration (Blue/Green Aware)

Production uses `/opt/app-monitor/current` symlink that points to the active release (e.g., `/opt/app-monitor/releases/20251122_143052`). This allows the MCP server to automatically use the correct release after deployments.

```toml
# App Monitor MCP Server - Production (blue/green aware via 'current' symlink)
[mcp_servers.app-monitor-prod]
type = "stdio"
command = "node"
args = ["/opt/app-monitor/current/backend/dist/mcp/start.js"]
startup_timeout_ms = 15000

[mcp_servers.app-monitor-prod.env]
APP_MONITOR_MCP_USER_ROLE = "admin"
NODE_ENV = "production"
DATABASE_PATH = "/opt/app-monitor/current/backend/data/app-monitor.db"
```

### Symlink Detection

The MCP server entry point (`backend/src/mcp/start.ts`) uses `realpathSync` to handle symlinks correctly:

```typescript
// Use realpath comparison to handle symlinks (e.g., /opt/app-monitor/current -> releases/xxx)
const thisFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1];
const isDirectExecution = thisFile === entryFile ||
  realpathSync(thisFile) === realpathSync(entryFile);
```

This is necessary because `import.meta.url` resolves to the real path while `process.argv[1]` may contain the symlink path.

---

## 🤖 Admin Bot Integration

The Admin Bot chat interface uses Codex CLI with persistent sessions via thread resumption.

### Session Architecture

1. **First message**: Creates new codex thread with `codex exec --json <message>`
2. **Subsequent messages**: Resumes thread with `codex exec resume <thread_id> --json <message>`
3. **Thread ID**: Captured from JSON output `{"type": "thread.started", "thread_id": "..."}`

### Codex CLI Flags

The AdminBotService uses these flags:

- `--dangerously-bypass-approvals-and-sandbox` - Allows full execution without approval prompts
- `--skip-git-repo-check` - Allows running from any directory
- `--cd <directory>` - Sets working directory (defaults to `~/Development`)
- `--json` - Outputs structured JSON for parsing thread IDs and formatting responses

### Implementation Files

- **Service**: `backend/src/services/AdminBotService.ts` - Manages codex sessions
- **Routes**: `backend/src/routes/admin-bot/chat.routes.ts` - SSE streaming endpoints
- **MCP Entry**: `backend/src/mcp/start.ts` - MCP server entry point

---

## ✅ Implementation Status

| Component | Status |
|-----------|--------|
| MCP Server (`backend/src/mcp/`) | ✅ Implemented |
| Core Tools (24 approved) | ✅ Implemented |
| Admin Bot Service | ✅ Implemented |
| Codex Configuration | ✅ Documented |
| Blue/Green Deployment | ✅ Working |

---

## 📚 Related Documents

- **Plan System Design:** [multi-phase-plan-system.md](./multi-phase-plan-system.md)
- **Current MCP Server Design:** [app-monitor-mcp-server.md](./app-monitor-mcp-server.md)
- **Admin Bot Implementation:** [../plans/admin-bot-chat-interface-plan.md](../plans/admin-bot-chat-interface-plan.md)
- **Master Design Intent:** [../architecture/master-design-intent.md](../architecture/master-design-intent.md)
