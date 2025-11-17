#!/bin/bash
set -euo pipefail

# Validate RELEASE_DIR argument
if [ -z "${1:-}" ]; then
    echo "❌ Error: RELEASE_DIR argument is missing." >&2
    echo "Usage: $0 /path/to/release" >&2
    exit 1
fi

RELEASE_DIR="$1"  # e.g., /opt/app-monitor/releases/20251117_040000

if [ ! -d "$RELEASE_DIR" ]; then
    echo "❌ Error: RELEASE_DIR directory '$RELEASE_DIR' does not exist." >&2
    exit 1
fi

echo "🔄 Updating PM2 to use new release: $RELEASE_DIR"

# Navigate to the new release backend
cd "$RELEASE_DIR/backend"

# Update PM2 process with zero-downtime reload (start if not running)
pm2 startOrReload ecosystem.config.cjs --update-env

echo "✅ PM2 started or reloaded with new release"
pm2 status app-monitor-backend
