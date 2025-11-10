# Production Deployment Guide - Pull Agent Architecture

Complete guide for production deployment using the secure pull-agent architecture.

## Quick Links

- **Architecture**: Pull-agent with GitHub-hosted builds
- **Deployment Time**: ~6-8 minutes total
- **Zero Downtime**: Yes (blue-green)
- **Rollback Time**: ~45 seconds

## How It Works

1. **Push to main** → GitHub Actions builds and packages
2. **Pull agent detects** → Downloads artifact within 2 minutes  
3. **Local deployment** → Runs blue-green deployment script
4. **Status reported** → Success/failure sent back to GitHub

See [CI/CD Setup Guide](./CI_CD_SETUP.md) for complete documentation on pull-agent architecture, setup, and operation.

## Common Tasks

### Deploy to Production

```bash
git push origin main
# Monitor: journalctl -u app-monitor-deploy-agent.service -f
```

### Manual Deployment

```bash
cd /opt/app-monitor
sudo ./scripts/deploy.sh /home/jdubz/Development/app-monitor
```

### Rollback

```bash
cd /opt/app-monitor
sudo ./scripts/rollback.sh
```

### Check Status

```bash
# Pull agent
systemctl status app-monitor-deploy-agent.timer

# Services
systemctl status 'app-monitor-backend@*'

# Test pull agent
~/Development/app-monitor-deployment/scripts/test-deploy-agent.sh
```

### View Logs

```bash
# Pull agent
journalctl -u app-monitor-deploy-agent.service -f

# Backend
journalctl -u 'app-monitor-backend@*' -f

# Deployments
ls -la ~/.cache/app-monitor-deploy-agent/logs/
```

## Directory Structure

```
/opt/app-monitor/
├── current/              # Symlink to active release
├── releases/             # Timestamped releases
├── shared/
│   ├── backend/data/     # Database
│   ├── logs/             # App logs
│   └── backups/          # DB backups
└── scripts/              # Deployment scripts
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Deployment not processing | Check timer: `systemctl status app-monitor-deploy-agent.timer` |
| Service won't start | Check logs: `journalctl -u app-monitor-backend@5001 -n 50` |
| Health checks failing | Test manually: `curl http://localhost:5001/api/health` |
| Database locked | Stop all services, verify WAL mode enabled |

## Full Documentation

See [CI/CD Setup Guide](./CI_CD_SETUP.md) for:
- Complete pull-agent architecture details
- Initial setup instructions
- Security benefits
- Performance tuning
- Monitoring setup
