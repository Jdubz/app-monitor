# Task Submission and Monitoring Script

This script submits tasks from `dev-bots-tasks.json` to the production dev-bots system and monitors their execution through completion.

## Features

- ✅ Submits 5 tasks to the queue
- ✅ Monitors execution in real-time
- ✅ Enforces max 2 concurrent workers
- ✅ Tracks PR creation and followup tasks
- ✅ Live dashboard with color-coded status
- ✅ Detects worker limit violations

## Prerequisites

1. **Backend must be running** (production at http://localhost:5000)
2. **API Key must be configured** in environment

## Setup

### 1. Configure API Key

The API key must be sourced from `/opt/app-monitor/shared/.env`:

```bash
# Source the shared environment file
source /opt/app-monitor/shared/.env
```

Or export it manually:

```bash
export API_KEY="your-production-api-key"
```

### 2. Verify Backend is Running

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:5000/api/dev-bots/health
```

## Usage

```bash
# Make sure API_KEY is in environment
source /opt/app-monitor/shared/.env

# Run the script
node submit-and-monitor-tasks.js
```

## What It Does

1. **Loads Tasks**: Reads first 5 tasks from `dev-bots-tasks.json`
2. **Submits to Queue**: POST to `/api/dev-bots/tasks` for each task
3. **Monitors Execution**: Polls every 5 seconds for status updates
4. **Checks Constraints**: Verifies max 2 workers running simultaneously
5. **Tracks Lifecycle**:
   - Dev-bot initiation (container start)
   - Task execution (code changes)
   - PR creation (git workflow)
   - PR tracking (CI status)
   - Followup task creation (if failures occur)
6. **Reports Results**: Final summary with success/failure counts

## Output

The script provides a live dashboard showing:

```
📊 Task Monitoring Dashboard - Iteration 3

System Status:
  Workers: 2/2 (running)
  Active: 2 | Queue: 3

Queue Summary:
  Pending: 3
  Active: 2
  Completed: 0
  Failed: 0

Submitted Tasks:
  1. [ACTIVE   ] 8ca93f31 - Add detectStaleBranch method... (2m 15s)
     Worker: worker-xyz | Agent: backend-specialist
  2. [PENDING  ] 95420cfa - Add failure categorization... (1m 30s)
  ...
```

## Environment Variables

- `API_KEY` (required) - Production API key from `/opt/app-monitor/shared/.env`
- `API_BASE_URL` (optional) - Backend URL, defaults to `http://localhost:5000`

## Security

⚠️ **NEVER commit API keys to git**

- API key must be sourced from environment
- Script will exit if `API_KEY` is not set
- `/opt/app-monitor/shared/.env` is the canonical source

## Monitoring

The script tracks the complete task lifecycle:

1. **Pending** → Task in queue, waiting for worker
2. **Active** → Worker executing task
3. **Completed** → Task finished successfully (PR created)
4. **Failed** → Task failed (followup task may be created)

## Exit Codes

- `0` - All tasks completed successfully
- `1` - One or more tasks failed OR no tasks were submitted

## Notes

- Tasks already in the queue will be rejected as duplicates
- Script respects the 2-worker concurrency limit
- Followup tasks enter the queue automatically on failures
- PR creation is part of the task execution workflow
