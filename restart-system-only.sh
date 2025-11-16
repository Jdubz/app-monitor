#!/bin/bash

# Production system restart script
# SECURITY: Uses environment variable for API key
#
# Usage:
#   export APP_MONITOR_API_KEY="your-api-key-here"
#   ./restart-system-only.sh

API_KEY="${APP_MONITOR_API_KEY:-}"
BASE_URL="https://app-monitor.joshwentworth.com"

if [ -z "$API_KEY" ]; then
  echo "❌ Error: APP_MONITOR_API_KEY environment variable not set"
  echo ""
  echo "Usage:"
  echo "  export APP_MONITOR_API_KEY=\"your-api-key-here\""
  echo "  ./restart-system-only.sh"
  exit 1
fi

echo "Stopping system..."
curl -s -X POST -H "X-API-Key: $API_KEY" "$BASE_URL/api/dev-bots/stop" | jq -r '.data.message // .message'

sleep 3

echo "Starting system..."
curl -s -X POST -H "X-API-Key: $API_KEY" "$BASE_URL/api/dev-bots/start" | jq -r '.data.message // .message'

sleep 3

echo ""
echo "System status:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/dev-bots/status" | \
  jq -r '.data | "System: \(.systemStatus)\nWorkers: \(.workerCount)/\(.maxWorkers)\nActive Tasks: \(.activeTasks)\nPending Tasks: \(.tasks.pending | length)"'
