# Production Setup - Quick Start

## ⚠️ SECURITY NOTICE

Production deployment scripts have been moved outside the repository for security reasons.

## Run This Command

Copy and paste this command into your terminal:

```bash
~/app-monitor-deployment/setup-production-interactive.sh
```

**What it will do:**
1. ✅ Prompt for confirmation (type "yes")
2. 🔐 Ask for your sudo password (once)
3. 📁 Create `/opt/app-monitor` directory
4. 📋 Install systemd services
5. 📥 Clone repository from GitHub
6. 🔐 Create production `.env` file
7. 📦 Install dependencies
8. 🏗️  Build backend and frontend
9. 🚀 Start production services

**Time required:** ~5-10 minutes

---

## After Setup Completes

### 1. Add Your Production Secrets

```bash
nano /opt/app-monitor/.env
```

Add your production API keys:
```env
ANTHROPIC_API_KEY=your-production-key-here
DATABASE_URL=your-production-db-url-here
```

Then restart services:
```bash
sudo systemctl restart app-monitor-backend-prod.service
sudo systemctl restart app-monitor-frontend-prod.service
```

### 2. Verify Services are Running

```bash
sudo systemctl status app-monitor-backend-prod.service
sudo systemctl status app-monitor-frontend-prod.service
```

### 3. Access Production

- **Backend**: http://localhost:5050
- **Frontend**: http://localhost:5173

### 4. View Logs

```bash
# Live logs
sudo journalctl -u app-monitor-backend-prod.service -f
sudo journalctl -u app-monitor-frontend-prod.service -f
```

---

## Optional: Enable Auto-Start on Boot

```bash
sudo systemctl enable app-monitor-backend-prod.service
sudo systemctl enable app-monitor-frontend-prod.service
```

---

## Production Scripts Location

All production deployment scripts are located in:
```
~/app-monitor-deployment/
├── setup-production-interactive.sh
├── setup-production.sh
├── deploy.sh
├── setup-production-manual.md
└── systemd/
    ├── app-monitor-backend-prod.service
    └── app-monitor-frontend-prod.service
```

These scripts are **NOT** stored in the git repository for security reasons.

---

## Common Commands

**Stop services:**
```bash
sudo systemctl stop app-monitor-backend-prod.service
sudo systemctl stop app-monitor-frontend-prod.service
```

**Start services:**
```bash
sudo systemctl start app-monitor-backend-prod.service
sudo systemctl start app-monitor-frontend-prod.service
```

**Restart services:**
```bash
sudo systemctl restart app-monitor-backend-prod.service
sudo systemctl restart app-monitor-frontend-prod.service
```

**View status:**
```bash
sudo systemctl status app-monitor-backend-prod.service
```

---

## ⚠️ Important Reminders

- ✅ **Development**: Work in `~/Development/app-monitor`
- ✅ **Development**: Use `npm run dev -w backend` and `npm run dev -w frontend`
- ❌ **Don't**: Modify `/opt/app-monitor` directly
- ❌ **Don't**: Run dev servers in production directory
- ✅ **Production**: Managed by CI/CD after GitHub Actions setup
