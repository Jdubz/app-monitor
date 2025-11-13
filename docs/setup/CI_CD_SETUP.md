# CI/CD Pipeline Setup Guide - Pull Agent Architecture

This guide covers setting up automated production deployments using the secure pull-agent architecture.

## Overview

The CI/CD pipeline automatically deploys to production when you push to the `main` branch using:

- **GitHub Actions** for build and test on GitHub-hosted runners
- **Pull Agent** on production server for deployment execution
- **1Password** for secure credential management
- **Blue-green deployment** for zero-downtime updates
- **Automated health checks** to verify deployments

## Architecture

```
┌─────────────────┐      ┌──────────────────────────────┐
│ Push to main    │─────▶│  GitHub Actions              │
│                 │      │  (GitHub-hosted runner)      │
└─────────────────┘      │  - Run tests                 │
                         │  - Build application         │
                         │  - Create artifact           │
                         │  - Create deployment record  │
                         └───────────────┬──────────────┘
                                         │
                                         ▼
                         ┌───────────────────────────────┐
                         │  GitHub Deployments API       │
                         │  Status: queued               │
                         └───────────────┬───────────────┘
                                         │
                                 ┌───────┴────────┐
                                 │  Pull every    │
                                 │  2 minutes     │
                                 └───────┬────────┘
                                         ▼
                         ┌───────────────────────────────┐
                         │  Pull Agent (systemd timer)   │
                         │  On production server         │
                         │  - Fetch PAT from 1Password   │
                         │  - Check for deployments      │
                         │  - Download artifact          │
                         │  - Run deploy script          │
                         │  - Report status              │
                         └───────────────┬───────────────┘
                                         │
                                         ▼
                         ┌───────────────────────────────┐
                         │  /opt/app-monitor             │
                         │  (Production environment)     │
                         │  - Blue-green deployment      │
                         │  - Health checks              │
                         │  - Zero downtime              │
                         └───────────────────────────────┘
```

## Security Benefits

| Aspect | Self-Hosted Runner | Pull Agent |
|--------|-------------------|------------|
| **Credentials** | Stored on disk | Fetched from 1Password on-demand |
| **Runner Process** | Always running | Periodic (2min intervals) |
| **Code Execution** | Runs workflow YAML | Only local scripts |
| **Permissions** | Broad sudo access | Limited to deploy script |
| **Attack Surface** | Constantly exposed | Minimal exposure |
| **Trust Model** | Trusts all workflows | Only trusts local scripts |

## Prerequisites

1. **Production Server**
   - Ubuntu/Debian Linux
   - Node.js 20+
   - Docker
   - Nginx
   - 1Password CLI

2. **1Password**
   - Service account token
   - GitHub PAT stored in vault

3. **GitHub**
   - Admin access to repository
   - Actions enabled

## Setup Steps

### Step 1: Install Pull Agent Infrastructure

On your production server:

```bash
# 1. Install deployment infrastructure
cd ~/Development/app-monitor-deployment
sudo ./scripts/install-deploy-agent.sh
```

This installs:
- Systemd service (`app-monitor-deploy-agent.service`)
- Systemd timer (`app-monitor-deploy-agent.timer`)
- Work directories (`~/.cache/app-monitor-deploy-agent/`)

### Step 2: Configure 1Password Service Account

```bash
# 1. Create service account in 1Password
# 2. Grant access to Development vault
# 3. Save token to .env file

echo "OP_SERVICE_ACCOUNT_TOKEN=ops_..." >> ~/Development/.env
```

### Step 3: Create GitHub Personal Access Token

1. Review GitHub's PAT guide: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
2. In GitHub, navigate to **Settings → Developer settings → Personal access tokens (Classic)** and click **Generate new token**.
3. Name: `app-monitor-deploy-agent`
4. Scopes: **`repo`** only
5. Expiration: 1 year (recommended)
6. Generate and copy the token

### Step 4: Store GitHub PAT in 1Password

```bash
# Using 1Password CLI
source ~/Development/.env

op item create \
  --vault Development \
  --category "API Credential" \
  --title "app-monitor-deploy-agent" \
  token='ghp_YOUR_TOKEN_HERE'
```

### Step 5: Test the Pull Agent

```bash
cd ~/Development/app-monitor-deployment

# Run health check
./scripts/test-deploy-agent.sh

# All checks should pass ✓
```

### Step 6: Enable the Timer

```bash
# Start the timer (runs every 2 minutes)
sudo systemctl enable --now app-monitor-deploy-agent.timer

# Check status
systemctl status app-monitor-deploy-agent.timer
```

## Workflow Configuration

The workflow file is located at `.github/workflows/deploy-production.yml`.

### Key Features

1. **Pre-deployment Checks** (GitHub-hosted)
   - Branch verification (main only)
   - Manual confirmation (workflow_dispatch)
   - Tests (backend, frontend)
   - Linting (backend, frontend)
   - Builds (backend, frontend)

2. **Artifact Creation** (GitHub-hosted)
   - Packages entire application
   - Creates checksum
   - Uploads to GitHub

3. **Deployment Record** (GitHub-hosted)
   - Creates GitHub deployment
   - Includes artifact metadata
   - Sets status to "queued"

4. **Monitoring** (GitHub-hosted)
   - Polls deployment status
   - Waits for pull agent
   - Reports success/failure

### Trigger Deployment

```bash
# Automatic on push to main
git push origin main

# Manual with confirmation
gh workflow run deploy-production.yml
# Then type "DEPLOY TO PRODUCTION" when prompted
```

## Monitoring

### Watch Pull Agent

```bash
# Follow agent logs
journalctl -u app-monitor-deploy-agent.service -f

# Check timer schedule
systemctl list-timers app-monitor-deploy-agent.timer

# View recent runs
journalctl -u app-monitor-deploy-agent.service --since "1 hour ago"
```

### Watch GitHub Actions

```bash
# List recent runs
gh run list --limit 5

# Watch current run
gh run watch

# View specific run
gh run view <run-id>
```

### Check Deployment Status

```bash
# List deployments
gh api repos/Jdubz/app-monitor/deployments --jq '.[] | {id, created_at, environment}'

# Check deployment statuses
gh api repos/Jdubz/app-monitor/deployments/<ID>/statuses
```

## Troubleshooting

### Pull Agent Not Running

```bash
# Check timer status
systemctl status app-monitor-deploy-agent.timer

# Check service status
systemctl status app-monitor-deploy-agent.service

# View logs
journalctl -u app-monitor-deploy-agent.service -n 50

# Test manually
cd ~/Development/app-monitor-deployment
./scripts/deploy-agent.sh
```

### GitHub PAT Issues

```bash
# Test PAT retrieval
cd ~/Development/app-monitor-deployment
./scripts/test-deploy-agent.sh

# Should show:
# ✓ PAT retrieved from 1Password
# ✓ GitHub API authentication successful
```

### Deployment Not Triggered

1. **Check workflow ran**: `gh run list --limit 5`
2. **Check deployment created**: `gh api repos/Jdubz/app-monitor/deployments`
3. **Check pull agent logs**: `journalctl -u app-monitor-deploy-agent.service -f`
4. **Manual trigger**: `./scripts/deploy-agent.sh`

### Health Checks Failing

```bash
# Test health endpoints
curl http://localhost:5001/api/health
curl http://localhost:5002/api/health

# Check services
systemctl status 'app-monitor-backend@*'

# View application logs
journalctl -u app-monitor-backend@5001.service -n 100
```

## Configuration

### Pull Agent Environment Variables

Set in `/home/jdubz/Development/.env`:

```bash
OP_SERVICE_ACCOUNT_TOKEN=ops_...
DEPLOY_AGENT_REPO=Jdubz/app-monitor
DEPLOY_AGENT_GITHUB_PAT_ITEM=op://Development/app-monitor-deploy-agent/token
DEPLOY_AGENT_ENVIRONMENT_URL=https://app-monitor.yourdomain.com
```

### Timer Configuration

Edit `/etc/systemd/system/app-monitor-deploy-agent.timer`:

```ini
[Timer]
OnBootSec=2m           # Run 2 minutes after boot
OnUnitActiveSec=2m     # Run every 2 minutes
AccuracySec=30s        # Allow 30s jitter
RandomizedDelaySec=15s # Random delay up to 15s
```

After changes:
```bash
sudo systemctl daemon-reload
sudo systemctl restart app-monitor-deploy-agent.timer
```

## Maintenance

### Update GitHub PAT

```bash
# Create new token (see Step 3)
# Update in 1Password
source ~/Development/.env
op item edit "app-monitor-deploy-agent" \
  --vault Development \
  token='ghp_NEW_TOKEN'

# Verify
./scripts/test-deploy-agent.sh
```

### Pause Deployments

```bash
# Stop timer (deployments won't run)
sudo systemctl stop app-monitor-deploy-agent.timer

# Resume
sudo systemctl start app-monitor-deploy-agent.timer
```

### View Deployment History

```bash
# Local deployment logs
ls -la ~/.cache/app-monitor-deploy-agent/logs/

# GitHub deployment history
gh api repos/Jdubz/app-monitor/deployments --jq '.[] | {id, created_at, creator: .creator.login, sha: .sha[0:7]}'
```

## Migration from Self-Hosted Runner

If migrating from a self-hosted runner:

1. **Test pull agent** first (both can run concurrently)
2. **Verify 2-3 successful deployments**
3. **Stop self-hosted runner**:
   ```bash
   cd ~/actions-runner
   sudo ./svc.sh stop
   sudo ./svc.sh uninstall
   ```
4. **Remove runner from GitHub**:
   - Settings → Actions → Runners → Remove runner
5. **Archive runner directory**:
   ```bash
   tar -czf actions-runner-backup.tar.gz actions-runner
   rm -rf actions-runner
   ```

## Support

For issues or questions:

1. **Check health**: `~/Development/app-monitor-deployment/scripts/test-deploy-agent.sh`
2. **View logs**: `journalctl -u app-monitor-deploy-agent.service -f`
3. **Manual test**: `~/Development/app-monitor-deployment/scripts/deploy-agent.sh`
4. **GitHub issues**: https://github.com/Jdubz/app-monitor/issues

---

## Reference Documentation

- **Deployment Infrastructure**: `~/Development/app-monitor-deployment/README.md`
- **Migration Plan**: `~/Development/app-monitor-deployment/MIGRATION_PLAN.md`
- **Quick Reference**: `~/Development/app-monitor-deployment/QUICK_REFERENCE.md`
- **Production Deployment**: `docs/PRODUCTION_DEPLOYMENT.md`
