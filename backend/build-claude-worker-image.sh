#!/bin/bash
# Build custom Claude Worker Docker image

set -e

echo "🏗️  Building Claude Worker Docker image..."

cd "$(dirname "$0")/../.."

# Build the image with BuildKit
DOCKER_BUILDKIT=1 docker build \
  -f claude-workers/docker/Dockerfile \
  -t claude-worker:latest \
  -t claude-worker:dev \
  .

echo "✅ Claude Worker image built successfully!"
echo ""
echo "Image details:"
docker images | grep claude-worker

echo ""
echo "Verifying Claude CLI installation..."
docker run --rm claude-worker:latest which claude || echo "⚠️  Claude CLI not found in PATH"

echo ""
echo "Testing container startup..."
docker run --rm claude-worker:latest echo "Container can start successfully"

echo ""
echo "🎉 Build complete! Image ready for use."
