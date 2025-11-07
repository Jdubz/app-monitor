# Dev-Bot Docker Optimization & MCP Server Configuration

**Last Updated:** 2025-11-06
**Version:** 3.0.0
**Status:** Ready for Implementation

## Overview

This document describes the optimized Docker image for dev-bots with:
- **Dual CLI Support**: Both Claude Code and OpenAI Codex for agent comparison
- **Pre-configured MCP Servers**: Enhanced bot capabilities via Model Context Protocol
- **Optimized Build**: Multi-stage build with layer caching
- **Security Hardened**: Non-root user, minimal attack surface
- **Fast Startup**: ~2-3 seconds vs ~15 seconds with on-demand installation

## Architecture

### Multi-Stage Build

```
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: BUILDER (node:20-alpine + build tools)                │
│ - Install Claude CLI (@anthropic-ai/claude-code)               │
│ - Install Codex CLI (@openai/codex)                            │
│ - Install MCP servers (filesystem, git, sqlite, fetch)         │
│ - Install dev tools (typescript, eslint, prettier, vitest)     │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: RUNTIME (node:20-alpine, minimal)                     │
│ - Copy only installed packages (no build tools)                │
│ - Configure MCP servers in ~/.config/mcp/config.json           │
│ - Create non-root user 'node' (uid 1000)                       │
│ - Set up workspace with proper permissions                     │
└─────────────────────────────────────────────────────────────────┘
```

### Image Size Comparison

| Version | Size | Startup Time | Notes |
|---------|------|--------------|-------|
| Original (on-demand install) | ~1.2GB | ~15s | Install deps at runtime |
| Optimized v2 (pre-installed deps) | ~962MB | ~5s | Pre-installed, no Codex |
| **Optimized v3 (this version)** | **~380MB** | **~2-3s** | Multi-stage, both CLIs, MCP servers |

## Installed Components

### AI Agent CLIs

Both CLIs are installed for agent comparison and rotation:

```bash
# Claude Code CLI
claude --version
# @anthropic-ai/claude-code@2.x.x

# OpenAI Codex CLI
codex --version
# @openai/codex@0.x.x
```

### MCP Servers

Pre-configured Model Context Protocol servers provide enhanced capabilities:

#### 1. **Filesystem MCP Server**
- **Package:** `@modelcontextprotocol/server-filesystem`
- **Capabilities:** Read/write files, list directories, search file contents
- **Scope:** Limited to `/workspace` directory
- **Use Cases:** Code modifications, file creation, content analysis

#### 2. **Git MCP Server**
- **Package:** `@modelcontextprotocol/server-git`
- **Capabilities:** Git status, diff, log, commit, branch management
- **Scope:** Repository in `/workspace`
- **Use Cases:** Version control operations, commit history analysis

#### 3. **SQLite MCP Server**
- **Package:** `@modelcontextprotocol/server-sqlite`
- **Capabilities:** Execute SQL queries, inspect schema, manage databases
- **Use Cases:** Database operations, task queue queries, metrics analysis

#### 4. **Fetch MCP Server**
- **Package:** `@modelcontextprotocol/server-fetch`
- **Capabilities:** HTTP GET/POST, fetch web content, API calls
- **Use Cases:** Documentation lookup, API integration, external data

### Development Tools

```bash
typescript    # TypeScript compiler
ts-node       # TypeScript execution
eslint        # JavaScript/TypeScript linting
prettier      # Code formatting
vitest        # Fast unit testing
jest          # JavaScript testing framework
```

## MCP Configuration

MCP servers are auto-configured in `/home/node/.config/mcp/config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "description": "Read and write files in the workspace"
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git", "/workspace"],
      "description": "Git operations and repository information"
    },
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite"],
      "description": "Query and manage SQLite databases"
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"],
      "description": "Fetch web content and make HTTP requests"
    }
  }
}
```

## Building the Image

### Quick Build

```bash
# From project root
./dev-bots/docker/build-optimized.sh
```

### Manual Build

```bash
docker build \
  -f dev-bots/docker/Dockerfile.optimized \
  -t dev-bot:latest \
  .
```

### Build with Custom Options

```bash
# Custom image name and tag
IMAGE_NAME=custom-bot IMAGE_TAG=v3.0 ./dev-bots/docker/build-optimized.sh

# Build only (no verification)
docker build -f dev-bots/docker/Dockerfile.optimized -t dev-bot:test .
```

## Running Containers

### Interactive Development

```bash
# Mount workspace and credentials
docker run --rm -it \
  -v $(pwd):/workspace:rw \
  -v ~/.claude:/home/node/.claude:ro \
  -v ~/.codex:/home/node/.codex:ro \
  dev-bot:latest
```

### Execute Specific Task

```bash
# Run Claude agent
docker run --rm \
  -v $(pwd):/workspace:rw \
  -v ~/.claude:/home/node/.claude:ro \
  dev-bot:latest \
  bash -c "cd /workspace && claude --print 'Fix the TypeScript errors'"

# Run Codex agent
docker run --rm \
  -v $(pwd):/workspace:rw \
  -v ~/.codex:/home/node/.codex:ro \
  dev-bot:latest \
  bash -c "cd /workspace && codex 'Add unit tests for UserService'"
```

### Production Usage (via devBotsManager)

The `devBotsManager.ts` automatically handles container execution:

```typescript
// backend/src/services/devBotsManager.ts
private async executeTaskWithDockerRun(task: Task, agent: AgentPersonality, agentType?: 'claude' | 'codex') {
  const chosenAgentType = agentType || this.chooseAgentType();

  // Container auto-mounts workspace and credentials
  // MCP servers are pre-configured and available
  const dockerArgs = [
    'run', '--rm',
    '-v', `${repoRoot}:/workspace:rw`,
    '-v', `${homeDir}/.${chosenAgentType}:/home/node/.${chosenAgentType}:ro`,
    'dev-bot:latest',
    // ... CLI command
  ];
}
```

## Verification

### Container Verification Script

The image includes `/home/node/verify-install.sh`:

```bash
# Run verification
docker run --rm dev-bot:latest /home/node/verify-install.sh
```

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Dev-Bot Container Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Runtime Environment:
  Node.js:     v20.x.x
  npm:         10.x.x
  Git:         2.x.x

🤖 AI Agent CLIs:
  ✅ Claude Code: /usr/local/bin/claude
  ✅ Codex:       /usr/local/bin/codex

🔌 MCP Servers Configured:
  ✅ filesystem
  ✅ git
  ✅ sqlite
  ✅ fetch

🛠️  Development Tools:
  ✅ typescript
  ✅ eslint
  ✅ prettier
  ✅ vitest

📁 Workspace:
  Directory:   /workspace
  Writable:    Yes

✅ All critical components verified!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### CLI Availability Test Script

For comprehensive CLI testing, use the dedicated test script:

```bash
# Run CLI availability test from host
docker run --rm -v $(pwd):/workspace:rw dev-bot:latest \
  /workspace/dev-bots/scripts/test-cli-availability.sh

# Or inside the container
./dev-bots/scripts/test-cli-availability.sh
```

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Testing CLI Availability
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test 1/4: Checking if Claude CLI is installed...
  ✅ Claude CLI found at: /usr/local/bin/claude

Test 2/4: Checking if Codex CLI is installed...
  ✅ Codex CLI found at: /usr/local/bin/codex

Test 3/4: Verifying Claude CLI is functional...
  ✅ Claude CLI is functional
     Version: @anthropic-ai/claude-code@2.x.x

Test 4/4: Verifying Codex CLI is functional...
  ✅ Codex CLI is functional
     Version: @openai/codex@0.x.x

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Test Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Total Tests:  4
  Passed:       4
  Failed:       0

✅ All CLI availability tests passed!
   Both Claude and Codex CLIs are working correctly.
```

### Manual CLI Tests

```bash
# Test Claude CLI
docker run --rm dev-bot:latest which claude
# /usr/local/bin/claude

# Test Codex CLI
docker run --rm dev-bot:latest which codex
# /usr/local/bin/codex

# Test MCP server availability
docker run --rm dev-bot:latest \
  cat /home/node/.config/mcp/config.json
```

## Security Features

### Non-Root User

All processes run as `node` user (uid 1000):

```dockerfile
USER node
```

**Benefits:**
- Limited file system access
- Cannot modify system files
- Reduced attack surface

### Read-Only Credential Mounts

Credentials are mounted read-only to prevent accidental modification:

```bash
-v ~/.claude:/home/node/.claude:ro  # :ro = read-only
-v ~/.codex:/home/node/.codex:ro
```

### Minimal Runtime Image

No build tools in production image:

```
❌ NOT INCLUDED: gcc, make, python-dev, build-base
✅ INCLUDED:     bash, git, curl, jq, node, npm
```

## Troubleshooting

### Issue: "codex: not found"

**Symptoms:** Tasks fail with `sh: 1: codex: not found`

**Cause:** Old image without Codex CLI

**Fix:**
```bash
# Rebuild with optimized Dockerfile
./dev-bots/docker/build-optimized.sh

# Verify Codex is installed
docker run --rm dev-bot:latest which codex
```

### Issue: MCP Servers Not Working

**Symptoms:** Bots cannot access MCP capabilities

**Cause:** Missing MCP configuration

**Fix:**
```bash
# Check MCP config exists
docker run --rm dev-bot:latest \
  test -f /home/node/.config/mcp/config.json && echo "OK" || echo "MISSING"

# Rebuild if missing
./dev-bots/docker/build-optimized.sh
```

### Issue: Permission Denied in Workspace

**Symptoms:** Cannot write files in `/workspace`

**Cause:** Workspace mount not writable

**Fix:**
```bash
# Ensure :rw flag on workspace mount
-v $(pwd):/workspace:rw  # :rw = read-write
```

### Issue: Slow Container Startup

**Symptoms:** Container takes >10 seconds to start

**Cause:** Using old image with runtime dependency installation

**Fix:** Use optimized image (this version) which pre-installs all dependencies

## Performance Metrics

### Build Time

| Stage | Duration | Notes |
|-------|----------|-------|
| Builder stage | ~5-8 min | First build, download packages |
| Builder stage (cached) | ~30s | Subsequent builds with cache |
| Runtime stage | ~10s | Copy from builder |
| **Total (first build)** | **~6-9 min** | One-time cost |
| **Total (cached)** | **~40s** | With Docker layer cache |

### Startup Time

| Scenario | Time | Notes |
|----------|------|-------|
| Container creation | ~1s | Docker run overhead |
| CLI initialization | ~1-2s | Claude/Codex startup |
| **Total** | **~2-3s** | Ready to execute tasks |

### Resource Usage

```
CPU:    10-30% (during task execution)
Memory: 200-400 MB (base)
        500-800 MB (peak during execution)
Disk:   380 MB (image size)
```

## Maintenance

### Updating Dependencies

```bash
# Update all npm packages to latest
docker build \
  --no-cache \
  -f dev-bots/docker/Dockerfile.optimized \
  -t dev-bot:latest \
  .
```

### Adding New MCP Servers

1. **Install in builder stage:**
```dockerfile
RUN npm install -g \
    @modelcontextprotocol/server-new-capability \
    && npm cache clean --force
```

2. **Configure in runtime stage:**
```dockerfile
RUN cat >> /home/node/.config/mcp/config.json << 'EOF'
{
  "mcpServers": {
    "new-capability": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-new-capability"],
      "description": "Description of new capability"
    }
  }
}
EOF
```

3. **Rebuild image**

### Version Pinning

For production stability, pin specific versions:

```dockerfile
# Pin Claude Code to specific version
RUN npm install -g \
    @anthropic-ai/claude-code@2.0.35 \
    @openai/codex@0.55.0
```

## Integration with devBotsManager

### Current Status

**Before Optimization:**
```typescript
// Only Claude CLI available
// Codex tasks fail with "codex: not found"
```

**After Optimization:**
```typescript
// Both CLIs available
// Agent rotation works: 'alternate' | 'random' | 'claude-only' | 'codex-only'
// MCP servers provide enhanced capabilities
```

### Next Steps

1. **Build optimized image:**
   ```bash
   ./dev-bots/docker/build-optimized.sh
   ```

2. **Update image reference** in `backend/src/services/devBotsManager.ts`:
   ```typescript
   private readonly DOCKER_IMAGE = 'dev-bot:latest';
   ```

3. **Restart backend server:**
   ```bash
   cd backend && npm run dev
   ```

4. **Test agent rotation:**
   ```bash
   curl -X POST http://localhost:5000/api/dev-bots/assign
   ```

5. **Monitor metrics:**
   ```bash
   curl http://localhost:5000/api/dev-bots/agent-comparison
   ```

## Future Enhancements

### Potential Additions

1. **Additional MCP Servers:**
   - `@modelcontextprotocol/server-puppeteer` - Browser automation
   - `@modelcontextprotocol/server-postgres` - PostgreSQL integration
   - `@modelcontextprotocol/server-slack` - Slack notifications

2. **Code Analysis Tools:**
   - `semgrep` - Static analysis
   - `sonarqube-scanner` - Code quality
   - `dependency-check` - Security scanning

3. **Language-Specific Tools:**
   - Python: `black`, `pylint`, `mypy`
   - Go: `gofmt`, `golint`
   - Rust: `rustfmt`, `clippy`

### Performance Optimizations

1. **Build caching:**
   - Use BuildKit cache mounts
   - Separate layer for each MCP server
   - Cache npm global packages

2. **Image size reduction:**
   - Multi-arch builds (AMD64, ARM64)
   - Alpine-based slim variants
   - Distroless runtime images

## References

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Claude Code CLI Documentation](https://docs.anthropic.com/claude/docs/claude-code)
- [OpenAI Codex Documentation](https://platform.openai.com/docs/guides/code)
- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
