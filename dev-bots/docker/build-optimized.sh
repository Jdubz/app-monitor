#!/bin/bash
# ==============================================================================
# Build Script for Optimized Dev-Bot Image
# ==============================================================================
# Builds the dev-bot Docker image with both Claude and Codex CLIs
# and pre-configured MCP servers for enhanced bot capabilities
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="${IMAGE_NAME:-dev-bot}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DOCKERFILE="${DOCKERFILE:-dev-bots/docker/Dockerfile.optimized}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🐳 Building Optimized Dev-Bot Docker Image${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${YELLOW}Image:${NC}      $IMAGE_NAME:$IMAGE_TAG"
echo -e "  ${YELLOW}Dockerfile:${NC} $DOCKERFILE"
echo -e "  ${YELLOW}Context:${NC}    $BUILD_CONTEXT"
echo ""

# Check if Dockerfile exists
if [ ! -f "$DOCKERFILE" ]; then
    echo -e "${RED}❌ Error: Dockerfile not found at $DOCKERFILE${NC}"
    exit 1
fi

# Check if running from project root
if [ ! -d "dev-bots" ] || [ ! -d "backend" ]; then
    echo -e "${RED}❌ Error: This script must be run from the project root directory${NC}"
    echo -e "   Current directory: $(pwd)"
    exit 1
fi

# Build the image
echo -e "${YELLOW}📦 Building Docker image...${NC}"
echo ""

if docker build \
    -f "$DOCKERFILE" \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    --progress=plain \
    "$BUILD_CONTEXT"; then

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Show image info
    echo -e "${YELLOW}📊 Image Information:${NC}"
    docker images "$IMAGE_NAME:$IMAGE_TAG" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    echo ""

    # Verify installation
    echo -e "${YELLOW}🔍 Verifying installation...${NC}"
    echo ""

    if docker run --rm "$IMAGE_NAME:$IMAGE_TAG" /home/node/verify-install.sh; then
        echo ""
        echo -e "${GREEN}✅ All components verified successfully!${NC}"
        echo ""
        echo -e "${BLUE}🚀 Ready to use! Run with:${NC}"
        echo -e "   ${YELLOW}docker run --rm -it -v \$(pwd):/workspace:rw $IMAGE_NAME:$IMAGE_TAG${NC}"
    else
        echo ""
        echo -e "${RED}❌ Verification failed. Check the build output above.${NC}"
        exit 1
    fi
else
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ Build failed!${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📝 Next Steps:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "1. ${YELLOW}Update devBotsManager${NC} to use this image:"
echo -e "   Edit backend/src/services/devBotsManager.ts"
echo -e "   Set image name to: ${GREEN}$IMAGE_NAME:$IMAGE_TAG${NC}"
echo ""
echo -e "2. ${YELLOW}Restart backend server${NC} to pick up changes:"
echo -e "   cd backend && npm run dev"
echo ""
echo -e "3. ${YELLOW}Test agent rotation${NC} with both Claude and Codex:"
echo -e "   curl -X POST http://localhost:5000/api/dev-bots/assign"
echo ""
echo -e "4. ${YELLOW}Monitor agent comparison metrics${NC}:"
echo -e "   curl http://localhost:5000/api/dev-bots/agent-comparison"
echo ""
