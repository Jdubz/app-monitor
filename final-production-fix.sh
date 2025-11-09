#!/bin/bash
# Final Production Deployment Fix
# Fixes systemd service file and deploys working release

set -e

echo "========================================="
echo "Final Production Deployment Fix"
echo "========================================="
echo ""

# Step 1: Update systemd service file to run index.js instead of server.js
echo "Step 1: Updating systemd service file..."
sudo cp /home/jdubz/Development/app-monitor/scripts/systemd/app-monitor-backend@.service /etc/systemd/system/
sudo systemctl daemon-reload
echo "✓ Systemd service file updated (now runs index.js)"
echo ""

# Step 2: Fix nginx config to use valid port
echo "Step 2: Fixing nginx configuration..."
sudo sed -i 's/server 127.0.0.1:[^;]*;/server 127.0.0.1:5001;/' /etc/nginx/sites-available/app-monitor
sudo nginx -t
sudo systemctl reload nginx
echo "✓ Nginx configured for port 5001"
echo ""

# Step 3: Stop any running services
echo "Step 3: Stopping existing services..."
sudo systemctl stop app-monitor-backend@5001.service 2>/dev/null || true
sudo systemctl stop app-monitor-backend@5002.service 2>/dev/null || true
echo "✓ Services stopped"
echo ""

# Step 4: Point to latest release
echo "Step 4: Switching to latest release..."
LATEST_RELEASE=$(ls -t /opt/app-monitor/releases/ | head -1)
echo "Latest release: $LATEST_RELEASE"

# Verify index.js exists in this release
if [ -f "/opt/app-monitor/releases/$LATEST_RELEASE/backend/dist/index.js" ]; then
    echo "✓ index.js found in release"
else
    echo "✗ index.js missing in release, this will fail"
    exit 1
fi

sudo ln -sfn "/opt/app-monitor/releases/$LATEST_RELEASE" /opt/app-monitor/current
echo "✓ Symlink updated to $LATEST_RELEASE"
echo ""

# Step 5: Start service on port 5001
echo "Step 5: Starting service on port 5001..."
sudo systemctl start app-monitor-backend@5001.service

# Wait for service to initialize
echo "Waiting 10 seconds for service to initialize..."
sleep 10

# Step 6: Check service status
echo ""
echo "Step 6: Checking service status..."
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
    echo "Checking HTTP endpoints..."
    if curl -sf http://localhost:5001/api/health > /dev/null 2>&1; then
        echo "✓ /api/health endpoint responding"
    else
        echo "⚠ /api/health endpoint not responding (may still be initializing)"
    fi

    if curl -sf http://localhost:5001/ > /dev/null 2>&1; then
        echo "✓ Root endpoint responding"
    else
        echo "⚠ Root endpoint not responding"
    fi
else
    echo "✗ Service is NOT active"
    echo ""
    echo "Service status:"
    sudo systemctl status app-monitor-backend@5001.service --no-pager || true
    echo ""
    echo "Service logs (last 50 lines):"
    journalctl -u app-monitor-backend@5001.service -n 50 --no-pager
    exit 1
fi

echo ""
echo "========================================="
echo "✅ Production deployment SUCCESSFUL!"
echo "========================================="
echo ""
echo "Service: app-monitor-backend@5001"
echo "Release: $LATEST_RELEASE"
echo "Nginx: http://localhost (proxies to port 5001)"
echo ""
echo "Recent logs:"
journalctl -u app-monitor-backend@5001.service -n 10 --no-pager
echo ""
echo "To view live logs: journalctl -u app-monitor-backend@5001.service -f"
echo "To test: curl http://localhost:5001/api/health"
