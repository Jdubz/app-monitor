#!/bin/bash
API_KEY="hs8RixMMgo8a7vvO17D6cDvkugmqGfTzpbFOqLjAznE="
BASE_URL="https://app-monitor.joshwentworth.com"

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
