#!/bin/bash
# Build custom Dev-Bot Docker image
#
# NOTE: This is a simplified build script. For more advanced features including
# verification and detailed output, use: ../dev-bots/docker/build.sh

set -e

echo "🏗️  Building Dev-Bot Docker image..."

cd "$(dirname "$0")/.."

# Build the image with BuildKit from app-monitor root
DOCKER_BUILDKIT=1 docker build \
  -f dev-bots/docker/Dockerfile \
  -t dev-bot:latest \
  -t dev-bot:dev \
  .

echo "✅ Dev-Bot image built successfully!"
echo ""
echo "Image details:"
docker images | grep dev-bot

echo ""
echo "Verifying Claude CLI installation..."
docker run --rm dev-bot:latest which claude || echo "⚠️  Claude CLI not found in PATH"

echo ""
echo "Testing container startup..."
docker run --rm dev-bot:latest echo "Container can start successfully"

echo ""
echo "🎉 Build complete! Image ready for use."
