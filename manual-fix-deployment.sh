#!/bin/bash
# Manual fix for nginx config and deployment

set -e

echo "=== Manual Deployment Fix ==="

# Step 1: Fix nginx config
echo "Step 1: Copying correct nginx config..."
cat /home/jdubz/Development/app-monitor-deployment/nginx-app-monitor.conf | \
    sed 's/server 127.0.0.1:5050;/server 127.0.0.1:5001;/' | \
    sudo tee /etc/nginx/sites-available/app-monitor > /dev/null

# Step 2: Test nginx config
echo "Step 2: Testing nginx config..."
sudo nginx -t

# Step 3: Reload nginx
echo "Step 3: Reloading nginx..."
sudo systemctl reload nginx

# Step 4: Stop old service if running
echo "Step 4: Stopping old service..."
sudo systemctl stop app-monitor-backend@5001.service 2>/dev/null || true
sudo systemctl stop app-monitor-backend@5002.service 2>/dev/null || true

# Step 5: Update current symlink to new release
echo "Step 5: Updating symlink to new release..."
sudo ln -sfn /opt/app-monitor/releases/20251108_183251 /opt/app-monitor/current

# Step 6: Start new service
echo "Step 6: Starting service on port 5001..."
sudo systemctl start app-monitor-backend@5001.service

# Step 7: Wait and check status
echo "Step 7: Waiting for service to start..."
sleep 5
sudo systemctl status app-monitor-backend@5001.service

echo "=== Manual fix complete! ==="
