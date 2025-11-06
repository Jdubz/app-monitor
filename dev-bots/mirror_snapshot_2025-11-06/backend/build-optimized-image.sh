#!/bin/bash
# ==============================================================================
# Build Optimized Claude Worker Docker Image
# ==============================================================================
# Builds the optimized multi-stage Docker image with pre-installed dependencies

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🏗️  Building Optimized Claude Worker Docker Image...${NC}"
echo ""

# Navigate to project root
cd "$(dirname "$0")/../.."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Create .dockerignore if it doesn't exist
if [ ! -f "claude-workers/docker/.dockerignore" ]; then
    echo -e "${YELLOW}⚠️  .dockerignore not found. Build may be slower.${NC}"
fi

# Show build context size
echo -e "${BLUE}📊 Analyzing build context...${NC}"
BUILD_CONTEXT_SIZE=$(du -sh . 2>/dev/null | cut -f1)
echo -e "Build context size: ${BUILD_CONTEXT_SIZE}"
echo ""

# Start build timer
START_TIME=$(date +%s)

# Build the image with BuildKit for better caching
echo -e "${BLUE}🔨 Building image with multi-stage optimization...${NC}"
DOCKER_BUILDKIT=1 docker build \
  -f claude-workers/docker/Dockerfile \
  -t claude-worker:latest \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --progress=plain \
  .

# Calculate build time
END_TIME=$(date +%s)
BUILD_TIME=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}✅ Claude Worker image built successfully!${NC}"
echo ""

# Show image details
echo -e "${BLUE}📦 Image details:${NC}"
docker images | grep claude-worker | head -2

echo ""
echo -e "${BLUE}⏱️  Build time: ${BUILD_TIME}s${NC}"

# Verify Claude CLI installation
echo ""
echo -e "${BLUE}🔍 Verifying Claude CLI installation...${NC}"
if docker run --rm claude-worker:latest which claude > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Claude CLI: $(docker run --rm claude-worker:latest which claude)${NC}"
else
    echo -e "${RED}⚠️  Claude CLI not found in PATH${NC}"
fi

# Test container startup time
echo ""
echo -e "${BLUE}⚡ Testing container startup time...${NC}"
STARTUP_START=$(date +%s%N)
docker run --rm claude-worker:latest echo "Container started successfully" > /dev/null
STARTUP_END=$(date +%s%N)
STARTUP_TIME=$(( (STARTUP_END - STARTUP_START) / 1000000 ))
echo -e "${GREEN}✅ Container startup time: ${STARTUP_TIME}ms${NC}"

# Show image size
echo ""
echo -e "${BLUE}📊 Image size:${NC}"
echo -e "claude-worker:latest → $(docker images claude-worker:latest --format "{{.Size}}")"

echo ""
echo -e "${GREEN}🎉 Build complete! Image ready for use.${NC}"
echo ""
echo -e "${BLUE}💡 Usage:${NC}"
echo "  docker run --rm -it claude-worker:latest"
echo ""
echo -e "${BLUE}💡 With project mounted:${NC}"
echo "  docker run --rm -it \\"
echo "    -v \$(pwd):/app:ro \\"
echo "    -v \$(pwd)/worktrees:/app/worktrees:rw \\"
echo "    claude-worker:latest"
