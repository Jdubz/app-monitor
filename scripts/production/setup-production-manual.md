# Manual Production Setup Steps

Since the automated script requires sudo password, here are the exact commands to run manually.

## Step 1: Create Production Directory

```bash
sudo mkdir -p /opt/app-monitor
sudo chown jdubz:jdubz /opt/app-monitor
```

## Step 2: Install Systemd Service Files

```bash
# Copy service files
sudo cp /home/jdubz/Development/app-monitor/scripts/production/systemd/app-monitor-backend-prod.service /etc/systemd/system/
sudo cp /home/jdubz/Development/app-monitor/scripts/production/systemd/app-monitor-frontend-prod.service /etc/systemd/system/

# Replace placeholders
sudo sed -i 's|{PRODUCTION_USER}|jdubz|g' /etc/systemd/system/app-monitor-backend-prod.service
sudo sed -i 's|{PRODUCTION_DIR}|/opt/app-monitor|g' /etc/systemd/system/app-monitor-backend-prod.service
sudo sed -i 's|{PRODUCTION_USER}|jdubz|g' /etc/systemd/system/app-monitor-frontend-prod.service
sudo sed -i 's|{PRODUCTION_DIR}|/opt/app-monitor|g' /etc/systemd/system/app-monitor-frontend-prod.service
```

## Step 3: Create Production Environment File

```bash
cat > /opt/app-monitor/.env << 'EOF'
# PRODUCTION Environment Variables
# ⚠️  DO NOT commit this file to version control
# ⚠️  Update secrets via CI/CD pipeline or manual secure process

NODE_ENV=production
PORT=5050
FRONTEND_PORT=5173

# Add your production secrets here
# ANTHROPIC_API_KEY=your-key-here
# DATABASE_URL=your-db-url-here
EOF

chmod 600 /opt/app-monitor/.env
```

## Step 4: Reload Systemd

```bash
sudo systemctl daemon-reload
```

## Step 5: Enable Services (optional - auto-start on boot)

```bash
sudo systemctl enable app-monitor-backend-prod.service
sudo systemctl enable app-monitor-frontend-prod.service
```

## Next Steps

After running these commands, you can:

1. **Initial Deployment**:
   ```bash
   cd /opt/app-monitor
   git clone https://github.com/Jdubz/app-monitor.git .
   git checkout main
   ./scripts/production/deploy.sh
   ```

2. **Set up GitHub Actions Runner** (see docs/production/GITHUB_ACTIONS_SETUP.md)

3. **Configure Production Secrets**:
   ```bash
   nano /opt/app-monitor/.env
   # Add your API keys and secrets
   ```
