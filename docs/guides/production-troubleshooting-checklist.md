# Production Troubleshooting Checklist

**Purpose:** Quick reference for common production issues and their solutions

---

## System Health Alert

**Symptoms:** Dashboard shows unhealthy, API returns 503

**Check:**
1. Verify status: `curl -H "X-API-Key: $KEY" $URL/api/dev-bots/status`
2. Confirm `systemStatus` is `running` (system now auto-starts and should never read as `stopped`)
3. Inspect backend logs: `tail -100 /opt/app-monitor/logs/backend.log`

**Fix:**
- Investigate backend logs for crashes instead of restarting Dev-Bots
- If backend process died, restart via systemd (`sudo systemctl restart app-monitor-backend`) and monitor `/api/health`

## Tasks Stuck in Pending

**Symptoms:** Tasks in queue but not executing, worker slots available

**Check:**
1. System status: `GET /api/dev-bots/status`
2. Worker slots: Check `activeWorkerTypes` vs `availableWorkerTypes`
3. Pending count vs active count

**Common Causes:**
- Assignment loop not running after system restart
- Missing AI provider credentials
- Database lock

**Fix:**
1. Verify Anthropic/OpenAI/Gemini credentials exist on the host
2. Check `/api/dev-bots/status` for `workerCount` (must be >0)
3. Inspect `/opt/app-monitor/logs/backend.log` for assignment loop errors instead of restarting Dev-Bots

## Worker Heartbeat Timeout

**Symptoms:** Tasks fail with "Worker heartbeat timeout"

**Check:**
1. Docker container logs: `docker logs <worker-id>`
2. Container resource usage: `docker stats`
3. Network connectivity

**Common Causes:**
- Container crashed (OOM, dependency failure)
- Network partition
- Heartbeat timeout too aggressive

**Investigation:**
```bash
# Check recent worker containers
docker ps -a | grep worker

# Get logs from failed worker
docker logs worker-XXXXX 2>&1 | tail -100
```

## Missing Credentials

**Symptoms:** Tasks fail immediately with "credentials file not found"

**Affected Providers:**
- Claude: `~/.claude/.credentials.json`
- Gemini: `~/.gemini/credentials.json`
- Codex: `~/.codex/auth.json`

**Fix:**
```bash
# Copy from dev environment
scp ~/.gemini/credentials.json user@prod:~/.gemini/

# Verify permissions
chmod 600 ~/.gemini/credentials.json
```

## Task Detail API Returns Null

**Endpoint:** `GET /api/dev-bots/tasks/:id/detail`

**Workaround:**
Use queue endpoint instead:
```bash
curl -H "X-API-Key: $KEY" "$URL/api/dev-bots/queue" | \
  jq '.data.items[] | select(.task.id == "task-xxx")'
```

## High Failure Rate

**Check Queue Metrics:**
```bash
curl -H "X-API-Key: $KEY" "$URL/api/dev-bots/queue" | \
  jq '.data.counts'
```

**Common Patterns:**
- All failures: Credential issue
- Timeout failures: Worker health issue
- Random failures: Transient errors (retry should work)

## Emergency Actions

### Check System Health
```bash
# Backend status
systemctl status app-monitor-backend

# Docker containers
docker ps

# Disk space
df -h /opt/app-monitor
```

### Restart Backend
```bash
systemctl restart app-monitor-backend
# Wait 10 seconds
curl "$URL/api/health"
```

## Monitoring Commands

```bash
# Watch queue status
watch -n 5 "curl -s -H 'X-API-Key: $KEY' '$URL/api/dev-bots/status' | jq"

# Monitor recent failures
curl -H "X-API-Key: $KEY" "$URL/api/dev-bots/queue" | \
  jq '.data.items[] | select(.task.status == "failed") | {id, error, created_at}'

# Check worker utilization
curl -H "X-API-Key: $KEY" "$URL/api/dev-bots/status" | \
  jq '.data | {workers: .workerCount, max: .maxWorkers, active: .activeTasks}'
```
