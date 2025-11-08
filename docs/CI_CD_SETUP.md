# CI/CD Pipeline Setup Guide

This guide walks through setting up automated production deployments when merging staging to main.

## Overview

The CI/CD pipeline automatically deploys to production when you push to the `main` branch. It uses:

- **GitHub Actions** for CI/CD orchestration
- **Self-hosted runner** on the production server
- **Blue-green deployment** for zero-downtime updates
- **Automated health checks** to verify deployments

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
   - Node.js 20+
   - Docker
   - Nginx
   - Systemd
   - `/opt/app-monitor` directory set up

2. **GitHub repository** with:
   - Admin access
   - Actions enabled

## Setup Steps

### 1. Set Up Self-Hosted GitHub Runner

On your production server:

```bash
# Run the setup script
cd /opt/app-monitor
./scripts/setup-github-runner.sh
```

This will:
- Download the latest GitHub Actions runner
- Extract it to `~/actions-runner`
- Display next steps

### 2. Register the Runner

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

### 3. Configure Sudo Permissions

The runner needs sudo access for deployment operations:

```bash
# Copy the sudoers file
sudo cp /opt/app-monitor/scripts/production/sudoers-github-runner \
        /etc/sudoers.d/github-runner-deploy

# Update the username in the file
# Replace 'runner-user' with your actual runner username
sudo nano /etc/sudoers.d/github-runner-deploy

# Set correct permissions
sudo chmod 0440 /etc/sudoers.d/github-runner-deploy

# Verify syntax
sudo visudo -c
```

**Find your runner username:**
```bash
ps aux | grep "Runner.Listener"
```

### 4. Set Up Production Environment

Ensure all production infrastructure is in place:

```bash
# Run initial setup
cd /opt/app-monitor
sudo ./scripts/production/setup.sh

# Verify systemd services are installed
sudo systemctl list-unit-files | grep app-monitor

# Should show:
# app-monitor-backend@.service
# app-monitor-frontend.service
```

### 5. Configure Environment Variables

Create production environment file:

```bash
# Backend environment
sudo nano /opt/app-monitor/shared/config/backend.env
```

Add:
```bash
NODE_ENV=production
PORT=5001  # Will alternate with 5002
DATABASE_PATH=/opt/app-monitor/shared/data/dev-bots.db
LOG_LEVEL=info
```

### 6. Test the Workflow

#### Manual Test (Recommended First)

1. Trigger a manual deployment:
   ```bash
   # Go to GitHub Actions tab
   # Select "Deploy to PRODUCTION" workflow
   # Click "Run workflow"
   # Type "DEPLOY TO PRODUCTION" to confirm
   ```

2. Monitor the deployment:
   - Watch the Actions tab in GitHub
   - Check runner logs: `sudo journalctl -u actions.runner.* -f`

#### Automatic Test

1. Create a test change:
   ```bash
   git checkout staging
   echo "# Test deployment" >> README.md
   git add README.md
   git commit -m "test: Trigger CI/CD pipeline"
   git push origin staging
   ```

2. Merge to main:
   ```bash
   git checkout main
   git merge staging
   git push origin main
   ```

3. Watch the deployment in GitHub Actions

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

The deployment script (`deploy.sh`) performs:

1. **Identify active port** - Determine which backend is running (5001 or 5002)
2. **Select target port** - Choose the opposite port for new deployment
3. **Create release** - Extract code to `/opt/app-monitor/releases/TIMESTAMP`
4. **Build application** - Compile backend and frontend
5. **Start new instance** - Launch backend on target port
6. **Health check** - Verify new instance is healthy
7. **Switch traffic** - Update nginx to route to new instance
8. **Stop old instance** - Gracefully shut down previous version
9. **Update current symlink** - Point to new release

## Monitoring

### View Deployment Logs

```bash
# GitHub runner logs
sudo journalctl -u actions.runner.* -f

# Backend service logs
sudo journalctl -u app-monitor-backend@5001.service -f
sudo journalctl -u app-monitor-backend@5002.service -f

# Frontend service logs
sudo journalctl -u app-monitor-frontend.service -f

# Deployment script logs
tail -f /opt/app-monitor/shared/logs/deployments/deploy-*.log
```

### Check Service Status

```bash
# All services
sudo systemctl status 'app-monitor-*'

# Specific services
sudo systemctl status app-monitor-backend@5001.service
sudo systemctl status app-monitor-frontend.service
sudo systemctl status nginx
```

### Manual Rollback

If deployment fails:

```bash
cd /opt/app-monitor
sudo ./scripts/production/rollback.sh
```

## Troubleshooting

### Runner Not Starting

```bash
# Check runner status
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

## Adding GitHub Secrets (if needed)

For sensitive environment variables:

1. Go to repository settings → Secrets and variables → Actions
2. Add secrets:
   - `PRODUCTION_DATABASE_URL`
   - `PRODUCTION_API_KEY`
   - etc.

3. Reference in workflow:
   ```yaml
   env:
     DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
   ```

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
