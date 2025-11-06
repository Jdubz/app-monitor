# PRODUCTION Environment Setup

## ⚠️ CRITICAL: Development vs Production

### PRODUCTION Environment
- **Location**: `/opt/app-monitor`
- **Services**: `app-monitor-backend-prod.service`, `app-monitor-frontend-prod.service`
- **Branch**: `main` only
- **Ports**: Backend 5050, Frontend 5173
- **Managed by**: CI/CD (GitHub Actions)
- **Access**: System service, starts on boot

### DEVELOPMENT Environment
- **Location**: Your dev directory (e.g., `/home/jdubz/Development/app-monitor`)
- **Start**: `npm run dev -w backend` and `npm run dev -w frontend`
- **Branch**: `staging` or feature branches
- **Ports**: Backend 5000, Frontend 5174
- **Managed by**: Developer manually
- **Access**: Local development only

## ⚠️ DO NOT MIX ENVIRONMENTS

**NEVER** run dev servers in `/opt/app-monitor`
**NEVER** run production services in your dev directory
**NEVER** modify production files directly

---

## Initial Production Setup

### Prerequisites
- Root/sudo access
- Git installed
- Node.js 20+ installed
- GitHub account with repo access

### Step 1: Run Setup Script

```bash
cd /home/jdubz/Development/app-monitor
chmod +x scripts/production/setup-production.sh
./scripts/production/setup-production.sh
```

This will:
- Create `/opt/app-monitor` directory
- Install systemd service files
- Create production `.env` file
- Configure permissions

### Step 2: Configure Production Secrets

Edit `/opt/app-monitor/.env`:

```bash
sudo nano /opt/app-monitor/.env
```

Add your production secrets:
```env
NODE_ENV=production
PORT=5050
FRONTEND_PORT=5173

# Required secrets
ANTHROPIC_API_KEY=your-production-key
DATABASE_URL=your-production-db

# Optional secrets
GOOGLE_CLOUD_PROJECT=your-project
```

### Step 3: Set Up GitHub Actions Self-Hosted Runner

See [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) for detailed instructions.

Quick setup:
```bash
# On the production machine
mkdir -p ~/actions-runner
cd ~/actions-runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure (get token from GitHub repo settings)
./config.sh --url https://github.com/Jdubz/app-monitor --token YOUR_TOKEN

# Install as service
sudo ./svc.sh install
sudo ./svc.sh start
```

### Step 4: Initial Deployment

```bash
cd /opt/app-monitor
chmod +x scripts/production/deploy.sh
./scripts/production/deploy.sh
```

---

## Managing Production Services

### View Status
```bash
sudo systemctl status app-monitor-backend-prod.service
sudo systemctl status app-monitor-frontend-prod.service
```

### View Logs
```bash
# Live logs
sudo journalctl -u app-monitor-backend-prod.service -f
sudo journalctl -u app-monitor-frontend-prod.service -f

# Last 100 lines
sudo journalctl -u app-monitor-backend-prod.service -n 100
```

### Restart Services
```bash
sudo systemctl restart app-monitor-backend-prod.service
sudo systemctl restart app-monitor-frontend-prod.service
```

### Stop Services
```bash
sudo systemctl stop app-monitor-backend-prod.service
sudo systemctl stop app-monitor-frontend-prod.service
```

### Enable/Disable Auto-start
```bash
# Enable (start on boot)
sudo systemctl enable app-monitor-backend-prod.service
sudo systemctl enable app-monitor-frontend-prod.service

# Disable (don't start on boot)
sudo systemctl disable app-monitor-backend-prod.service
sudo systemctl disable app-monitor-frontend-prod.service
```

---

## Deployment Process

### Automatic Deployment (Recommended)

1. Merge code to `main` branch
2. GitHub Actions automatically triggers
3. Tests run on GitHub runners
4. If tests pass, deploys to production via self-hosted runner
5. Services restart automatically
6. Health checks verify deployment

### Manual Deployment (Emergency Only)

```bash
cd /opt/app-monitor
sudo -u $USER ./scripts/production/deploy.sh
```

⚠️ Only use manual deployment in emergencies. Always prefer CI/CD.

---

## Troubleshooting

### Services Won't Start

Check logs:
```bash
sudo journalctl -u app-monitor-backend-prod.service -n 100
```

Common issues:
- Missing environment variables in `/opt/app-monitor/.env`
- Port conflicts (5050 or 5173 already in use)
- Build failures (check `npm run build` output)
- Permission issues on `/opt/app-monitor`

### Build Failures

```bash
cd /opt/app-monitor
npm ci
npm run build -w backend
npm run build -w frontend
```

### Permission Issues

```bash
sudo chown -R $USER:$USER /opt/app-monitor
chmod -R 755 /opt/app-monitor
```

### Port Conflicts

Check what's using the ports:
```bash
sudo lsof -i :5050
sudo lsof -i :5173
```

---

## Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Restrict `/opt/app-monitor` access** - Only production user
3. **Use HTTPS** - Set up reverse proxy (nginx/caddy)
4. **Keep secrets in `.env`** - Never in code
5. **Rotate API keys** - Regularly update production secrets
6. **Monitor logs** - Watch for security issues
7. **Update dependencies** - Run `npm audit` regularly

---

## Rollback Process

### Rollback to Previous Deployment

```bash
cd /opt/app-monitor
git log --oneline -n 10  # Find previous commit
git checkout <previous-commit-sha>
./scripts/production/deploy.sh
```

### Rollback via GitHub

1. Revert commit on `main` branch
2. Push to trigger automatic deployment
3. CI/CD will deploy reverted version

---

## Monitoring and Alerts

### Health Check Endpoints

- Backend: `http://localhost:5050/health`
- Frontend: `http://localhost:5173`

### Set Up Monitoring

Consider setting up:
- Uptime monitoring (UptimeRobot, Pingdom)
- Log aggregation (Logtail, Papertrail)
- Error tracking (Sentry)
- Performance monitoring (New Relic, DataDog)

---

## Development Workflow Reminder

### ✅ Correct Development Workflow

1. Work in dev directory: `cd /home/jdubz/Development/app-monitor`
2. Create feature branch: `git checkout -b feature/my-feature`
3. Start dev servers: `npm run dev -w backend` and `npm run dev -w frontend`
4. Make changes and test
5. Commit and push to `staging`
6. Create PR to `main`
7. Merge triggers automatic production deployment

### ❌ Incorrect (DO NOT DO THIS)

- Working directly in `/opt/app-monitor`
- Running `npm run dev` in production directory
- Modifying production files manually
- Committing directly to `main`
- Skipping tests before deployment

---

## Additional Resources

- [GitHub Actions Setup](./GITHUB_ACTIONS_SETUP.md)
- [Deployment Workflow](../../.github/workflows/deploy-production.yml)
- [Service Files](../../scripts/production/systemd/)
- [Deployment Script](../../scripts/production/deploy.sh)
