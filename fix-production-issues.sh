#!/bin/bash
set -e

# Production issue resolution script
# SECURITY: Uses environment variable for API key
#
# Usage:
#   export APP_MONITOR_API_KEY="your-api-key-here"
#   ./fix-production-issues.sh

API_KEY="${APP_MONITOR_API_KEY:-}"
BASE_URL="https://app-monitor.joshwentworth.com"

if [ -z "$API_KEY" ]; then
  echo "❌ Error: APP_MONITOR_API_KEY environment variable not set"
  echo ""
  echo "Usage:"
  echo "  export APP_MONITOR_API_KEY=\"your-api-key-here\""
  echo "  ./fix-production-issues.sh"
  exit 1
fi

echo "=== Production Issue Resolution Script ==="
echo ""

# Step 1: Check current status
echo "📊 Step 1: Checking current system status..."
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/dev-bots/status" | \
  jq -r '.data | "System: \(.systemStatus), Workers: \(.workerCount)/\(.maxWorkers), Pending: \(.tasks.pending | length)"'
echo ""

# Step 2: Check if Gemini credentials exist
echo "🔐 Step 2: Checking Gemini credentials on production..."
ssh jdubz@app-monitor.joshwentworth.com "test -f /home/jdubz/.gemini/credentials.json && echo 'Credentials found ✅' || echo 'Credentials missing ❌'"
echo ""

# Step 3: Restart system to trigger task assignment
echo "🔄 Step 3: Restarting system to trigger task assignment..."
echo "  Stopping system..."
curl -s -X POST -H "X-API-Key: $API_KEY" "$BASE_URL/api/dev-bots/stop" | jq '.success'

sleep 3

echo "  Starting system..."
curl -s -X POST -H "X-API-Key: $API_KEY" "$BASE_URL/api/dev-bots/start" | jq '.success'

sleep 3
echo ""

# Step 4: Check new status
echo "📊 Step 4: Checking post-restart status..."
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/dev-bots/status" | \
  jq -r '.data | "System: \(.systemStatus), Workers: \(.workerCount)/\(.maxWorkers), Active: \(.activeTasks)"'
echo ""

# Step 5: Monitor for task assignment
echo "👀 Step 5: Waiting 10 seconds for task assignment..."
sleep 10

ACTIVE_COUNT=$(curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/dev-bots/status" | jq -r '.data.activeTasks')

if [ "$ACTIVE_COUNT" -gt 0 ]; then
  echo "✅ Task assignment working! Active tasks: $ACTIVE_COUNT"
else
  echo "⚠️  No tasks assigned yet. May need credential fix."
fi

echo ""
echo "=== Resolution Script Complete ==="
echo ""
echo "Next steps:"
echo "1. If credentials missing, run: ssh jdubz@app-monitor.joshwentworth.com 'gemini login'"
echo "2. Monitor queue: curl -H 'X-API-Key: $API_KEY' $BASE_URL/api/dev-bots/queue | jq '.data.counts'"
echo "3. Check for failures: curl -H 'X-API-Key: $API_KEY' $BASE_URL/api/dev-bots/queue | jq '.data.items[] | select(.task.status==\"failed\") | .task.error' | head -5"
