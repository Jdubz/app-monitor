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
- **Original MCP Proposal:** [app-monitor-mcp-server-ORIGINAL.md](./app-monitor-mcp-server-ORIGINAL.md) (backup)
- **Master Design Intent:** [../architecture/master-design-intent.md](../architecture/master-design-intent.md)

---

## ✅ Next Steps

1. Read [MCP_SERVER_IMPLEMENTATION_SPEC.md](./MCP_SERVER_IMPLEMENTATION_SPEC.md)
2. Install dependencies: `@modelcontextprotocol/sdk`, `zod`
3. Create `backend/src/mcp/` directory structure
4. Begin implementation (estimated 10 days)

---

**All tools reviewed and approved. Ready for implementation.**
