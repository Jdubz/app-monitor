# AI Agent Interface Research - Findings Summary
**Date:** 2025-11-17
**Focus:** Codex integration for plan file editing with rapid streaming

---

## KEY FINDINGS

### 1. Model Context Protocol (MCP) - HIGHLY RELEVANT

**What It Is:**
- Open standard by Anthropic for AI agent-tool integration
- Universal adapter ("USB-C for AI apps")
- JSON-RPC 2.0 based, bidirectional messaging
- Enables tools, resources, and prompts as services

**Architecture:**
- MCP Host: AI agent (Claude, Copilot, custom agents)
- MCP Client: Communication bridge
- MCP Server: Exposes tools/resources
- Protocol: JSON-RPC 2.0 over stdio/SSE/WebSocket

**Key Features:**
- Tool discovery via manifests (/.well-known/mcp.json)
- Stateful connections with capability negotiation
- Explicit user consent and security
- Extensible - new tools without changing integration

**For Our Use Case:**
✅ Perfect for Codex plan editing integration
✅ Structured tool API (plan_update_yaml_field, plan_add_batch, etc.)
✅ Already adopted by major AI platforms
✅ TypeScript/JavaScript SDK available

---

### 2. OpenAI Codex Capabilities & Limitations

**Streaming Capabilities:**
- Real-time log streaming to stderr
- Final response to stdout
- History passing for session management
- Long context (200k tokens for codex-mini)

**File Editing:**
- Can read/modify/create files
- Requires explicit permission flags (--full-auto, --sandbox danger-full-access)
- Default: sandboxed, read-only or workspace-write

**Non-Interactive Mode Limitations:**
- No conversational loop (single invocation)
- Must explicitly enable file edits
- Sandboxing restrictions (macOS: Seatbelt, Linux: Docker)
- Error handling limited without human review

**Key Insight:**
❌ Native file editing is limited in non-interactive mode
✅ MCP structured tool approach would be MUCH better than raw file access

---

### 3. Streaming Protocol Comparison (2024)

| Protocol | Direction | Scalability | Browser | Latency | Best For |
|----------|-----------|-------------|---------|---------|----------|
| **SSE** | One-way | High | 98%+ | Low | AI response streaming to UI |
| **WebSocket** | Bi-directional | Medium | 99%+ | Very Low | Interactive agent chat |
| **gRPC** | Bi/uni | Very High | No (needs bridge) | Very Low | Backend agent-to-agent |

**Recommendation for Our System:**
- **SSE**: For streaming AI responses to UI (plan validation results, progress)
- **WebSocket**: Already in use for UI updates - keep using
- **MCP over stdio**: For Codex tool integration (plan editing)

**Industry Trend (2024):**
- MCP moving from SSE to "Streamable HTTP" for resumable, stateless streaming
- SSE preferred for AI chat UIs (simple, scalable, reliable)
- gRPC for backend microservices/agent clustering

---

### 4. MCP Server for Plan Editing - RECOMMENDED APPROACH

**Concept:**
Instead of Codex editing files directly, expose MCP tools for structured plan operations:

```typescript
// MCP tools for plan editing
tools: [
  {
    name: "plan_read_section",
    description: "Read a specific section of a plan file",
    inputSchema: { plan_id, section }
  },
  {
    name: "plan_update_yaml_field",
    description: "Update a YAML field in plan frontmatter",
    inputSchema: { plan_id, field_path, value }
  },
  {
    name: "plan_append_batch",
    description: "Add a new task batch to plan",
    inputSchema: { plan_id, batch_definition }
  },
  {
    name: "plan_add_task_to_batch",
    description: "Add a task to existing batch",
    inputSchema: { plan_id, batch_id, task_definition }
  },
  {
    name: "plan_validate",
    description: "Validate plan without saving",
    inputSchema: { plan_id }
  },
  {
    name: "plan_save",
    description: "Save plan file to database",
    inputSchema: { plan_id, commit_message }
  }
]
```

**Benefits:**
✅ Codex doesn't need direct file access
✅ Structured operations prevent errors
✅ Validation built into each operation
✅ Immutability enforced at tool level
✅ Can be used by ANY MCP-compatible agent (Claude, Copilot, custom)

---

## RECOMMENDED IMPLEMENTATION

### Option 1: MCP Server (BEST)

**Architecture:**
```
Codex/Agent <--> MCP Client <--> MCP Server <--> Plan API
                 (JSON-RPC)      (stdio/SSE)     (REST/DB)
```

**Implementation:**
1. Build MCP server in TypeScript
2. Expose structured plan editing tools
3. Use @modelcontextprotocol/sdk
4. Run as service alongside backend
5. Codex calls tools instead of editing files

**Pros:**
- Clean separation of concerns
- Works with multiple AI agents
- Structured, validated operations
- No file system access needed
- Industry standard

**Cons:**
- New service to maintain
- Learning curve for MCP SDK
- Additional infrastructure

**Estimated Effort:** 2-3 days

---

### Option 2: Structured Edit API (FALLBACK)

**Architecture:**
```
Codex <--> HTTP REST API <--> Plan Services
           (POST /plan/operations)
```

**Implementation:**
1. Create endpoint: POST /api/plans/:planId/operations
2. Accept array of structured edit operations
3. Apply operations atomically
4. Return validation results

**Pros:**
- Simpler than MCP (just REST endpoint)
- No new infrastructure
- Familiar HTTP patterns

**Cons:**
- Less elegant than MCP
- Not reusable by other agents
- Custom protocol (not standard)

**Estimated Effort:** 1 day

---

### Option 3: SSE Streaming Edit API (COMPLEX)

**Architecture:**
```
Codex <--> SSE Stream <--> Backend
    sends edit operations ->
         <- streams results
```

**Not recommended:** Overly complex for our use case

---

## FINAL RECOMMENDATION

**Primary Approach: MCP Server** (Option 1)

**Rationale:**
1. Industry standard - future-proof
2. Works with Codex, Claude, and any MCP-compatible agent
3. Structured, validated operations prevent errors
4. Immutability enforcement at tool level
5. Aligns with design document's Codex research note

**Implementation Plan:**
1. Create `backend/src/services/mcpServer/` directory
2. Implement MCP server using @modelcontextprotocol/sdk
3. Define plan editing tools (read, update, validate, save)
4. Run MCP server as separate process
5. Configure Codex to use MCP server for plan editing
6. Test with Codex CLI

**Fallback:** If MCP proves too complex, implement Option 2 (Structured Edit API)

