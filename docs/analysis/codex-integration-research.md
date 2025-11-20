# Analysis: Codex Plan Editing Integration

## Investigation
- Surveyed OpenAI Codex CLI capabilities (streaming, file access, sandbox restrictions) under the current dev-bot harness (Nov 17, 2025).
- Reviewed Anthropic’s Model Context Protocol (MCP) spec, approved tool list, and SDK feasibility for embedding inside the backend.
- Compared streaming transports (SSE, WebSocket, gRPC) against our existing realtime stack to identify lowest-friction integration.

## Findings
1. **MCP Is the Correct Interface Layer**
   - Provides structured tools (`plan_read_section`, `plan_update_yaml_field`, `plan_append_batch`, etc.) instead of raw file edits.
   - Already approved in `docs/technicalDesigns/MCP_SERVER_IMPLEMENTATION_SPEC.md`, compatible with Claude, Codex, Copilot.
2. **Direct Codex File Editing Is Unsafe in Non-Interactive Runs**
   - Requires `--full-auto` and relaxed sandboxes, yet still lacks validation hooks; failures present as opaque stderr logs.
   - Breaks Documentation System mandates because legacy files must be immutable once imported.
3. **Streaming Stack Decisions**
   - Continue using SSE for UI response streaming and WebSocket for dashboard updates.
   - MCP over stdio (or Streamable HTTP once available) is sufficient for agent ↔ tool calls, no need for a bespoke streaming API.
4. **Fallback Path (if MCP slips)**
   - A REST `/api/plans/:planId/operations` endpoint can accept atomic edit batches, but sacrifices reuse for other agents and reintroduces bespoke validation.

## Action Items
- [ ] **Platform Tooling · P0:** Implement the MCP server (TypeScript + `@modelcontextprotocol/sdk`) exposing the plan-editing tools listed above, wired directly to the plan service APIs.
- [ ] **Dev-Bot Infrastructure · P1:** Update Codex agent configuration to route all plan mutations through MCP tools; disable workspace-write mode for Codex once MCP is live.
- [ ] **Frontend/Docs · P2:** Document the streaming stack choices (SSE for UI, MCP for tools) in `docs/technicalDesigns/app-monitor-mcp-server.md` so future agents follow the same path.

## Delete After
2025-12-17 (30 days after initial research; delete sooner once MCP server ships)
