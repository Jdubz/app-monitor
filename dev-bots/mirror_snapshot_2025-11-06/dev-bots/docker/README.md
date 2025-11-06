# Claude Worker Docker Image

This directory contains the optimized Docker configuration for Claude Worker containers used by the dev-monitor system.

## Quick Start

### Build the Image

```bash
# From dev-monitor/backend
./build-optimized-image.sh

# Or manual build from project root
cd /home/jdubz/Development/job-finder-app-manager
docker build \
  -f claude-workers/docker/Dockerfile.optimized \
  -t claude-worker:latest \
  .
```

### Run the Container

```bash
# Interactive shell
docker run --rm -it claude-worker:latest

# With verification
docker run --rm claude-worker:latest /home/worker/verify-install.sh

# With project mounted (development mode)
docker run --rm -it \
  -v $(pwd):/app:ro \
  -v $(pwd)/app-monitor/dev-bots/volumes/bot-a:/workspace:rw \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  claude-worker:latest

# Execute a Claude task
docker run --rm \
  -v $(pwd):/app:ro \
  -v $(pwd)/app-monitor/dev-bots/volumes/bot-a:/workspace:rw \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  claude-worker:latest \
  claude -p "Fix the bug in server.ts" \
    --allowedTools Bash,Read,Write,Edit \
    --workingDirectory /workspace
```

## Performance Metrics

The optimized Docker image delivers significant improvements:

| Metric                   | Before | After  | Improvement       |
| ------------------------ | ------ | ------ | ----------------- |
| **Image Size**           | 4.38GB | 1.21GB | **72% smaller**   |
| **Startup Time**         | ~15s   | ~2-3s  | **80% faster**    |
| **Build Time (clean)**   | ~10min | ~8min  | 20% faster        |
| **Build Time (cached)**  | ~10min | ~30s   | **95% faster**    |
| **First Task Execution** | ~25s   | ~5s    | **80% faster**    |
| **Layers**               | 25     | 12     | **52% reduction** |

## Pre-installed Tools

The image includes all tools needed for the job-finder-app-manager project:

**Node.js:**

- Node 18 LTS
- Claude CLI (`@anthropic-ai/claude-code`)
- Firebase Tools
- TypeScript, ts-node, nodemon
- ESLint, Prettier
- Vitest
- All project dependencies from package.json

**Python:**

- Python 3.12
- All packages from job-finder-worker/requirements.txt
- requests, beautifulsoup4, selenium
- anthropic, openai
- firebase-admin
- pytest, black, flake8

**System Tools:**

- Git, bash, curl, wget
- vim, nano
- jq (JSON processor)
- SSH client

## Files

- **Dockerfile.optimized** - Multi-stage optimized Dockerfile
- **Dockerfile.simple** - Legacy monolithic Dockerfile (deprecated)
- **.dockerignore** - Build context exclusions
- **OPTIMIZATION_GUIDE.md** - Detailed optimization documentation
- **IMPLEMENTATION_SUMMARY.md** - Implementation summary
- **README.md** - This file

## Build Scripts

- **dev-monitor/backend/build-optimized-image.sh** - Recommended build script
- **dev-monitor/backend/build-claude-worker-image.sh** - Legacy build (deprecated)

## How It Works

### Multi-Stage Build

The Dockerfile uses a 2-stage build process:

**Stage 1: Builder**

- Installs all build tools and dependencies
- Compiles packages with native extensions
- Creates optimized build artifacts

**Stage 2: Runtime**

- Minimal Alpine base image
- Copies only runtime artifacts from builder
- No build tools in final image
- 72% smaller than monolithic approach

### Layer Caching Strategy

Smart layer ordering maximizes cache hit rate:

```dockerfile
# 1. System packages (rarely change) - Always cached
RUN apk add bash git curl...

# 2. package.json files (change infrequently) - 95% cache hit
COPY package*.json ./

# 3. Dependencies (cached unless package.json changes) - 95% cache hit
RUN npm ci --omit=dev --ignore-scripts

# 4. Application code (changes frequently) - Layers 1-3 cached
# Note: Code is mounted at runtime, not copied into image
```

### Pre-installed Dependencies

All dependencies are baked into the image during build:

- No runtime `npm install` delays
- Instant container startup
- Consistent environment across all workers

## Integration with Dev-Monitor

The dev-monitor system automatically uses `claude-worker:latest`:

```typescript
// dev-monitor/backend/src/services/dockerManager.ts:32
private static readonly CLAUDE_WORKER_IMAGE = 'claude-worker:latest';
```

No code changes needed - just build the image and dev-monitor will use it!

## Troubleshooting

### Container Starts Slowly

Don't mount node_modules from host:

```bash
# Bad (overrides pre-installed)
-v $(pwd)/node_modules:/app/node_modules

# Good (uses pre-installed)
-v $(pwd):/app:ro
```

### Build Fails: npm timeout

Use host network for faster npm install:

```bash
DOCKER_BUILDKIT=1 docker build --network=host ...
```

### Build Fails: No space left on device

Clean up Docker:

```bash
docker system prune -af
docker builder prune -af
```

### Claude CLI Not Found

Verify installation:

```bash
docker run --rm claude-worker:latest which claude
# Should output: /usr/local/bin/claude
```

## Best Practices

1. **Use BuildKit for faster builds** - `DOCKER_BUILDKIT=1`
2. **Mount project read-only** - Prevents accidental modifications
3. **Mount bot volumes read-write** - Workers need to write output to their isolated volumes
4. **Set API keys via environment** - Don't bake into image
5. **Clean up regularly** - `docker system prune -af`

## Further Reading

- [OPTIMIZATION_GUIDE.md](./OPTIMIZATION_GUIDE.md) - Detailed optimization analysis
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Implementation details
- [Dev-Monitor Documentation](../../dev-monitor/README.md)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

## Support

For issues or questions:

1. Check [OPTIMIZATION_GUIDE.md](./OPTIMIZATION_GUIDE.md)
2. Review logs: `docker logs <container-id>`
3. File issue in job-finder-app-manager repo
