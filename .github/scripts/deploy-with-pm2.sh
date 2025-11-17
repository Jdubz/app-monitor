#!/bin/bash
set -e

RELEASE_DIR="$1"  # e.g., /opt/app-monitor/releases/20251117_040000

echo "🔄 Updating PM2 to use new release: $RELEASE_DIR"

# Navigate to the new release backend
cd "$RELEASE_DIR/backend"

# Update PM2 process with zero-downtime reload
pm2 reload ecosystem.config.cjs --update-env

echo "✅ PM2 reloaded with new release"
pm2 status app-monitor-backend
