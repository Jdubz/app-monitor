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

# Step 3: Check queue health without restarting
echo "🧪 Step 3: Verifying assignment loop health..."
STATUS_JSON=$(curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/dev-bots/status")
SYSTEM_STATUS=$(echo "$STATUS_JSON" | jq -r '.data.systemStatus')
WORKER_COUNT=$(echo "$STATUS_JSON" | jq -r '.data.workerCount')
MAX_WORKERS=$(echo "$STATUS_JSON" | jq -r '.data.maxWorkers')

echo "  System status: $SYSTEM_STATUS"
echo "  Workers active: $WORKER_COUNT / $MAX_WORKERS"

if [ "$SYSTEM_STATUS" != "running" ]; then
  echo "⚠️  Unexpected system status. Dev-Bots now auto-start and should stay running."
fi

if [ "$WORKER_COUNT" -eq 0 ]; then
  echo "⚠️  No active workers. Verify Anthropic/OpenAI/Gemini credentials and task queue health."
fi

echo ""

# Step 4: Monitor for task assignment
echo "👀 Step 4: Waiting 10 seconds for task assignment..."
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
