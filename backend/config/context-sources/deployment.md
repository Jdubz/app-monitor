# Deployment & Production Guidelines

## Purpose
Production deployment practices, environment configuration, and operational safety.

## When to Read
Read BEFORE making any production deployments or changing deployment configurations.

## Environment Separation

### Directory Structure
```
Development:  /home/jdubz/Development/app-monitor
Production:   /opt/app-monitor
Artifacts:    /opt/app-monitor-artifacts
```

### CRITICAL RULES
❌ **NEVER** manually modify files in `/opt/app-monitor`
❌ **NEVER** commit directly to `main` branch
❌ **NEVER** deploy from development environment
✅ **ALWAYS** use CI/CD pipeline for production deploys
✅ **ALWAYS** test in staging first

## Port Configuration (IMMUTABLE)

### Development Ports
```
Backend:  5000 (dev-server)
Frontend: 5174 (Vite dev server)
```

### Production Ports
```
Backend:  5001/5002 (blue-green deployment)
Frontend: 80 (nginx reverse proxy)
```

**Port Conflict Policy:**
- If port conflicts occur → **FAIL IMMEDIATELY**
- NO automatic port selection
- NO automatic process cleanup
- Operator must resolve conflicts manually

## Deployment Process

### Prerequisites Check
```bash
# Before ANY deployment, verify:
1. All tests pass in CI
2. Staging deployment successful
3. No uncommitted changes in repo
4. Migration scripts tested
5. Rollback plan documented
```

### Blue-Green Deployment
```bash
# Production uses blue-green for zero-downtime

# Current active: 5001 (blue)
# Deploy to: 5002 (green)

# 1. Deploy new version to inactive port
npm run deploy -- --port 5002 --env production

# 2. Health check on new deployment
curl http://localhost:5002/health
# Expected: {"status": "healthy", "version": "x.y.z"}

# 3. Switch nginx to new port (atomic)
sudo systemctl reload nginx

# 4. Monitor for errors (5 minutes)
# If errors: rollback immediately
# If stable: keep new version

# 5. Stop old version (after 24 hours)
# Allows instant rollback window
```

### Deployment Verification
```bash
# After deployment, verify:
✅ Health endpoint responds
✅ WebSocket connections work
✅ Database migrations applied
✅ All services started
✅ Logs show no errors
✅ Metrics reporting correctly

# Verification script:
./scripts/verify-deployment.sh --env production
```

## Configuration Management

### Environment Variables
```bash
# .env files (NEVER commit to git)
Development: backend/.env (local development)
Production:  /etc/app-monitor/production.env (managed by ops)
```

**Required Variables:**
```bash
# Database
DATABASE_PATH=/opt/app-monitor/data/dev-bots-tasks.db

# GitHub
GH_TOKEN=ghp_xxxxxxxxxxxx  # NEVER commit
GITHUB_REPO=username/repo-name

# API Keys
ANTHROPIC_API_KEY=sk-ant-xxxx  # NEVER commit

# System
NODE_ENV=production
LOG_LEVEL=info
PORT=5001  # or 5002 for green
```

### Secrets Management
```bash
# ✅ GOOD: Environment variables from secure store
export GH_TOKEN=$(vault read -field=token secret/github/bot)

# ✅ GOOD: Config files with restrictive permissions
chmod 600 /etc/app-monitor/production.env

# ❌ BAD: Secrets in code
const apiKey = 'sk-ant-xxxxx'; // NO!

# ❌ BAD: Secrets in git
git add .env # NO!
```

## Database Migrations

### Migration Safety
```typescript
// ✅ GOOD: Safe migrations
// backend/migrations/021_add_column.sql
ALTER TABLE tasks ADD COLUMN new_field TEXT; -- Safe (nullable)
CREATE INDEX IF NOT EXISTS idx_tasks_new_field ON tasks(new_field);

// ❌ BAD: Dangerous migrations
ALTER TABLE tasks DROP COLUMN important_data; // DATA LOSS!
ALTER TABLE tasks ADD COLUMN required TEXT NOT NULL; // Breaks existing rows!
```

### Migration Process
```bash
# 1. Test migration in development
npm run migrate -- --env development

# 2. Backup production database
./scripts/backup-database.sh --env production

# 3. Test migration on copy
./scripts/test-migration.sh --backup latest

# 4. Apply to production
npm run migrate -- --env production

# 5. Verify data integrity
./scripts/verify-database.sh --env production

# 6. Keep backup for 30 days minimum
```

### Rollback Procedure
```bash
# If migration fails:
1. Stop application
2. Restore from backup
3. Restart application
4. Investigate failure
5. Fix migration script
6. Retry when safe
```

## Service Management

### Systemd Services
```bash
# Production services
app-monitor-backend.service  # Backend API
app-monitor-nginx.service    # Frontend proxy
app-monitor-worker.service   # Task queue worker

# Service commands
sudo systemctl start app-monitor-backend
sudo systemctl stop app-monitor-backend
sudo systemctl restart app-monitor-backend
sudo systemctl status app-monitor-backend

# View logs
sudo journalctl -u app-monitor-backend -f
```

### Process Management
```bash
# ✅ GOOD: Use systemd (production)
sudo systemctl start app-monitor-backend

# ❌ BAD: Manual processes (development only)
node backend/dist/server.js & # NO in production!
```

## Monitoring & Logging

### Log Locations
```
Development: logs/ (git-ignored)
Production:  /var/log/app-monitor/
```

### Log Rotation
```bash
# Automatic rotation (logrotate)
# /etc/logrotate.d/app-monitor

/var/log/app-monitor/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 app-monitor app-monitor
    sharedscripts
    postrotate
        systemctl reload app-monitor-backend > /dev/null 2>&1 || true
    endscript
}
```

### Monitoring Endpoints
```bash
# Health check
GET /health
Response: {"status": "healthy", "version": "x.y.z", "uptime": 123456}

# Metrics
GET /metrics
Response: Prometheus-format metrics

# Ready check
GET /ready
Response: {"ready": true, "database": "connected", "docker": "available"}
```

## Backup & Recovery

### Automated Backups
```bash
# Daily database backups
0 2 * * * /opt/app-monitor/scripts/backup-database.sh

# Backup retention
- Daily: 7 days
- Weekly: 4 weeks
- Monthly: 12 months
```

### Disaster Recovery
```bash
# Full system restore procedure:

1. Provision new server
2. Install dependencies (Node.js, Docker, nginx)
3. Clone repository (production branch)
4. Restore database from backup
5. Deploy application
6. Verify services
7. Update DNS (if needed)

# Recovery Time Objective (RTO): 4 hours
# Recovery Point Objective (RPO): 24 hours
```

## Security

### Production Hardening
```bash
# ✅ Required security measures:
- Firewall enabled (ufw/iptables)
- SSH key-only authentication
- Automatic security updates
- Fail2ban for SSH protection
- HTTPS only (TLS 1.2+)
- Security headers in nginx
- Regular dependency updates
- Secrets in environment variables
- Restrictive file permissions
```

### Security Checklist
```bash
# Before production deployment:
[ ] No secrets in code
[ ] No secrets in git history
[ ] .env files not committed
[ ] Firewall configured
[ ] HTTPS enabled
[ ] Security headers set
[ ] Dependencies updated
[ ] Vulnerability scan passed
[ ] Access logs enabled
[ ] Error logging configured
```

## Performance Optimization

### Production Build
```bash
# Build for production
npm run build

# Optimizations applied:
- Code minification
- Tree shaking
- Dead code elimination
- Source maps (separate files)
- Asset optimization
- Gzip compression
```

### Resource Limits
```bash
# Systemd service limits
# /etc/systemd/system/app-monitor-backend.service

[Service]
MemoryMax=2G         # Hard memory limit
MemoryHigh=1.5G      # Soft memory limit
CPUQuota=200%        # Max 2 CPU cores
TasksMax=1000        # Max processes/threads
LimitNOFILE=65536    # Max open files
```

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port
sudo lsof -i :5001

# Kill process (if safe)
kill -9 <PID>

# Or change port (not recommended)
PORT=5002 npm start
```

#### Database Locked
```bash
# SQLite database locked
# Cause: Multiple processes accessing same file

# Solution:
1. Stop all app-monitor services
2. Verify no processes holding lock:
   lsof /opt/app-monitor/data/dev-bots-tasks.db
3. Restart services one by one
```

#### Out of Disk Space
```bash
# Check disk usage
df -h

# Clean old logs
find /var/log/app-monitor -name "*.log.gz" -mtime +30 -delete

# Clean old containers
docker system prune -f

# Clean npm cache
npm cache clean --force
```

### Debug Mode
```bash
# Enable debug logging (temporary)
LOG_LEVEL=debug systemctl restart app-monitor-backend

# View debug logs
journalctl -u app-monitor-backend -f --since "5 minutes ago"

# Disable debug logging (remember to revert!)
LOG_LEVEL=info systemctl restart app-monitor-backend
```

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing in CI
- [ ] Code reviewed and approved
- [ ] Staging deployment successful
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] On-call engineer notified
- [ ] Deployment window scheduled

### During Deployment
- [ ] Backup database
- [ ] Apply migrations
- [ ] Deploy new version
- [ ] Health check passes
- [ ] Smoke tests pass
- [ ] Monitor error rates

### Post-Deployment
- [ ] Verify all services running
- [ ] Check logs for errors
- [ ] Monitor metrics for 30 minutes
- [ ] Update deployment documentation
- [ ] Notify stakeholders

### Rollback Criteria
**Rollback immediately if:**
- ❌ Health check fails
- ❌ Error rate > 5%
- ❌ Response time > 2x baseline
- ❌ Critical feature broken
- ❌ Database corruption detected

## Related Guidelines
- See `scope-control.md` for change management
- See `failure-recovery.md` for error handling
- See `pr-workflow.md` for release process
