# CI/CD Pipeline Setup Guide

This guide walks through setting up automated production deployments when merging to main.

## Overview

The CI/CD pipeline automatically deploys to production when you push to the `main` branch. It uses:

- **GitHub Actions** for CI/CD orchestration
- **Self-hosted runner** on the production server
- **Blue-green deployment** for zero-downtime updates
- **Automated health checks** to verify deployments

## Important: Deployment Infrastructure Location

**Deployment scripts and infrastructure are kept in a separate directory** (`../app-monitor-deployment`) to:
- ✅ Prevent committing machine-specific configurations
- ✅ Keep deployment infrastructure isolated from application code
- ✅ Avoid security information leakage

**DO NOT commit the `app-monitor-deployment` directory to version control.**

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌────────────────────┐
│   Git Push to   │─────▶│  GitHub Actions  │─────▶│  Self-Hosted       │
│   main branch   │      │  Workflow        │      │  Runner            │
└─────────────────┘      └──────────────────┘      └────────────────────┘
                                                              │
                                                              ▼
                                                    ┌─────────────────────┐
                                                    │  Production Server  │
                                                    │  /opt/app-monitor   │
                                                    └─────────────────────┘
                                                              │
                                                              ▼
                                              ┌───────────────┴───────────────┐
                                              │                               │
                                         Backend:5001/5002            Frontend:3000
                                         (Blue-Green)
```

## Prerequisites

1. **Production server** with:
   - Ubuntu/Debian Linux
   - Internet access for package installation

2. **GitHub repository** with:
   - Admin access
   - Actions enabled

3. **Deployment directory** created on your local machine:
   ```bash
   # This should be created at the same level as your app-monitor repo
   cd /path/to/your/projects
   mkdir app-monitor-deployment
   ```

## Setup Steps

### Step 1: Copy Deployment Infrastructure

The deployment infrastructure is not stored in the repo. You need to create it:

```bash
# Create the deployment directory structure
mkdir -p app-monitor-deployment/{scripts,systemd,github-runner}

# This directory will contain:
# - Deployment scripts (deploy.sh, rollback.sh, etc.)
# - Systemd service files
# - GitHub Actions runner
# - Production configuration
```

### Step 2: Automated Setup (Recommended)

Use the automated setup script to install all dependencies on your production server:

```bash
# 1. SSH into your production server
ssh user@production-server

# 2. Clone your app-monitor repo
git clone https://github.com/Jdubz/app-monitor.git
cd app-monitor

# 3. Create deployment directory
cd ..
mkdir -p app-monitor-deployment
cd app-monitor-deployment

# 4. Copy the setup script from your local machine or create it
# (See app-monitor-deployment/README.md for the full script)

# 5. Run automated setup
sudo ./scripts/setup-production.sh
```

The script will automatically install:
- ✅ Node.js 20+
- ✅ Docker
- ✅ Nginx
- ✅ GitHub Actions Runner (download)
- ✅ Production directory at `/opt/app-monitor`
- ✅ Systemd services
- ✅ Sudo permissions

### Step 3: Register GitHub Actions Runner

After the automated setup, you must manually register the runner (requires GitHub token):

1. Go to GitHub repository settings:
   ```
   https://github.com/Jdubz/app-monitor/settings/actions/runners/new
   ```

2. Select **Linux** and **x64** architecture

3. Copy the registration token

4. Run the configuration:
   ```bash
   cd ~/actions-runner
   ./config.sh --url https://github.com/Jdubz/app-monitor \
               --token YOUR_TOKEN \
               --name production-runner \
               --labels production
   ```

5. Install as a system service:
   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```

6. Verify it's running:
   ```bash
   sudo ./svc.sh status
   ```

### Step 4: Configure Environment Variables

Create production environment file on the server:

```bash
sudo nano /opt/app-monitor/shared/config/backend.env
```

Add:
```bash
NODE_ENV=production
PORT=5001  # Will alternate with 5002
DATABASE_PATH=/opt/app-monitor/shared/data/dev-bots.db
LOG_LEVEL=info

# Add any other environment variables your app needs
```

### Step 5: Verify Setup

Run the verification script to ensure everything is configured:

```bash
cd /path/to/app-monitor-deployment
sudo ./scripts/verify-production-ready.sh
```

This checks:
- ✅ GitHub runner installation and status
- ✅ Production directory structure
- ✅ Systemd services
- ✅ Nginx configuration
- ✅ Sudo permissions
- ✅ Environment files
- ✅ Docker status
- ✅ Node.js version
- ✅ Build tests

### Step 6: Test Deployment

#### Manual Test (Recommended First)

1. Trigger a manual deployment:
   ```
   Go to: https://github.com/Jdubz/app-monitor/actions
   Select: "Deploy to PRODUCTION" workflow
   Click: "Run workflow"
   Type: "DEPLOY TO PRODUCTION" to confirm
   ```

2. Monitor the deployment:
   - Watch the Actions tab in GitHub
   - Check runner logs: `sudo journalctl -u actions.runner.* -f`
   - Check deployment logs: `tail -f /opt/app-monitor/shared/logs/deployments/deploy-*.log`

#### Automatic Test

1. Merge a change to main:
   ```bash
   # Make a small change
   git checkout main
   git pull origin main

   # Merge your tested changes from staging
   git merge staging
   git push origin main
   ```

2. Watch the deployment in GitHub Actions

## Workflow Details

### Pre-Deployment Checks (GitHub-Hosted)

Runs on GitHub's infrastructure to validate code:

1. ✅ **Branch verification** - Ensures deployment from main only
2. ✅ **Install dependencies** - `npm ci`
3. ✅ **Run backend tests** - All tests must pass
4. ✅ **Lint backend** - Code quality checks
5. ✅ **Build backend** - TypeScript compilation
6. ✅ **Build frontend** - Production build

### Deployment (Self-Hosted)

Runs on your production server:

1. 🚀 **Checkout code** - Pull latest from main
2. 🔧 **Run deployment script** - Execute blue-green deployment
3. ✅ **Verify services** - Check systemd service status
4. 🏥 **Health checks** - Verify endpoints are responding

### Blue-Green Deployment Flow

The deployment script performs:

1. **Identify active port** - Determine which backend is running (5001 or 5002)
2. **Select target port** - Choose the opposite port for new deployment
3. **Create release** - Extract code to `/opt/app-monitor/releases/TIMESTAMP`
4. **Build application** - Compile backend and frontend
5. **Start new instance** - Launch backend on target port
6. **Health check** - Verify new instance is healthy
7. **Switch traffic** - Update nginx to route to new instance
8. **Stop old instance** - Gracefully shut down previous version
9. **Update current symlink** - Point to new release

## Production Directory Structure

On the production server at `/opt/app-monitor`:

```
/opt/app-monitor/
├── current/                    # Symlink to active release
├── releases/
│   ├── 2025-11-08-123456/     # Timestamped releases
│   └── 2025-11-08-234567/
└── shared/
    ├── config/
    │   ├── backend.env         # Backend environment variables
    │   └── active-port         # Current active backend port
    ├── data/
    │   └── dev-bots.db        # SQLite database (persistent)
    └── logs/
        └── deployments/        # Deployment logs
```

## Monitoring

### View Deployment Logs

```bash
# Deployment script logs
tail -f /opt/app-monitor/shared/logs/deployments/deploy-*.log

# GitHub runner logs
sudo journalctl -u actions.runner.* -f

# Backend service logs
sudo journalctl -u app-monitor-backend@5001.service -f
sudo journalctl -u app-monitor-backend@5002.service -f

# Frontend service logs
sudo journalctl -u app-monitor-frontend.service -f
```

### Check Service Status

```bash
# All services
sudo systemctl status 'app-monitor-*'

# Specific services
sudo systemctl status app-monitor-backend@5001.service
sudo systemctl status app-monitor-frontend.service
sudo systemctl status nginx

# GitHub runner
sudo systemctl status actions.runner.*
```

### Manual Rollback

If deployment fails:

```bash
cd /opt/app-monitor
sudo ./rollback.sh
```

## Troubleshooting

### Runner Not Starting

```bash
# Check runner status
cd ~/actions-runner
sudo ./svc.sh status

# View runner logs
sudo journalctl -u actions.runner.* -n 100

# Restart runner
sudo ./svc.sh stop
sudo ./svc.sh start
```

### Permission Denied Errors

```bash
# Verify sudoers file
sudo visudo -c

# Check file permissions
sudo ls -la /etc/sudoers.d/github-runner-deploy

# Should be: -r--r----- root root
```

### Deployment Fails at Build Step

```bash
# Check if dependencies are installed
cd /opt/app-monitor/current
npm list

# Run build manually to see errors
npm run build -w backend
npm run build -w frontend
```

### Health Check Fails

```bash
# Check backend is running
curl http://localhost:5001/health
curl http://localhost:5002/health

# Check frontend
curl http://localhost:3000

# Check nginx
sudo nginx -t
sudo systemctl status nginx
```

## Security Considerations

1. **Sudo access is restricted** to specific deployment commands only
2. **Runner runs as a service** with limited system access
3. **Secrets are managed** through GitHub Secrets (when needed)
4. **Deployments require** code to be in main branch
5. **Manual confirmation** required for workflow_dispatch triggers
6. **Deployment infrastructure** kept separate from codebase

## Keeping Deployment Scripts Updated

When deployment scripts change in the main repo, copy them to your deployment directory:

```bash
# Copy updated scripts
cp /path/to/app-monitor/scripts/production/*.sh ../app-monitor-deployment/scripts/
cp /path/to/app-monitor/scripts/production/*.service ../app-monitor-deployment/systemd/
```

**Note**: The main repo no longer contains `scripts/production/` - deployment infrastructure is kept separate.

## Next Steps

After setup is complete:

1. ✅ Test with a small change
2. ✅ Verify rollback works
3. ✅ Set up monitoring alerts
4. ✅ Document any custom configurations
5. ✅ Create runbook for common issues

## Support

For issues with the CI/CD pipeline:

1. Check GitHub Actions logs
2. Review runner logs on server
3. Consult deployment script logs
4. Check systemd service status

---

**Last Updated:** 2025-11-08
**Maintained By:** Development Team
