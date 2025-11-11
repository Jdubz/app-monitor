#!/bin/bash
#
# Restart PR tracking for hung PRs 96, 97, 98, 99
#
# This script triggers the PR monitoring system to re-evaluate these PRs

set -euo pipefail

PR_NUMBERS=(96 97 98 99)
API_BASE="${API_BASE:-http://localhost/api}"

echo "Restarting PR tracking for hung PRs..."

for PR in "${PR_NUMBERS[@]}"; do
    echo "Triggering PR #$PR evaluation..."
    
    # Trigger manual PR re-evaluation via webhook simulation
    if curl -X POST "${API_BASE}/webhooks/github" \
        -H "Content-Type: application/json" \
        -H "X-GitHub-Event: pull_request" \
        -d "{
            \"action\": \"synchronize\",
            \"number\": $PR,
            \"pull_request\": {
                \"number\": $PR,
                \"state\": \"open\",
                \"head\": {
                    \"ref\": \"task-implementation-branch-$PR\"
                },
                \"base\": {
                    \"ref\": \"main\"
                }
            }
        }" 2>/dev/null; then
        echo "  ✓ Triggered PR #$PR"
    else
        echo "  ✗ Failed to trigger PR #$PR"
    fi
    sleep 1
done

echo ""
echo "✅ PR tracking restart complete"
echo ""
echo "Monitor PR status with:"
echo "  gh pr list --state open"
echo "  journalctl -u app-monitor-backend@5001.service -f"
