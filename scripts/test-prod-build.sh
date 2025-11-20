#!/bin/bash
# Test production build locally before pushing
# Mimics exact production deployment: npm ci --omit=dev

set -e

echo "🧪 Testing production build locally..."
echo ""

# Determine repository root dynamically
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TEST_DIR="/tmp/prod-build-test-$(date +%s)"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "📋 Copying source files..."
cp -r "$REPO_ROOT/backend" .
cp -r "$REPO_ROOT/shared" .

cd backend

echo ""
echo "📥 Installing dependencies (npm ci --omit=dev)..."
npm ci --omit=dev --workspaces=false 2>&1 | grep "added"

echo ""
echo "🔍 Checking critical dependencies..."
for dep in typescript @types/node @types/express @types/tar-fs @modelcontextprotocol/sdk; do
    if npm ls "$dep" &>/dev/null; then
        echo "  ✅ $dep"
    else
        echo "  ❌ $dep MISSING"
    fi
done

echo ""
echo "🏗️  Building TypeScript..."
if npm run build; then
    echo ""
    echo "✅ BUILD SUCCESSFUL"
    echo ""
    echo "📦 Build output:"
    ls -lh dist/index.js
    echo ""
    echo "🧹 Cleanup: rm -rf $TEST_DIR"
    exit 0
else
    echo ""
    echo "❌ BUILD FAILED"
    echo ""
    echo "📂 Test directory preserved for debugging: $TEST_DIR"
    exit 1
fi
