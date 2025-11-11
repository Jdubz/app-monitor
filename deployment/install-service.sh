#!/bin/bash
# Install app-monitor as a system service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔧 Installing App Monitor System Service..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root (use sudo)"
  exit 1
fi

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
  echo "📦 Installing PM2..."
  npm install -g pm2
fi

# Create deployment directory
mkdir -p /opt/app-monitor/deployment
mkdir -p /opt/app-monitor/logs

# Copy PM2 config
echo "📋 Copying PM2 ecosystem config..."
cp "$SCRIPT_DIR/ecosystem.config.js" /opt/app-monitor/deployment/

# Copy systemd service file
echo "📋 Installing systemd service..."
cp "$SCRIPT_DIR/app-monitor.service" /etc/systemd/system/

# Stop any existing processes
echo "🛑 Stopping any existing processes..."
pkill -f "node.*dist/index.js" || true
pm2 delete app-monitor-backend 2>/dev/null || true

# Reload systemd
echo "🔄 Reloading systemd..."
systemctl daemon-reload

# Enable service
echo "✅ Enabling app-monitor service..."
systemctl enable app-monitor

echo ""
echo "✅ Installation complete!"
echo ""
echo "📝 Next steps:"
echo "  1. sudo systemctl start app-monitor     # Start the service"
echo "  2. sudo systemctl status app-monitor    # Check status"
echo "  3. sudo journalctl -u app-monitor -f   # View logs"
echo ""
echo "🔧 Management commands:"
echo "  sudo systemctl restart app-monitor      # Restart service"
echo "  sudo systemctl stop app-monitor         # Stop service"
echo "  pm2 logs app-monitor-backend            # View PM2 logs"
echo "  pm2 monit                                # Monitor processes"
echo ""
