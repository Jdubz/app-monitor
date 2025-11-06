# Production Setup - Quick Start

## Run This Command

Copy and paste this command into your terminal:

```bash
cd ~/Development/app-monitor && ./scripts/production/setup-production-interactive.sh
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

## Next: Set Up GitHub Actions (for CI/CD)

See: [docs/production/GITHUB_ACTIONS_SETUP.md](./docs/production/GITHUB_ACTIONS_SETUP.md)

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
