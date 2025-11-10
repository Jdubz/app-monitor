# Production Deployment Guide

This guide covers the production deployment of App Monitor to `/opt/app-monitor` with zero-downtime blue-green deployment strategy.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Initial Setup](#initial-setup)
3. [Deployment Process](#deployment-process)
4. [Rollback Procedure](#rollback-procedure)
5. [Maintenance](#maintenance)
6. [Troubleshooting](#troubleshooting)

## Architecture Overview

### Blue-Green Deployment

App Monitor uses a blue-green deployment strategy for zero-downtime updates:

- **Two Backend Instances**: Running on ports 5001 (blue) and 5002 (green)
- **Active/Standby**: One instance serves traffic while the other is updated
- **Traffic Switching**: Nginx reverse proxy switches between instances
- **Automatic Rollback**: Failed deployments automatically revert to previous version

### Directory Structure

```
/opt/app-monitor/
├── current/              # Symlink to active release
├── releases/             # Timestamped release directories
│   ├── 20250108_120000/
│   ├── 20250108_140000/
│   └── ...
├── shared/               # Persistent data across deployments
│   ├── backend/
│   │   └── data/         # SQLite database (WAL mode)
│   ├── logs/             # Application logs
│   └── backups/
│       └── database/     # Database backups
└── scripts/              # Deployment scripts
    ├── production/
    │   ├── deploy.sh
    │   ├── health-check.sh
    │   ├── backup-db.sh
    │   └── rollback.sh
    └── systemd/
        ├── app-monitor-backend@.service
        └── app-monitor-nginx.conf
```

### Components

1. **Backend Services** (Systemd Template)
   - `app-monitor-backend@5001.service`
   - `app-monitor-backend@5002.service`

2. **Frontend** (Nginx)
   - Static file serving from `/opt/app-monitor/current/frontend/dist`
   - Reverse proxy to active backend

3. **Database** (SQLite with WAL mode)
   - Shared across deployments at `/opt/app-monitor/shared/backend/data/dev-bots.db`
   - Automatic backups before each deployment

## Initial Setup

### Prerequisites

1. **System Requirements**
   - Ubuntu/Debian Linux
   - Node.js 18+
   - Docker and Docker Compose
   - Nginx
   - SQLite3

2. **User Permissions**
   - User `jdubz` with sudo access
   - Docker group membership
   - Ownership of `/opt/app-monitor`

### One-Time Setup Steps

#### 1. Create Deployment Directory

```bash
sudo mkdir -p /opt/app-monitor/{releases,shared/{backend/data,logs,backups/database},scripts}
sudo chown -R jdubz:jdubz /opt/app-monitor
```

#### 2. Install Systemd Services

```bash
# Copy systemd service files
sudo cp scripts/systemd/app-monitor-backend@.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable services (start on boot)
sudo systemctl enable app-monitor-backend@5001.service
sudo systemctl enable app-monitor-backend@5002.service
```

#### 3. Configure Nginx

```bash
# Copy nginx configuration
sudo cp scripts/systemd/app-monitor-nginx.conf /etc/nginx/sites-available/app-monitor

# Enable site
sudo ln -s /etc/nginx/sites-available/app-monitor /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

#### 4. Initialize Database

The database will be automatically created on first deployment. It uses SQLite with Write-Ahead Logging (WAL) mode for safe concurrent access during deployments.

#### 5. Copy Deployment Scripts

```bash
cp -r scripts/* /opt/app-monitor/scripts/
chmod +x /opt/app-monitor/scripts/production/*.sh
```

## Deployment Process

### Standard Deployment

From your development repository:

```bash
cd /home/jdubz/Development/app-monitor
./scripts/production/deploy.sh
```

### Deployment Phases

The deployment script executes in these phases:

1. **Pre-deployment Checks**
   - Verify deployment directory exists
   - Determine active and target ports

2. **Database Backup**
   - Create timestamped SQLite backup
   - Keep last 10 backups

3. **Create New Release**
   - Copy code to timestamped release directory
   - Symlink shared data directories
   - Exclude node_modules and build artifacts

4. **Build Application**
   - Install production dependencies
   - Build backend TypeScript
   - Build frontend React app

5. **Deploy to Target Port**
   - Stop service on target port (if running)
   - Update `current` symlink to new release
   - Start service on target port
   - Wait for initialization

6. **Health Checks**
   - Service running
   - Port listening
   - HTTP health endpoint responding
   - Database connectivity
   - Docker connectivity
   - WebSocket connectivity

7. **Switch Traffic**
   - Update nginx upstream to target port
   - Reload nginx
   - Gracefully stop old service

8. **Cleanup**
   - Remove old releases (keep last 5)

### Expected Timeline

- **Total Deployment**: ~3-5 minutes
- **Build Phase**: ~2-3 minutes
- **Health Checks**: ~30 seconds
- **Traffic Switch**: ~2 seconds
- **Zero Downtime**: Active service runs until traffic switched

## Rollback Procedure

### Automatic Rollback

If health checks fail, the deployment script automatically rolls back:

```bash
# This happens automatically on deployment failure
./scripts/production/rollback.sh <previous_port>
```

### Manual Rollback

To manually rollback to the previous release:

```bash
# If currently on 5001, rollback to 5002
sudo /opt/app-monitor/scripts/production/rollback.sh 5002

# If currently on 5002, rollback to 5001
sudo /opt/app-monitor/scripts/production/rollback.sh 5001
```

### Rollback Timeline

- **Total Rollback**: ~45 seconds
- **Service Restart**: ~5 seconds
- **Traffic Switch**: ~2 seconds

## Maintenance

### View Logs

```bash
# Backend logs (current active port)
sudo journalctl -u app-monitor-backend@5001.service -f

# All backend logs
sudo journalctl -u 'app-monitor-backend@*' -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Check Service Status

```bash
# Check which backend is active
systemctl is-active app-monitor-backend@5001.service
systemctl is-active app-monitor-backend@5002.service

# Detailed status
systemctl status app-monitor-backend@5001.service
systemctl status app-monitor-backend@5002.service
```

### Manual Service Control

```bash
# Start a service
sudo systemctl start app-monitor-backend@5001.service

# Stop a service
sudo systemctl stop app-monitor-backend@5001.service

# Restart a service
sudo systemctl restart app-monitor-backend@5001.service
```

### Database Backups

```bash
# Manual database backup
/opt/app-monitor/scripts/production/backup-db.sh

# List recent backups
ls -lh /opt/app-monitor/shared/backups/database/

# Restore from backup (requires service stop)
sudo systemctl stop app-monitor-backend@5001.service
sudo systemctl stop app-monitor-backend@5002.service
cp /opt/app-monitor/shared/backups/database/dev-bots_TIMESTAMP.db \
   /opt/app-monitor/shared/backend/data/dev-bots.db
```

### Cleanup Old Releases

Automatic cleanup keeps the last 5 releases. To manually clean up:

```bash
cd /opt/app-monitor/releases
ls -t | tail -n +6 | xargs rm -rf
```

## Troubleshooting

### Deployment Failed

**Symptom**: Deployment script exits with error

**Solutions**:
1. Check the error message for specific phase failure
2. Review logs: `sudo journalctl -u app-monitor-backend@<port> -n 100`
3. Verify disk space: `df -h /opt/app-monitor`
4. Check Docker is running: `docker ps`
5. Manual rollback if needed

### Service Won't Start

**Symptom**: `systemctl status` shows failed state

**Solutions**:
1. Check service logs: `sudo journalctl -u app-monitor-backend@<port> -n 50`
2. Verify port is not in use: `lsof -i :<port>`
3. Check database file permissions: `ls -l /opt/app-monitor/shared/backend/data/`
4. Verify Node.js is in PATH: `which node`
5. Test manual start: `cd /opt/app-monitor/current/backend && node dist/server.js`

### Health Checks Failing

**Symptom**: Deployment rolls back due to failed health checks

**Solutions**:
1. Check which health check failed in deployment output
2. Test manually:
   ```bash
   # HTTP health
   curl http://localhost:5001/api/health

   # Database
   curl http://localhost:5001/api/tasks?limit=1

   # Docker
   curl http://localhost:5001/api/workers
   ```
3. Review application logs
4. Verify dependencies (Docker, database)

### Database Locked

**Symptom**: SQLite database locked errors

**Solutions**:
1. Ensure WAL mode is enabled: `sqlite3 dev-bots.db 'PRAGMA journal_mode;'`
2. Check for zombie processes: `ps aux | grep node`
3. Stop all services: `sudo systemctl stop app-monitor-backend@*`
4. Restart with WAL: `sqlite3 dev-bots.db 'PRAGMA journal_mode=WAL;'`

### Nginx Configuration Issues

**Symptom**: 502 Bad Gateway or connection refused

**Solutions**:
1. Test nginx config: `sudo nginx -t`
2. Check upstream port matches active service
3. Verify backend is listening: `lsof -i :5001 -i :5002`
4. Check nginx error log: `sudo tail -f /var/log/nginx/error.log`
5. Reload nginx: `sudo systemctl reload nginx`

### Port Already in Use

**Symptom**: Service fails to start - port already bound

**Solutions**:
1. Find process using port: `lsof -i :<port>`
2. Stop conflicting process
3. Or switch to alternate port in systemd service

## GitHub Actions Integration

### Self-Hosted Runner Setup

1. **Install GitHub Actions Runner**

```bash
# Create runner directory
mkdir -p ~/actions-runner && cd ~/actions-runner

# Download latest runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Extract
tar xzf actions-runner-linux-x64-2.311.0.tar.gz

# Configure (use your repository URL and token from GitHub)
./config.sh --url https://github.com/Jdubz/app-monitor --token YOUR_TOKEN

# Install as service
sudo ./svc.sh install
sudo ./svc.sh start
```

2. **Deployment Workflow**

Create `.github/workflows/deploy-production.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: self-hosted

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Run deployment
        run: |
          cd $GITHUB_WORKSPACE
          ./scripts/production/deploy.sh

      - name: Notify on failure
        if: failure()
        run: |
          echo "Deployment failed! Check logs for details."
```

## Security Considerations

1. **File Permissions**
   - Deployment directory owned by `jdubz:jdubz`
   - Systemd services run as `jdubz` user
   - Database files: `640` permissions

2. **Network Security**
   - Backend only listens on `127.0.0.1` (localhost)
   - Nginx acts as public-facing reverse proxy
   - Configure SSL/TLS certificates for production

3. **Environment Variables**
   - Sensitive values in systemd service `Environment` directives
   - Never commit credentials to repository
   - Use separate production `.env` if needed

4. **Docker Security**
   - Resource limits enforced on dev-bot containers
   - Non-root user in containers
   - Network isolation

## Performance Tuning

### Database Optimization

```bash
# Enable WAL mode (if not already)
sqlite3 /opt/app-monitor/shared/backend/data/dev-bots.db 'PRAGMA journal_mode=WAL;'

# Optimize database
sqlite3 /opt/app-monitor/shared/backend/data/dev-bots.db 'VACUUM;'
sqlite3 /opt/app-monitor/shared/backend/data/dev-bots.db 'ANALYZE;'
```

### Node.js Memory

Adjust systemd service if needed:

```bash
# Edit service file
sudo systemctl edit app-monitor-backend@.service

# Add:
[Service]
Environment="NODE_OPTIONS=--max-old-space-size=4096"
```

### Nginx Tuning

Edit `/etc/nginx/sites-available/app-monitor`:

```nginx
# Increase worker connections
events {
    worker_connections 2048;
}

# Enable gzip compression
gzip on;
gzip_types text/plain text/css application/json application/javascript;
```

## Monitoring

### Health Check Endpoint

```bash
# Quick health check
curl http://localhost:5001/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-01-08T12:00:00.000Z",
  "uptime": 12345
}
```

### Automated Monitoring

Consider setting up:
- Prometheus metrics export
- Grafana dashboards
- Alert notifications (email, Slack)
- Uptime monitoring (UptimeRobot, Pingdom)

## Support

For issues or questions:
- Check logs first: `sudo journalctl -u 'app-monitor-backend@*' -f`
- Review this documentation
- Check GitHub issues: https://github.com/Jdubz/app-monitor/issues
