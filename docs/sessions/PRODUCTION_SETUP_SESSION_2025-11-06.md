# Production Setup Session - November 6, 2025

## Overview

This session established a complete production deployment system with strict isolation from the development environment.

## Accomplishments

### 1. Frontend Dev Server Issue
**Problem**: Frontend dev server failed - port 5174 already in use
**Status**: Identified but not fixed (production setup took priority)
**Action Item**: Kill existing process on port 5174 to restart dev server

### 2. Production Environment Setup

#### A. Systemd Services Created
- `app-monitor-backend-prod.service` - Production backend service
- `app-monitor-frontend-prod.service` - Production frontend service

**Features**:
- Auto-restart on failure
- Security hardening (NoNewPrivileges, PrivateTmp, ProtectSystem)
- Journal logging integration
- Isolated from development environment

**Locations**:
- Service files: `/etc/systemd/system/app-monitor-*-prod.service`
- Production directory: `/opt/app-monitor`
- Environment file: `/opt/app-monitor/.env`

#### B. Deployment Scripts

**setup-production.sh**:
- Creates `/opt/app-monitor` directory
- Installs systemd services
- Configures permissions
- Creates production `.env` file
- Interactive confirmations to prevent accidents

**deploy.sh**:
- Pulls latest code from `main` branch only
- Runs `npm ci --production`
- Builds backend and frontend
- Restarts services
- Verifies deployment with health checks
- Multiple warnings about production use

#### C. GitHub Actions CI/CD

**Workflow: deploy-production.yml**

**Triggers**:
- Push to `main` branch (automatic)
- Manual workflow dispatch (requires typing "DEPLOY TO PRODUCTION")

**Jobs**:
1. **Pre-deployment Checks** (GitHub-hosted):
   - Verify branch is `main`
   - Run tests
   - Run linter
   - Build backend and frontend

2. **Deploy Production** (self-hosted):
   - Run deployment script
   - Verify services are active
   - Run health checks

3. **Notify Deployment** (GitHub-hosted):
   - Report success/failure

**Environment Protection**:
- Uses `production` environment
- Can configure required reviewers
- Can add deployment delays
- Only deploys from `main` branch

#### D. Comprehensive Documentation

**PRODUCTION_SETUP.md**:
- Clear dev vs prod distinction
- Step-by-step setup instructions
- Service management commands
- Troubleshooting guide
- Security best practices
- Rollback procedures

**GITHUB_ACTIONS_SETUP.md**:
- Self-hosted runner installation
- Configuration steps
- Security considerations
- Troubleshooting
- Update procedures

**README.md Updated**:
- Prominent dev vs prod warning at top
- Clear port distinctions (dev: 5000/5174, prod: 5050/5173)
- Workflow guidelines
- Links to production docs

### 3. Development vs Production Isolation

#### Clear Separation Established

| Aspect | Development | Production |
|--------|-------------|------------|
| Location | `/home/jdubz/Development/app-monitor` | `/opt/app-monitor` |
| Branch | `staging` or features | `main` only |
| Backend Port | 5000 | 5050 |
| Frontend Port | 5174 | 5173 |
| Start Method | `npm run dev` | systemd services |
| Management | Manual | CI/CD only |
| Access | Developer | System service |

#### Safety Measures

**In Scripts**:
- Multiple "PRODUCTION ONLY" warnings
- Interactive confirmations
- Branch verification
- Permission checks

**In Documentation**:
- Prominent warnings
- Clear DO/DON'T sections
- Consistent messaging
- Emergency procedures

**In Code**:
- Separate environment files
- Different port configurations
- Isolated directories
- Service isolation

## Files Created

### Scripts
- `scripts/production/setup-production.sh` - Production setup
- `scripts/production/deploy.sh` - Deployment automation
- `scripts/production/systemd/app-monitor-backend-prod.service`
- `scripts/production/systemd/app-monitor-frontend-prod.service`

### Workflows
- `.github/workflows/deploy-production.yml` - CI/CD pipeline

### Documentation
- `docs/production/PRODUCTION_SETUP.md` - Complete setup guide
- `docs/production/GITHUB_ACTIONS_SETUP.md` - Runner setup
- `docs/sessions/PRODUCTION_SETUP_SESSION_2025-11-06.md` - This document

### Configuration
- Updated `README.md` with dev/prod warnings

## Workflow Overview

### Development Workflow
```
1. Work in ~/Development/app-monitor
2. Create feature branch from staging
3. Make changes, test locally
4. Push to staging
5. Create PR to main
6. Merge triggers production deployment
```

### Production Deployment Workflow
```
1. Code merged to main
2. GitHub Actions triggered
3. Tests run on GitHub runners
4. If tests pass:
   a. Self-hosted runner executes deployment
   b. Pulls main branch
   c. Installs dependencies
   d. Builds application
   e. Restarts services
   f. Runs health checks
5. Deployment verified
```

## Next Steps

### Immediate
1. Kill process on port 5174 to fix dev frontend
2. Test production setup:
   ```bash
   sudo scripts/production/setup-production.sh
   ```

### Short Term
1. Set up GitHub Actions self-hosted runner:
   - Follow `docs/production/GITHUB_ACTIONS_SETUP.md`
   - Configure runner on production machine
   - Test workflow

2. Configure production secrets:
   ```bash
   sudo nano /opt/app-monitor/.env
   # Add ANTHROPIC_API_KEY, etc.
   ```

3. Test deployment:
   - Make small change on staging
   - Create PR to main
   - Merge and verify automatic deployment

### Optional Enhancements
1. Set up environment protection in GitHub
2. Add deployment approvals
3. Configure monitoring/alerts
4. Set up reverse proxy (nginx/caddy) for HTTPS
5. Add backup automation
6. Implement blue-green deployment

## Security Considerations

### Implemented
- Systemd service hardening
- Separate environment files
- Permission restrictions
- Self-hosted runner isolation
- Branch restrictions

### Recommended
- Use HTTPS (reverse proxy)
- Rotate API keys regularly
- Monitor logs for security issues
- Set up firewall rules
- Implement rate limiting
- Add authentication to production

## Testing Checklist

Before going to production:

- [ ] Run setup-production.sh successfully
- [ ] Services start without errors
- [ ] Environment variables configured
- [ ] Self-hosted runner installed and active
- [ ] Manual deployment test passes
- [ ] CI/CD deployment test passes
- [ ] Health checks pass
- [ ] Services survive reboot
- [ ] Rollback procedure tested
- [ ] Monitoring configured

## Known Issues

1. Frontend dev server not running (port conflict)
   - **Fix**: `lsof -ti:5174 | xargs kill -9`

2. Production not yet deployed
   - **Status**: Setup scripts created, not yet executed
   - **Next**: Run setup-production.sh

## Lessons Learned

1. **Clear Separation is Critical**: Preventing accidental production changes requires multiple layers of protection
2. **Documentation Matters**: Comprehensive docs prevent mistakes
3. **Automation Reduces Errors**: CI/CD ensures consistent deployments
4. **Security by Default**: Systemd hardening and permission restrictions
5. **Warnings Everywhere**: Can't have too many warnings about production

## Resources

- [Production Setup Guide](../production/PRODUCTION_SETUP.md)
- [GitHub Actions Setup](../production/GITHUB_ACTIONS_SETUP.md)
- [Deployment Workflow](../../.github/workflows/deploy-production.yml)
- [Systemd Services](../../scripts/production/systemd/)

---

**Session Date**: November 6, 2025
**Status**: Production setup complete, ready for initial deployment
**Next Session**: Set up self-hosted runner and test deployment
