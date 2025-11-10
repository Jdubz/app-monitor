# GitHub Webhooks Setup

This document describes the GitHub webhook endpoints available in the app-monitor backend.

## Available Endpoints

### Pull Request Events
**URL:** `http://your-server/api/github/webhooks/pr`  
**Method:** POST  
**Events:** `pull_request`

Handles PR events such as:
- `opened` - When a PR is created
- `closed` - When a PR is closed or merged
- `synchronize` - When new commits are pushed
- `reopened` - When a PR is reopened
- And more...

### Push Events
**URL:** `http://your-server/api/github/webhooks/push`  
**Method:** POST  
**Events:** `push`

Handles push events to the repository.

### Health Check
**URL:** `http://your-server/api/github/webhooks/health`  
**Method:** GET

Returns the health status of the webhook service.

## Setup Instructions

### 1. Configure GitHub Webhook

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL:** `http://your-server-ip/api/github/webhooks/pr` (or `/push`)
   - **Content type:** `application/json`
   - **Secret:** (Optional - not implemented yet)
   - **SSL verification:** Enable if using HTTPS
   - **Events:** Select "Pull requests" or "Pushes" depending on endpoint
   - **Active:** ✓ Check this

4. Click **Add webhook**

### 2. For Local Development/Testing

If your server is not publicly accessible, you can use a service like **ngrok** to create a tunnel:

```bash
# Install ngrok (if not already installed)
# Download from https://ngrok.com/download

# Start tunnel to your local server (e.g., port 80)
ngrok http 80

# Use the ngrok URL as your webhook URL
# Example: https://abc123.ngrok.io/api/github/webhooks/pr
```

### 3. Test the Webhook

You can test the webhook using curl:

```bash
# Test PR webhook
curl -X POST http://localhost/api/github/webhooks/pr \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: test-123" \
  -d '{
    "action": "opened",
    "pull_request": {
      "number": 1,
      "title": "Test PR",
      "state": "open",
      "user": {"login": "testuser"},
      "base": {"ref": "main"},
      "head": {"ref": "feature"}
    },
    "repository": {"full_name": "owner/repo"}
  }'

# Test health check
curl http://localhost/api/github/webhooks/health
```

## Webhook Payload Examples

### Pull Request Opened
```json
{
  "action": "opened",
  "pull_request": {
    "number": 123,
    "title": "Add new feature",
    "state": "open",
    "user": {
      "login": "developer"
    },
    "base": {
      "ref": "main"
    },
    "head": {
      "ref": "feature-branch"
    }
  },
  "repository": {
    "full_name": "owner/repository"
  }
}
```

### Push Event
```json
{
  "ref": "refs/heads/main",
  "commits": [
    {
      "message": "Fix bug in authentication"
    }
  ],
  "repository": {
    "full_name": "owner/repository"
  },
  "pusher": {
    "name": "developer"
  }
}
```

## Current Implementation Status

✅ **Implemented:**
- Basic webhook endpoints (`/pr`, `/push`, `/health`)
- Request logging
- Error handling
- Response acknowledgment

⏳ **TODO:**
- [ ] Webhook signature verification (HMAC)
- [ ] Actual event processing logic
- [ ] Integration with dev-bots for automated testing
- [ ] PR status updates
- [ ] Automated comments
- [ ] Build/test triggering

## Security Considerations

⚠️ **Important:** The current implementation does NOT verify webhook signatures. This means anyone who knows your endpoint URL can send requests to it.

**Recommended next steps:**
1. Implement HMAC signature verification using GitHub's webhook secret
2. Add IP allowlist for GitHub's webhook IPs
3. Use HTTPS in production
4. Implement rate limiting

## Monitoring

Webhook events are logged to the console with the following format:

```
[INFO] Received GitHub webhook { event: 'pull_request', delivery: 'xxx', ... }
[INFO] PR Event { action: 'opened', pr: { number: 123, ... } }
```

Check backend logs to verify webhooks are being received:

```bash
# Production
journalctl -u app-monitor-backend@5001.service -f | grep webhook

# Development
# Check console output where backend is running
```

## References

- [GitHub Webhooks Documentation](https://docs.github.com/en/developers/webhooks-and-events/webhooks/about-webhooks)
- [Webhook Events and Payloads](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads)
- [Securing your webhooks](https://docs.github.com/en/developers/webhooks-and-events/webhooks/securing-your-webhooks)
