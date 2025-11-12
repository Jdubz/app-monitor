# GitHub Webhooks Status

## ✅ Webhooks Configured

The following webhooks are now active on the `Jdubz/app-monitor` repository:

### 1. Pull Request Webhook
- **ID:** 580130132
- **URL:** https://app-monitor.joshwentworth.com/api/github/webhooks/pr
- **Events:** pull_request
- **Status:** Active ✅

### 2. Push Webhook
- **ID:** 580130139
- **URL:** https://app-monitor.joshwentworth.com/api/github/webhooks/push
- **Events:** push
- **Status:** Active ✅

## Testing Webhooks

Once the Cloudflare tunnel service is running, you can test the webhooks:

```bash
# Test that the endpoint is accessible
curl https://app-monitor.joshwentworth.com/api/github/webhooks/health

# Create a test PR to trigger the PR webhook
# Push to staging to trigger the push webhook
```

## Monitoring Webhook Events

Watch backend logs for incoming webhook events:

```bash
# Production
journalctl -u app-monitor-backend@5001.service -f | grep webhook

# You should see log entries like:
# [INFO] Received GitHub webhook { event: 'pull_request', ... }
# [INFO] PR Event { action: 'opened', pr: { number: 123, ... } }
```

## Managing Webhooks

```bash
# List all webhooks
gh api repos/Jdubz/app-monitor/hooks | jq '.[] | {id, events, url: .config.url}'

# Delete a webhook (if needed)
gh api repos/Jdubz/app-monitor/hooks/WEBHOOK_ID --method DELETE

# Update a webhook
gh api repos/Jdubz/app-monitor/hooks/WEBHOOK_ID --method PATCH -f active=false
```

Created: 2025-11-10
