# GitHub Actions Self-Hosted Runner Setup

## Overview

This guide sets up a self-hosted GitHub Actions runner for deploying to production. The runner will execute on your production machine and deploy from the `main` branch only.

## ⚠️ Security Considerations

**Self-hosted runners have access to your production environment.** Only use them for:
- Deploying to your own infrastructure
- Repositories you control
- Workflows you trust

**DO NOT** use self-hosted runners for:
- Public repositories
- Untrusted code
- Pull requests from forks

---

## Prerequisites

- Production machine with `/opt/app-monitor` set up
- GitHub account with admin access to repository
- Root/sudo access on production machine

---

## Step 1: Create Runner Directory

```bash
mkdir -p ~/actions-runner
cd ~/actions-runner
```

---

## Step 2: Download GitHub Actions Runner

Visit [GitHub Actions Runner Releases](https://github.com/actions/runner/releases) for the latest version.

```bash
# Download latest runner (check for newer version)
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Verify hash (optional but recommended)
echo "29fc8cf2dab4c195bb147384e7e2c94cfd4d4022c793b346a6175435265aa278  actions-runner-linux-x64-2.311.0.tar.gz" | shasum -a 256 -c

# Extract
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz
```

---

## Step 3: Get Registration Token from GitHub

1. Go to your repository on GitHub
2. Click **Settings** → **Actions** → **Runners**
3. Click **New self-hosted runner**
4. Select **Linux** and **x64**
5. Copy the registration token (starts with `AAAA...`)

---

## Step 4: Configure the Runner

```bash
cd ~/actions-runner

# Configure with your token
./config.sh \
  --url https://github.com/Jdubz/app-monitor \
  --token YOUR_REGISTRATION_TOKEN_HERE \
  --name production-runner \
  --labels self-hosted,production \
  --work _work
```

Configuration prompts:
- **Runner name**: `production-runner` (or choose your own)
- **Runner group**: Press Enter for default
- **Labels**: `self-hosted,production`
- **Work folder**: Press Enter for `_work`

---

## Step 5: Install as System Service

```bash
cd ~/actions-runner

# Install service (requires sudo)
sudo ./svc.sh install

# Start service
sudo ./svc.sh start

# Check status
sudo ./svc.sh status
```

The runner will now:
- Start automatically on boot
- Run as a background service
- Execute workflows from your repository

---

## Step 6: Verify Runner Registration

1. Go to your repository on GitHub
2. Click **Settings** → **Actions** → **Runners**
3. You should see your runner listed with a green "Idle" status

---

## Step 7: Test Deployment Workflow

### Test with Manual Trigger

1. Go to **Actions** tab in GitHub
2. Select **Deploy to PRODUCTION** workflow
3. Click **Run workflow**
4. Select `main` branch
5. Type `DEPLOY TO PRODUCTION` in confirmation field
6. Click **Run workflow**

The workflow will:
1. Run tests on GitHub-hosted runner
2. Deploy to production via your self-hosted runner
3. Restart production services
4. Run health checks

### Test with Push to Main

```bash
# In your dev directory
cd /home/jdubz/Development/app-monitor
git checkout staging
git pull origin staging

# Make a test change
echo "# Test deployment" >> README.md
git add README.md
git commit -m "test: verify production deployment pipeline"

# Create PR to main
git push origin staging
# Create PR on GitHub, then merge
```

After merging to `main`, the deployment workflow will trigger automatically.

---

## Managing the Runner

### View Runner Status
```bash
sudo ./svc.sh status
```

### View Runner Logs
```bash
# Live logs
sudo journalctl -u actions.runner.* -f

# Recent logs
sudo journalctl -u actions.runner.* -n 100
```

### Restart Runner
```bash
cd ~/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh start
```

### Stop Runner
```bash
cd ~/actions-runner
sudo ./svc.sh stop
```

### Uninstall Runner
```bash
cd ~/actions-runner

# Stop service
sudo ./svc.sh stop

# Uninstall service
sudo ./svc.sh uninstall

# Remove configuration
./config.sh remove --token YOUR_REMOVAL_TOKEN
```

Get removal token from GitHub:
1. Settings → Actions → Runners
2. Click on your runner
3. Click **Remove**
4. Copy the token

---

## Troubleshooting

### Runner Not Appearing in GitHub

Check runner status:
```bash
cd ~/actions-runner
sudo ./svc.sh status
```

Check logs for errors:
```bash
sudo journalctl -u actions.runner.* -n 50
```

Common issues:
- Network connectivity issues
- Invalid or expired token
- Runner already registered with same name

### Workflow Not Running on Self-Hosted Runner

Check workflow file (`.github/workflows/deploy-production.yml`):
- Must specify `runs-on: self-hosted`
- Must be on `main` branch

### Permission Issues During Deployment

The runner user needs:
- Read access to GitHub repository
- Write access to `/opt/app-monitor`
- Sudo access for systemd commands

Grant permissions:
```bash
sudo usermod -aG sudo $USER
sudo visudo
# Add: username ALL=(ALL) NOPASSWD: /bin/systemctl restart app-monitor-*
```

### Runner Offline After Reboot

Check service status:
```bash
sudo systemctl status actions.runner.*
```

Enable auto-start:
```bash
cd ~/actions-runner
sudo ./svc.sh install
```

---

## Security Best Practices

1. **Use dedicated runner user** - Don't use root
2. **Limit sudo permissions** - Only allow specific commands
3. **Monitor runner activity** - Check logs regularly
4. **Keep runner updated** - Update when new versions release
5. **Use environment protection** - Require approval for deployments
6. **Rotate tokens** - Regenerate registration tokens periodically
7. **Audit workflow runs** - Review Actions tab for suspicious activity

---

## Environment Protection (Recommended)

Add extra security to production deployments:

1. Go to **Settings** → **Environments**
2. Create environment named `production`
3. Configure protection rules:
   - **Required reviewers**: Add yourself or team
   - **Wait timer**: Add delay before deployment
   - **Deployment branches**: Only `main`

Update workflow file to use environment:
```yaml
jobs:
  deploy-production:
    runs-on: self-hosted
    environment:
      name: production
      url: https://app-monitor.yourdomain.com
```

---

## Updating the Runner

```bash
cd ~/actions-runner

# Stop service
sudo ./svc.sh stop

# Download new version
curl -o actions-runner-linux-x64-NEW_VERSION.tar.gz -L \
  https://github.com/actions/runner/releases/download/vNEW_VERSION/actions-runner-linux-x64-NEW_VERSION.tar.gz

# Extract
tar xzf ./actions-runner-linux-x64-NEW_VERSION.tar.gz

# Start service
sudo ./svc.sh start
```

---

## Additional Resources

- [GitHub Self-Hosted Runners Documentation](https://docs.github.com/en/actions/hosting-your-own-runners)
- [Production Setup Guide](./PRODUCTION_SETUP.md)
- [Deployment Workflow](../../.github/workflows/deploy-production.yml)
