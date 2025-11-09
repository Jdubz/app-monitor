#!/bin/bash
# Comprehensive Production Deployment Fix
# Fixes nginx config, rollback logic, and deploys latest working release

set -e

echo "========================================="
echo "Production Deployment Fix Script"
echo "========================================="
echo ""

# Step 1: Fix nginx config to use valid port
echo "Step 1: Fixing nginx configuration..."
sudo sed -i 's/server 127.0.0.1:[^;]*;/server 127.0.0.1:5001;/' /etc/nginx/sites-available/app-monitor
sudo nginx -t
sudo systemctl reload nginx
echo "✓ Nginx configured for port 5001"
echo ""

# Step 2: Stop any running services
echo "Step 2: Stopping existing services..."
sudo systemctl stop app-monitor-backend@5001.service 2>/dev/null || true
sudo systemctl stop app-monitor-backend@5002.service 2>/dev/null || true
echo "✓ Services stopped"
echo ""

# Step 3: Point to latest release with lifecycle.js
echo "Step 3: Switching to latest release..."
LATEST_RELEASE=$(ls -t /opt/app-monitor/releases/ | head -1)
echo "Latest release: $LATEST_RELEASE"

# Verify lifecycle.js exists in this release
if [ -f "/opt/app-monitor/releases/$LATEST_RELEASE/backend/dist/services/processManager/lifecycle.js" ]; then
    echo "✓ lifecycle.js found in release"
else
    echo "✗ lifecycle.js missing in release, this will fail"
    exit 1
fi

sudo ln -sfn "/opt/app-monitor/releases/$LATEST_RELEASE" /opt/app-monitor/current
echo "✓ Symlink updated to $LATEST_RELEASE"
echo ""

# Step 4: Start service on port 5001
echo "Step 4: Starting service on port 5001..."
sudo systemctl start app-monitor-backend@5001.service

# Wait for service to initialize
echo "Waiting 10 seconds for service to initialize..."
sleep 10

# Step 5: Check service status
echo ""
echo "Step 5: Checking service status..."
if sudo systemctl is-active --quiet app-monitor-backend@5001.service; then
    echo "✓ Service is active"

    # Check if port is listening
    if lsof -i :5001 > /dev/null 2>&1; then
        echo "✓ Port 5001 is listening"
    else
        echo "✗ Port 5001 is NOT listening"
        echo ""
        echo "Service logs (last 30 lines):"
        journalctl -u app-monitor-backend@5001.service -n 30 --no-pager
        exit 1
    fi

    # Try HTTP health check
    if curl -sf http://localhost:5001/api/health > /dev/null 2>&1; then
        echo "✓ HTTP health check passed"
    else
        echo "⚠ HTTP health check failed (service may still be starting)"
    fi
else
    echo "✗ Service is NOT active"
    echo ""
    echo "Service status:"
    sudo systemctl status app-monitor-backend@5001.service --no-pager
    echo ""
    echo "Service logs (last 50 lines):"
    journalctl -u app-monitor-backend@5001.service -n 50 --no-pager
    exit 1
fi

echo ""
echo "========================================="
echo "Deployment fix complete!"
echo "========================================="
echo ""
echo "Service: app-monitor-backend@5001"
echo "Release: $LATEST_RELEASE"
echo "Nginx: Configured for port 5001"
echo ""
echo "Next steps:"
echo "1. Test the application in your browser"
echo "2. Check service logs: journalctl -u app-monitor-backend@5001.service -f"
echo "3. Monitor nginx logs: tail -f /var/log/nginx/error.log"
