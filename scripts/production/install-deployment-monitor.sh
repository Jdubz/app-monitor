#!/bin/bash
#
# Install Deployment Lock Monitoring System
# Sets up systemd timer for automatic deadlock detection and recovery
#
# Usage: sudo ./install-deployment-monitor.sh
#

set -euo pipefail

# Must run as root for systemd setup
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run as root (sudo)"
    exit 1
fi

SCRIPTS_DIR="/opt/app-monitor/scripts"
SYSTEMD_SYSTEM_DIR="/etc/systemd/system"
LOG_DIR="/var/log/app-monitor"

echo "📦 Installing Deployment Lock Monitoring System"
echo "================================================"

# Create log directory
echo "Creating log directory..."
mkdir -p "${LOG_DIR}"
chown jdubz:jdubz "${LOG_DIR}"
chmod 755 "${LOG_DIR}"

# Install systemd service and timer
echo "Installing systemd units..."
cp "${SCRIPTS_DIR}/systemd/deployment-lock-monitor.service" "${SYSTEMD_SYSTEM_DIR}/"
cp "${SCRIPTS_DIR}/systemd/deployment-lock-monitor.timer" "${SYSTEMD_SYSTEM_DIR}/"

# Reload systemd
echo "Reloading systemd daemon..."
systemctl daemon-reload

# Enable and start timer
echo "Enabling deployment lock monitor timer..."
systemctl enable deployment-lock-monitor.timer
systemctl start deployment-lock-monitor.timer

# Show status
echo ""
echo "✅ Installation complete!"
echo ""
echo "Status:"
systemctl status deployment-lock-monitor.timer --no-pager || true
echo ""
echo "Commands:"
echo "  View timer status:  systemctl status deployment-lock-monitor.timer"
echo "  View monitor logs:  journalctl -u deployment-lock-monitor.service -f"
echo "  Manual check:       ${SCRIPTS_DIR}/deployment-lock-manager.sh check"
echo "  Manual cleanup:     ${SCRIPTS_DIR}/deployment-lock-manager.sh cleanup"
echo "  View log file:      tail -f ${LOG_DIR}/deployment-lock-monitor.log"
